import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { deliveryFixture, matchFixture } from "@/test/tournament-fixtures";
import { draftKey, loadDraft, replay, saveDraft, type ScoreOperation, type ScoreSnapshot } from "./offline";
import type { ScoringTransport } from "./scoring-transport";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("@/lib/feature-access", () => ({
  useFeatureAccess: () => ({ allows: () => true }), readFeatureAccess: vi.fn(),
}));
vi.mock("@/lib/global-settings", () => ({ maintenanceAllowsScoring: () => true }));
import { useScoring } from "./use-scoring";

const base: ScoreSnapshot = {
  match: matchFixture({ status: "live", live: { innings: 1 }, score_revision: 4 }), deliveries: [],
};
const ball = deliveryFixture({ runs_bat: 4 });
const op: ScoreOperation = { id: "durable-operation", kind: "ball", delivery: ball, patch: {}, reason: "" };
const accepted: ScoreSnapshot = { match: { ...base.match, score_revision: 5 }, deliveries: [ball] };
const key = draftKey("scorer", base.match.id);
let online = true;

function fakeTransport() {
  return {
    readSnapshot: vi.fn<ScoringTransport["readSnapshot"]>().mockResolvedValue({ data: base, error: null }),
    applyOperation: vi.fn<ScoringTransport["applyOperation"]>().mockResolvedValue({ data: accepted, error: null }),
  };
}
beforeEach(() => {
  online = true;
  rpc.mockReset();
  // Any accidental use of the production adapter fails locally, never reaches a database.
  rpc.mockRejectedValue(new Error("Unexpected default transport"));
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
  });
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("keeps the default Supabase adapter compatible with existing two-argument callers", async () => {
  rpc.mockResolvedValue({ data: base, error: null });
  const { result } = renderHook(() => useScoring(base.match.id, "scorer"));
  await waitFor(() => expect(result.current.match).toEqual(base.match));
  expect(rpc).toHaveBeenCalledWith("scoring_snapshot", { _match: base.match.id });
  expect(loadDraft(key)).toEqual({ base, queue: [] });
});

it("reads and persists injected snapshots without calling Supabase", async () => {
  const transport = fakeTransport();
  const { result } = renderHook(() => useScoring(base.match.id, "scorer", transport));
  await waitFor(() => expect(result.current.match).toEqual(base.match));
  expect(transport.readSnapshot).toHaveBeenCalledExactlyOnceWith(base.match.id);
  expect(loadDraft(key)).toEqual({ base, queue: [] });
  expect(rpc).not.toHaveBeenCalled();
});

it("retains a pending operation on network failure and retries the same ID/revision after a lost response", async () => {
  saveDraft(key, { base, queue: [op] });
  const transport = fakeTransport();
  // Server committed, but its first response was lost. Retry returns that same receipt snapshot.
  transport.applyOperation.mockRejectedValueOnce(new Error("Response lost"));
  const { result } = renderHook(() => useScoring(base.match.id, "scorer", transport));
  await waitFor(() => expect(result.current.error).toBe("Response lost"));
  expect(loadDraft(key)).toEqual({ base, queue: [op] });
  expect(result.current.pending).toBe(1);
  await act(async () => { await result.current.refetch(); });
  expect(transport.applyOperation.mock.calls).toEqual([
    [base.match.id, 4, op], [base.match.id, 4, op],
  ]);
  expect(result.current.deliveries).toEqual([ball]);
  expect(result.current.pending).toBe(0);
  expect(loadDraft(key)).toEqual({ base: accepted, queue: [] });
});

it("accepts a duplicate-operation response without counting its delivery twice", async () => {
  saveDraft(key, { base: accepted, queue: [op] });
  const transport = fakeTransport();
  const { result } = renderHook(() => useScoring(base.match.id, "scorer", transport));
  await waitFor(() => expect(result.current.pending).toBe(0));
  expect(transport.applyOperation).toHaveBeenCalledExactlyOnceWith(base.match.id, 5, op);
  expect(result.current.deliveries).toEqual([ball]);
  expect(loadDraft(key)?.queue).toEqual([]);
});

it.each([
  { message: "SCORE_CONFLICT: refresh required", code: "P0001" },
  { message: "duplicate sequence", code: "23505" },
])("stops replay on conflict $code without losing the queue", async (error) => {
  const next = { ...op, id: "next", delivery: { ...ball, id: "ball-2", seq: 2 } };
  saveDraft(key, { base, queue: [op, next] });
  const transport = fakeTransport();
  transport.applyOperation.mockResolvedValue({ data: null, error });
  const { result } = renderHook(() => useScoring(base.match.id, "scorer", transport));
  await waitFor(() => expect(result.current.conflict).toBe(true));
  await act(async () => { await result.current.refetch(); });
  expect(transport.applyOperation).toHaveBeenCalledTimes(1);
  expect(result.current.error).toBeNull();
  expect(loadDraft(key)).toEqual({ base, queue: [op, next] });
  expect(await result.current.mutate({ kind: "state", delivery: null, patch: {}, reason: "" })).toBe(false);
});

