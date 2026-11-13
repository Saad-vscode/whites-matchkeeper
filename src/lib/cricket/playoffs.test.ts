import { describe, expect, it } from "vitest";
import {
  makeDraw,
  resolveDraw,
  groupRoundFinished,
  qualificationGroups,
  separateGroupOpponents,
  type PlayoffContext,
} from "./playoffs";
import {
  matchFixture,
  deliveryFixture,
  teamFixture,
  tournamentFixture,
} from "@/test/tournament-fixtures";
const match = (id: string, a: string, b: string) =>
  matchFixture({
    id,
    team_a_id: a,
    team_b_id: b,
    overs: 1,
    balls_per_over: 1,
    rules: { playoffNode: id, tournamentStage: { kind: "other", title: id } },
  });
const winB = (id: string) => [
  deliveryFixture({ id: id + "1", match_id: id, runs_bat: 1 }),
  deliveryFixture({ id: id + "2", match_id: id, innings: 2, runs_bat: 2 }),
];
describe("playoff progression", () => {
  it("separates three-group opponents while preserving the top two byes", () => {
    const groups = [
      { team_ids: ["a1", "a2"] },
      { team_ids: ["b1", "b2"] },
      { team_ids: ["c1", "c2"] },
    ];
    const seeds = separateGroupOpponents(["a1", "b1", "c1", "a2", "b2", "c2"], groups);
    const states = resolveDraw(makeDraw(seeds, "single"), [], []);
    expect(states.filter((s) => s.status === "bye").map((s) => s.winner)).toEqual(["a1", "b1"]);
    for (const s of states.filter((s) => s.status === "ready")) expect(s.a![0]).not.toBe(s.b![0]);
  });
  it("crosses the two groups and waits for both semifinal results", () => {
    const draw = makeDraw(["A1", "B1", "A2", "B2"], "single");
    expect(draw.nodes[0]).toMatchObject({ a: { team: "A1" }, b: { team: "B2" } });
    expect(draw.nodes[1]).toMatchObject({ a: { team: "B1" }, b: { team: "A2" } });
    const games = [match("r1-1", "A1", "B2"), match("r1-2", "B1", "A2")];
    expect(resolveDraw(draw, games, winB("r1-1")).at(-1)).toMatchObject({
      a: "B2",
      b: null,
      status: "waiting",
    });
    expect(resolveDraw(draw, games, [...winB("r1-1"), ...winB("r1-2")]).at(-1)).toMatchObject({
      a: "B2",
      b: "A2",
      status: "ready",
    });
  });
  it("routes Qualifier 1 loser through Qualifier 2 and winner directly to the final", () => {
    const draw = makeDraw(["a", "b", "c", "d"], "ipl");
    const games = [match("q1", "a", "b"), match("eliminator", "c", "d")],
      balls = [...winB("q1"), ...winB("eliminator")];
    expect(resolveDraw(draw, games, balls)[2]).toMatchObject({ a: "a", b: "d", status: "ready" });
    expect(resolveDraw(draw, games, balls)[3]).toMatchObject({
      a: "b",
      b: null,
      status: "waiting",
    });
    games.push(match("q2", "a", "d"));
    balls.push(...winB("q2"));
    expect(resolveDraw(draw, games, balls)[3]).toMatchObject({ a: "b", b: "d", status: "ready" });
  });
  it.each(Array.from({ length: 31 }, (_, i) => i + 2))(
    "builds a valid %i-team knockout with byes but no empty match",
    (n) => {
      const seeds = Array.from({ length: n }, (_, i) => `team${i + 1}`),
        draw = makeDraw(seeds, "single");
      const states = resolveDraw(draw, [], []);
      expect(states.filter((s) => s.status === "bye")).toHaveLength(
        2 ** Math.ceil(Math.log2(n)) - n,
      );
      expect(draw.nodes.filter((node) => !node.a && !node.b)).toHaveLength(0);
      expect(draw.nodes.at(-1)?.id).toBe("final");
      const inserted = draw.nodes
        .flatMap((node) => [node.a, node.b])
        .flatMap((s) => (s && "team" in s ? [s.team] : []));
      expect(new Set(inserted).size).toBe(n);
    },
  );
  it("requires a revision-bound organiser decision for a tie", () => {
    const draw = makeDraw(["a", "b"], "single"),
      m = match("final", "a", "b"),
      balls = winB("final");
    balls[1]!.runs_bat = 1;
    expect(resolveDraw(draw, [m], balls)[0]?.status).toBe("decision");
    draw.decisions["final"] = { team: "b", reason: "Tie-break won", revision: 0 };
    expect(resolveDraw(draw, [m], balls)[0]?.winner).toBe("b");
    expect(resolveDraw(draw, [{ ...m, score_revision: 1 }], balls)[0]?.winner).toBeNull();
  });
  it("flags stale dependent fixtures after an undo instead of silently advancing", () => {
    const draw = makeDraw(["a", "b", "c", "d"], "single");
    const games = [match("r1-1", "a", "d"), match("r1-2", "b", "c"), match("final", "d", "c")];
    expect(resolveDraw(draw, games, winB("r1-2")).at(-1)?.status).toBe("conflict");
  });
  it("does not treat an incomplete or empty group as finished", () => {
    const ctx = {
      matches: [matchFixture()],
      teams: [teamFixture("a", "A"), teamFixture("b", "B"), teamFixture("c", "C")],
      groups: [],
      deliveries: [],
    };
    expect(groupRoundFinished(ctx)).toBe(false);
    ctx.teams.pop();
    expect(groupRoundFinished(ctx)).toBe(true);
    ctx.matches[0]!.status = "live";
    expect(groupRoundFinished(ctx)).toBe(false);
  });
  it("excludes playoffs from qualification standings", () => {
    const ctx = {
      tournament: tournamentFixture(),
      teams: [teamFixture("a", "A"), teamFixture("b", "B")],
      groups: [],
      matches: [match("final", "a", "b")],
      deliveries: winB("final"),
      playoff: null,
      token: "t",
    } as PlayoffContext;
    expect(qualificationGroups(ctx)[0]?.rows.every((r) => r.played === 0)).toBe(true);
  });
});
