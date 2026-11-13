import { describe, expect, it } from "vitest";
import {
  tournamentSummary,
  compareRuns,
  compareWickets,
  compareMvp,
  type TournamentPlayer,
} from "./tournament-summary";
import { deliveryFixture as ball, matchFixture as match } from "@/test/tournament-fixtures";
const line = (patch: Partial<TournamentPlayer> = {}): TournamentPlayer => ({
  name: "A",
  teamId: "a",
  team: "A",
  runs: 20,
  wickets: 2,
  fours: 0,
  sixes: 0,
  highest: 20,
  balls: 10,
  battingInnings: 1,
  dismissals: 1,
  bowlingInnings: 1,
  conceded: 10,
  bowlingOvers: 2,
  matches: 1,
  battingPoints: 0,
  bowlingPoints: 0,
  fieldingPoints: 0,
  points: 20,
  best: null,
  ...patch,
});
const innings = (matchId: string, runs: number[], patch: Partial<ReturnType<typeof ball>> = {}) =>
  runs.map((r, i) =>
    ball({ id: `${matchId}-${i}`, match_id: matchId, seq: i + 1, runs_bat: r, ...patch }),
  );

describe("tournament ranking rules", () => {
  it("applies each batting tie-breaker in order", () => {
    expect(compareRuns(line({ balls: 5 }), line())).toBeLessThan(0);
    expect(compareRuns(line({ highest: 21 }), line())).toBeLessThan(0);
    expect(compareRuns(line(), line({ battingInnings: 2 }))).toBeLessThan(0);
  });
  it("applies economy, average, then innings for equal wickets", () => {
    expect(compareWickets(line({ bowlingOvers: 3 }), line())).toBeLessThan(0);
    expect(compareWickets(line({ conceded: 5, bowlingOvers: 1 }), line())).toBeLessThan(0);
    expect(compareWickets(line(), line({ bowlingInnings: 2 }))).toBeLessThan(0);
  });
  it("applies points per match, wickets, runs, then keeps an exact MVP tie", () => {
    expect(compareMvp(line(), line({ matches: 2 }))).toBeLessThan(0);
    expect(compareMvp(line({ wickets: 3 }), line())).toBeLessThan(0);
    expect(compareMvp(line({ runs: 21 }), line())).toBeLessThan(0);
    expect(compareMvp(line(), line())).toBe(0);
  });
  it.each([
    [10, 5, 5],
    [12, 6, 5],
    [15, 6, 8],
    [10, 6, 3],
    [10, 4, 0],
    [9, 6, 0],
  ])("calculates batting bonus for %i runs / %i balls", (runs, balls, bonus) => {
    const ds = innings(
      "match",
      Array.from({ length: balls }, (_, i) => (i === 0 ? runs : 0)),
    );
    const p = tournamentSummary([match()], ds, []).players.find(
      (p) => p.teamId === "a" && p.name === "Alex",
    )!;
    expect(p.battingPoints).toBe(runs + bonus);
  });
  it("calculates bonuses per match, not from aggregate strike rate", () => {
    const s = tournamentSummary(
      [match(), match({ id: "m2" })],
      [...innings("match", [2, 2, 2, 2, 2]), ...innings("m2", [0, 0, 0, 0, 0, 0])],
      [],
    );
    expect(s.players.find((p) => p.teamId === "a" && p.name === "Alex")?.battingPoints).toBe(15);
  });
  it.each([
    [6, 6, 8],
    [9, 6, 5],
    [10, 6, 0],
    [0, 5, 0],
  ])("calculates economy bonus for %i conceded / %i balls", (runs, balls, bonus) => {
    const s = tournamentSummary(
      [match()],
      innings(
        "match",
        Array.from({ length: balls }, (_, i) => (i === 0 ? runs : 0)),
      ),
      [],
    );
    expect(s.players.find((p) => p.teamId === "b" && p.name === "Alex")?.bowlingPoints).toBe(bonus);
  });
  it("uses actual match overs for both economy bonus and rankings", () => {
    const s = tournamentSummary([match({ balls_per_over: 4 })], innings("match", [2, 2, 2, 0]), []);
    const p = s.players.find((p) => p.teamId === "b" && p.name === "Alex")!;
    expect(p.bowlingPoints).toBe(8);
    expect(p.bowlingOvers).toBe(1);
    expect(s.leaderboards.find((b) => b.id === "economy")?.rows[0]?.value).toBe("6.00");
  });
  it("credits fielding without awarding run-outs to bowlers and flags legacy events", () => {
    const ds = [
      ball({ id: "c", seq: 1, wicket: { kind: "caught", playerOut: "Alex", fielder: "Catch" } }),
      ball({ id: "s", seq: 2, wicket: { kind: "stumped", playerOut: "Sam", fielder: "Keeper" } }),
      ball({
        id: "d",
        seq: 3,
        wicket: { kind: "run_out", playerOut: "X", fielder: "Direct", runOutType: "direct" },
      }),
      ball({
        id: "a",
        seq: 4,
        wicket: {
          kind: "run_out",
          playerOut: "Y",
          fielder: "Throw",
          assistedBy: "Keeper",
          runOutType: "assisted",
        },
      }),
      ball({ id: "old", seq: 5, wicket: { kind: "run_out", playerOut: "Z", fielder: "Old" } }),
    ];
    const s = tournamentSummary([match()], ds, []);
    const points = (name: string) =>
      s.players.find((p) => p.teamId === "b" && p.name === name)?.fieldingPoints;
    expect(points("Catch")).toBe(5);
    expect(points("Direct")).toBe(10);
    expect(points("Throw")).toBe(5);
    expect(points("Keeper")).toBe(10);
    expect(s.uncreditedFielding).toBe(1);
    expect(s.players.find((p) => p.teamId === "b" && p.name === "Alex")?.wickets).toBe(2);
  });
  it("splits partnerships at dismissals, includes extras, and recomputes after undo", () => {
    const ds = [
      ball({ runs_bat: 4 }),
      ball({ id: "wide", seq: 2, extra_type: "wide", extras: 1 }),
      ball({ id: "w", seq: 3, wicket: { kind: "run_out", playerOut: "Sam" } }),
      ball({ id: "new", seq: 4, non_striker: "New", runs_bat: 6 }),
    ];
    expect(tournamentSummary([match()], ds, []).partnerships.map((p) => [p.runs, p.balls])).toEqual(
      [
        [6, 1],
        [5, 2],
      ],
    );
    expect(tournamentSummary([match()], ds.slice(0, 3), []).partnerships[0]?.runs).toBe(5);
  });
  it("excludes cancelled and unrelated data, counts zero-point squad appearances", () => {
    const s = tournamentSummary(
      [match(), match({ id: "m2" }), match({ id: "cancel", status: "cancelled" })],
      [
        ...innings("match", [6]),
        ...innings("m2", [0]),
        ...innings("cancel", [6]),
        ...innings("other", [6]),
      ],
      [],
    );
    const p = s.players.find((p) => p.teamId === "a" && p.name === "Alex")!;
    expect(p.points).toBe(6);
    expect(p.matches).toBe(2);
    expect(s.players.find((p) => p.teamId === "a" && p.name === "Sam")?.matches).toBe(2);
  });
});
