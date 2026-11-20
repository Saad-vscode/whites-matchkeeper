import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ rpc: vi.fn(), verify: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: api.rpc } }));
vi.mock("@/lib/feature-access", () => ({
  useFeatureAccess: () => ({ allows: () => false }),
  readFeatureAccess: api.verify,
}));
import { useScoring } from "@/lib/cricket/use-scoring";
import { draftKey, loadDraft, saveDraft } from "@/lib/cricket/offline";
import { matchFixture, deliveryFixture } from "@/test/tournament-fixtures";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it("blocks new offline scoring but preserves and synchronizes the existing durable queue", async () => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  let online = false;
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
  const match = matchFixture({ status: "live" });
  const ball = deliveryFixture();
  const key = draftKey("scorer", match.id);
  saveDraft(key, {
    base: { match, deliveries: [] },
    queue: [{ id: "previous-operation", kind: "ball", delivery: ball, patch: {}, reason: "" }],
  });
  const snapshot = { match: { ...match, score_revision: 1 }, deliveries: [ball] };
  api.rpc.mockResolvedValue({ data: snapshot, error: null });
  const { result } = renderHook(() => useScoring(match.id, "scorer"));
  await waitFor(() => expect(result.current.pending).toBe(1));
  let accepted = true;
  await act(async () => {
    accepted = await result.current.mutate({
      kind: "ball",
      delivery: { ...ball, id: "new-ball", seq: 2 },
      patch: {},
      reason: "",
    });
  });
  expect(accepted).toBe(false);
  expect(loadDraft(key)?.queue.map((op) => op.id)).toEqual(["previous-operation"]);
  online = true;
  act(() => window.dispatchEvent(new Event("online")));
  await waitFor(() => expect(result.current.pending).toBe(0));
  expect(api.rpc).toHaveBeenCalledWith(
    "apply_score_operation",
    expect.objectContaining({ _id: "previous-operation" }),
  );
  expect(result.current.deliveries).toEqual([ball]);
  api.verify.mockRejectedValue(new Error("Connection lost"));
  await act(async () => {
    accepted = await result.current.mutate({
      kind: "state",
      delivery: null,
      patch: { status: "paused" },
      reason: "",
    });
  });
  expect(accepted).toBe(false);
  expect(loadDraft(key)?.queue).toEqual([]);
});