it("replays in queue order using each acknowledged revision, including undo", async () => {
  const undo: ScoreOperation = { id: "undo", kind: "undo", delivery: ball, patch: {}, reason: "" };
  const undone = { match: { ...base.match, score_revision: 6 }, deliveries: [] };
  saveDraft(key, { base, queue: [op, undo] });
  const transport = fakeTransport();
  transport.applyOperation.mockResolvedValueOnce({ data: accepted, error: null })
    .mockResolvedValueOnce({ data: undone, error: null });
  const { result } = renderHook(() => useScoring(base.match.id, "scorer", transport));
  await waitFor(() => expect(transport.applyOperation).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(result.current.pending).toBe(0));
  expect(transport.applyOperation.mock.calls).toEqual([[base.match.id, 4, op], [base.match.id, 5, undo]]);
  expect(loadDraft(key)).toEqual({ base: undone, queue: [] });
  expect(result.current.deliveries).toEqual([]);
});

it("persists offline scoring and undo across remount without any transport requests", async () => {
  online = false;
  saveDraft(key, { base, queue: [] });
  vi.spyOn(crypto, "randomUUID").mockReturnValueOnce("00000000-0000-4000-8000-000000000001")
    .mockReturnValueOnce("00000000-0000-4000-8000-000000000002");
  const transport = fakeTransport();
  const hook = renderHook(() => useScoring(base.match.id, "scorer", transport));
  await act(async () => {
    expect(await hook.result.current.mutate({ ...op, kind: "ball" })).toBe(true);
  });
  expect(hook.result.current.deliveries).toEqual([ball]);
  await act(async () => {
    expect(await hook.result.current.mutate({ kind: "undo", delivery: ball, patch: {}, reason: "" })).toBe(true);
  });
  const saved = loadDraft(key)!;
  expect(saved.queue.map(x => x.kind)).toEqual(["ball", "undo"]);
  expect(saved.queue.map(x => x.id)).toEqual([
    "00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002",
  ]);
  expect(replay(saved.base, saved.queue).deliveries).toEqual([]);
  hook.unmount();
  const resumed = renderHook(() => useScoring(base.match.id, "scorer", transport));
  expect(resumed.result.current.pending).toBe(2);
  expect(resumed.result.current.deliveries).toEqual([]);
  expect(transport.readSnapshot).not.toHaveBeenCalled();
  expect(transport.applyOperation).not.toHaveBeenCalled();
});

it("preserves backend failure messages and keeps pending operations", async () => {
  saveDraft(key, { base, queue: [op] });
  const transport = fakeTransport();
  transport.applyOperation.mockResolvedValue({ data: null, error: { message: "Not allowed", code: "42501" } });
  const { result } = renderHook(() => useScoring(base.match.id, "scorer", transport));
  await waitFor(() => expect(result.current.error).toBe("Not allowed"));
  expect(result.current.conflict).toBe(false);
  expect(loadDraft(key)?.queue).toEqual([op]);
});

it("keeps five-second synchronization timing", async () => {
  vi.useFakeTimers();
  const transport = fakeTransport();
  renderHook(() => useScoring(base.match.id, "scorer", transport));
  await act(async () => {});
  expect(transport.readSnapshot).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(4999); });
  expect(transport.readSnapshot).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(transport.readSnapshot).toHaveBeenCalledTimes(2);
});

it("uses the injected snapshot transport for server recovery and retains a draft on read error", async () => {
  const transport = fakeTransport();
  const { result } = renderHook(() => useScoring(base.match.id, "scorer", transport));
  await waitFor(() => expect(result.current.match).toEqual(base.match));
  transport.readSnapshot.mockResolvedValueOnce({ data: null, error: { message: "Read unavailable" } });
  await act(async () => { await result.current.useServer(); });
  expect(result.current.error).toBe("Read unavailable");
  expect(loadDraft(key)).toEqual({ base, queue: [] });
  transport.readSnapshot.mockResolvedValueOnce({ data: accepted, error: null });
  await act(async () => { await result.current.useServer(); });
  expect(result.current.deliveries).toEqual([ball]);
  expect(result.current.error).toBeNull();
  expect(rpc).not.toHaveBeenCalled();
});
