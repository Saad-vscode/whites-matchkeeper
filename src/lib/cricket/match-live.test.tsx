import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  rows: {} as Record<string, unknown>,
  deliveries: {} as Record<string, unknown[]>,
  rpc: vi.fn(),
  from: vi.fn(),
  callbacks: {} as Record<string, (p: unknown) => void>,
  pending: null as Promise<unknown> | null,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: mock.rpc,
    from: mock.from,
    channel: () => {
      const channel = {
        on: (_: string, filter: { table: string; filter: string }, cb: (p: unknown) => void) => {
          mock.callbacks[filter.table + filter.filter] = cb;
          return channel;
        },
        subscribe: (cb: (status: string) => void) => {
          mock.callbacks["connection"] = (value) => cb(String(value));
          return channel;
        },
      };
      return channel;
    },
    removeChannel: vi.fn(),
  },
}));
import { useLiveMatch } from "./match";
import { deliveryFixture, matchFixture } from "@/test/tournament-fixtures";
const snapshot = (id: string) => ({
  data: mock.rows[id] ? { match: mock.rows[id], deliveries: mock.deliveries[id] ?? [] } : null,
  error: null,
});
beforeEach(() => {
  mock.rows = { one: matchFixture({ id: "one" }), two: matchFixture({ id: "two" }) };
  mock.deliveries = {};
  mock.callbacks = {};
  mock.pending = null;
  mock.rpc.mockReset().mockImplementation((name: string, args: { _match: string }) => {
    expect(name).toBe("read_live_match");
    return mock.pending ?? Promise.resolve(snapshot(args._match));
  });
  mock.from.mockReset().mockImplementation((table: string) => {
    expect(["matches", "deliveries"]).toContain(table);
    let id = "";
    const q = {
      select: () => q,
      eq: (_: string, value: string) => {
        id = value;
        return q;
      },
      order: () => q,
      maybeSingle: () => Promise.resolve({ data: mock.rows[id], error: null }),
      then: (resolve: (value: unknown) => void) =>
        Promise.resolve({ data: mock.deliveries[id] ?? [], error: null }).then(resolve),
    };
    return q;
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("clears the previously visible score when a public access check returns no match", async () => {
  const { result } = renderHook(() => useLiveMatch("one"));
  await waitFor(() => expect(result.current.match?.id).toBe("one"));
  mock.rows["one"] = null;
  await act(async () => {
    await result.current.refetch();
  });
  expect(result.current.match).toBeNull();
  expect(result.current.derived).toBeNull();
  expect(result.current.deliveries).toEqual([]);
  expect(result.current.error).toBe("Match not found or no longer public");
});
it("receives selections from match updates with no deliveries", async () => {
  const { result } = renderHook(() => useLiveMatch("one"));
  await waitFor(() => expect(result.current.match?.id).toBe("one"));
  mock.rows["one"] = matchFixture({
    id: "one",
    live: { innings: 1, striker: "Sam", nonStriker: "Alex", bowler: "Lee" },
  });
  await act(async () => mock.callbacks["matchesid=eq.one"]!({ eventType: "UPDATE" }));
  expect(mock.rpc).toHaveBeenLastCalledWith("read_live_match", { _match: "one" });
  expect(mock.from).not.toHaveBeenCalled();
  expect(result.current.match?.live).toEqual({
    innings: 1,
    striker: "Sam",
    nonStriker: "Alex",
    bowler: "Lee",
  });
  expect(result.current.deliveries).toEqual([]);
});
it("ignores a previous match request after switching", async () => {
  let resolve!: (value: unknown) => void;
  mock.pending = new Promise((r) => {
    resolve = r;
  });
  const { result, rerender } = renderHook(({ id }) => useLiveMatch(id), {
    initialProps: { id: "one" },
  });
  mock.pending = null;
  rerender({ id: "two" });
  await waitFor(() => expect(result.current.match?.id).toBe("two"));
  await act(async () => resolve(snapshot("one")));
  expect(result.current.match?.id).toBe("two");
});
it("polls to recover missed state-only updates", async () => {
  vi.useFakeTimers();
  const { result } = renderHook(() => useLiveMatch("one"));
  await act(async () => {
    await Promise.resolve();
  });
  mock.rows["one"] = matchFixture({ id: "one", toss_winner: "B", live: { striker: "Sam" } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(result.current.match?.toss_winner).toBe("B");
  expect(result.current.match?.live).toEqual({ striker: "Sam" });
});
it("waits for a reconnect snapshot and recovers through HTTP even if realtime closes", async () => {
  const { result } = renderHook(() => useLiveMatch("one"));
  await waitFor(() => expect(result.current.match?.id).toBe("one"));
  let resolve!: (value: unknown) => void;
  mock.pending = new Promise((r) => {
    resolve = r;
  });
  act(() => mock.callbacks["connection"]!("SUBSCRIBED"));
  expect(result.current.conn).toBe("connecting");
  act(() => mock.callbacks["connection"]!("CLOSED"));
  expect(result.current.conn).toBe("offline");
  mock.rows["one"] = matchFixture({ id: "one", live: { striker: "Sam" } });
  await act(async () => resolve(snapshot("one")));
  // "live" means a fresh snapshot is available, not that the realtime transport is open.
  expect(result.current.conn).toBe("live");
  expect(result.current.match?.live).toEqual({ striker: "Sam" });
  mock.pending = null;
  await act(async () => mock.callbacks["connection"]!("SUBSCRIBED"));
  await waitFor(() => expect(result.current.conn).toBe("live"));
});

it("refreshes both match and delivery state after a realtime delivery event", async () => {
  const { result } = renderHook(() => useLiveMatch("one"));
  await waitFor(() => expect(result.current.match?.id).toBe("one"));
  mock.deliveries["one"] = [deliveryFixture({ runs_bat: 4 })];
  await act(async () => mock.callbacks["deliveriesmatch_id=eq.one"]!({ eventType: "INSERT" }));
  expect(result.current.deliveries).toEqual(mock.deliveries["one"]);
  expect(result.current.derived?.first.runs).toBe(4);
});
it("uses the table fallback only when the snapshot RPC is unavailable", async () => {
  mock.rpc.mockResolvedValue({
    data: null,
    error: { code: "PGRST202", message: "Function not found" },
  });
  mock.deliveries["one"] = [deliveryFixture({ runs_bat: 6 })];
  const { result } = renderHook(() => useLiveMatch("one"));
  await waitFor(() => expect(result.current.match?.id).toBe("one"));
  expect(result.current.derived?.first.runs).toBe(6);
  expect(mock.from.mock.calls.map(([table]) => table)).toEqual(["matches", "deliveries"]);
  expect(result.current.error).toBeNull();
});
it("clears restricted data on an authorization error without attempting a fallback", async () => {
  mock.deliveries["one"] = [deliveryFixture()];
  const { result } = renderHook(() => useLiveMatch("one"));
  await waitFor(() => expect(result.current.deliveries).toHaveLength(1));
  mock.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "Access revoked" } });
  await act(async () => {
    await result.current.refetch();
  });
  expect(result.current.match).toBeNull();
  expect(result.current.deliveries).toEqual([]);
  expect(result.current.conn).toBe("offline");
  expect(mock.from).not.toHaveBeenCalled();
});
it("retains the last snapshot on a transient failure and refreshes when back online", async () => {
  const { result } = renderHook(() => useLiveMatch("one"));
  await waitFor(() => expect(result.current.match?.id).toBe("one"));
  mock.rpc.mockResolvedValueOnce({ data: null, error: { message: "Network unavailable" } });
  await act(async () => {
    await result.current.refetch();
  });
  expect(result.current.match?.id).toBe("one");
  expect(result.current.conn).toBe("offline");
  expect(result.current.error).toBe("Network unavailable");
  mock.rows["one"] = matchFixture({ id: "one", live: { striker: "Sam" } });
  await act(async () => {
    window.dispatchEvent(new Event("online"));
  });
  expect(result.current.match?.live).toEqual({ striker: "Sam" });
  expect(result.current.conn).toBe("live");
  expect(result.current.error).toBeNull();
});
