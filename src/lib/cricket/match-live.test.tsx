import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ rows: {} as Record<string, unknown>, callbacks: {} as Record<string, (p: unknown) => void>, pending: null as Promise<unknown> | null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      let id = "";
      const q = {
        select: () => q, eq: (_: string, value: string) => { id = value; return q; }, order: () => q,
        maybeSingle: () => mock.pending ?? Promise.resolve({ data: mock.rows[id], error: null }),
        then: (resolve: (value: unknown) => void) => Promise.resolve({ data: [], error: null }).then(resolve),
      };
      return q;
    },
    channel: () => {
      const channel = {
        on: (_: string, filter: {table: string; filter: string}, cb: (p: unknown) => void) => { mock.callbacks[filter.table + filter.filter] = cb; return channel; },
        subscribe: (cb: (status: string) => void) => { mock.callbacks["connection"] = value => cb(String(value)); return channel; },
      };
      return channel;
    },
    removeChannel: vi.fn(),
  },
}));
import { useLiveMatch } from "./match";
import { matchFixture } from "@/test/tournament-fixtures";
beforeEach(() => { mock.rows = { one: matchFixture({ id: "one" }), two: matchFixture({ id: "two" }) }; mock.callbacks = {}; mock.pending = null; });
afterEach(() => { cleanup(); vi.useRealTimers(); });
it("receives selections from match updates with no deliveries", async () => {
  const { result } = renderHook(() => useLiveMatch("one"));
  await waitFor(() => expect(result.current.match?.id).toBe("one"));
  act(() => mock.callbacks["matchesid=eq.one"]!({ eventType: "UPDATE", new: matchFixture({ id: "one", live: { innings: 1, striker: "Sam", nonStriker: "Alex", bowler: "Lee" } }) }));
  expect(result.current.match?.live).toEqual({ innings: 1, striker: "Sam", nonStriker: "Alex", bowler: "Lee" });
  expect(result.current.deliveries).toEqual([]);
});
it("ignores a previous match request after switching", async () => {
  let resolve!: (value: unknown) => void;
  mock.pending = new Promise(r => { resolve = r; });
  const { result, rerender } = renderHook(({ id }) => useLiveMatch(id), { initialProps: { id: "one" } });
  mock.pending = null;
  rerender({ id: "two" });
  await waitFor(() => expect(result.current.match?.id).toBe("two"));
  await act(async () => resolve({ data: mock.rows["one"], error: null }));
  expect(result.current.match?.id).toBe("two");
});
it("polls to recover missed state-only updates", async () => {
  vi.useFakeTimers();
  const { result } = renderHook(() => useLiveMatch("one"));
  await act(async () => { await Promise.resolve(); });
  mock.rows["one"] = matchFixture({ id: "one", toss_winner: "B", live: { striker: "Sam" } });
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(result.current.match?.toss_winner).toBe("B");
  expect(result.current.match?.live).toEqual({ striker: "Sam" });
});
it("waits for the reconnect snapshot and does not mark a closed stream live", async () => {
  const { result } = renderHook(() => useLiveMatch("one"));
  await waitFor(() => expect(result.current.match?.id).toBe("one"));
  let resolve!: (value: unknown) => void;
  mock.pending = new Promise(r => { resolve = r; });
  act(() => mock.callbacks["connection"]!("SUBSCRIBED"));
  expect(result.current.conn).toBe("connecting");
  act(() => mock.callbacks["connection"]!("CLOSED"));
  await act(async () => resolve({data: mock.rows["one"], error:null}));
  expect(result.current.conn).toBe("offline");
  mock.pending = null;
  await act(async () => mock.callbacks["connection"]!("SUBSCRIBED"));
  await waitFor(() => expect(result.current.conn).toBe("live"));
});
