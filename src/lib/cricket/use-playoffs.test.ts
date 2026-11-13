import { expect, it, vi, afterEach } from "vitest";
import { makeDraw, type PlayoffContext } from "./playoffs";
import { matchFixture, deliveryFixture, tournamentFixture } from "@/test/tournament-fixtures";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
import { syncPlayoffs } from "./use-playoffs";
afterEach(() => vi.clearAllMocks());
it("only syncs approved draws and supplies engine-derived semifinal winners", async () => {
  const ctx: PlayoffContext = {
    tournament: tournamentFixture(),
    teams: [],
    groups: [],
    token: "revision-token",
    playoff: {
      tournament_id: "tour",
      revision: 1,
      approved: false,
      draw: makeDraw(["a", "b", "c", "d"], "single"),
    },
    matches: [],
    deliveries: [],
  };
  await syncPlayoffs(ctx);
  expect(rpc).not.toHaveBeenCalled();
  ctx.playoff!.approved = true;
  ctx.matches = [
    matchFixture({
      id: "s1",
      rules: { playoffNode: "r1-1" },
      team_a_id: "a",
      team_b_id: "d",
      balls_per_over: 1,
      overs: 1,
    }),
    matchFixture({
      id: "s2",
      rules: { playoffNode: "r1-2" },
      team_a_id: "b",
      team_b_id: "c",
      balls_per_over: 1,
      overs: 1,
    }),
  ];
  ctx.deliveries = ctx.matches.flatMap((m) => [
    deliveryFixture({ id: m.id + "1", match_id: m.id, runs_bat: 1 }),
    deliveryFixture({ id: m.id + "2", match_id: m.id, innings: 2, runs_bat: 2 }),
  ]);
  rpc.mockResolvedValue({ data: 1, error: null });
  expect(await syncPlayoffs(ctx)).toBe(1);
  expect(rpc).toHaveBeenCalledWith("sync_playoff_fixtures", {
    _t: "tour",
    _token: "revision-token",
    _winners: { "r1-1": "d", "r1-2": "c" },
  });
});
