import { describe, expect, it } from "vitest";
import { battingSide, derive, type MatchRow } from "./match";
import { matchOutcome } from "./tournament";
import { tournamentSummary } from "./tournament-summary";
import { replay } from "./offline";
import { resolveDraw, makeDraw } from "./playoffs";
import { deliveryFixture as ball, matchFixture } from "@/test/tournament-fixtures";
const game = (patch: Partial<MatchRow> = {}): MatchRow => ({ ...matchFixture({ overs: 1, balls_per_over: 1, players_per_team: 4, rules: { playoffNode: "final", tournamentStage: { kind: "other", title: "Final" } } }), ...patch });
const normal = [ball({ id: "r1", runs_bat: 5 }), ball({ id: "r2", innings: 2, runs_bat: 5 })];
const over = (innings: 3 | 4, runs: number) => Array.from({length: 6}, (_, i) => ball({ id: innings + "-" + i, innings, seq: i + 1, runs_bat: i === 0 ? runs : 0 }));
describe("playoff Super Over", () => {
  it("keeps group ties but requires a decider for playoffs and legacy completed ties", () => {
    expect(derive(game(), normal).needsSuperOver).toBe(true);
    expect(matchOutcome(game(), normal)).toBeNull();
    expect(matchOutcome(game({rules: {tournamentStage: {kind: "group", title: "A"}}}), normal)?.winner).toBe("tie");
  });
  it.each(["bat", "bowl"])("reverses batting order after a %s toss decision", toss_decision => {
    const m = game({toss_decision});
    expect(battingSide(m, 3)).toBe(battingSide(m, 2));
    expect(battingSide(m, 4)).toBe(battingSide(m, 1));
  });
  it("uses six legal balls regardless of the normal format and ignores wides in the quota", () => {
    const m = game({ live: {innings: 3} });
    const d = derive(m, [...normal, ...over(3, 0).slice(0, 5), ball({innings: 3, seq: 6, extra_type: "wide", extras: 1})]);
    expect(d.cfg.ballsPerOver).toBe(6); expect(d.current.complete).toBe(false);
    expect(d.current.runs).toBe(1);
  });
  it("ends after two wickets even when last-man batting is enabled", () => {
    const m = game({live: {innings: 3}, rules: {playoffNode: "final", lastManBats: true}});
    const ds = ["Alex", "Sam"].map((playerOut, i) => ball({id: String(i), innings: 3, seq: i+1, wicket: {kind: "bowled", playerOut}}));
    const d = derive(m, [...normal, ...ds]); expect(d.current.complete).toBe(true); expect(d.current.wickets).toBe(2);
  });
  it("ends the chase immediately and advances the winner without adding Super Over runs to statistics", () => {
    const m = game({live: {innings: 4}}), ds = [...normal, ...over(3, 4), ball({innings: 4, runs_bat: 6})];
    expect(derive(m, ds).result).toBe("Lions won the Super Over");
    expect(matchOutcome(m, ds)).toMatchObject({winner: "A", A: {runs: 5}, B: {runs: 5}});
    expect(resolveDraw(makeDraw(["a", "b"], "single"), [m], ds)[0]?.winner).toBe("a");
    expect(tournamentSummary([m], ds, []).players.reduce((n,p) => n+p.runs,0)).toBe(10);
  });
  it("requires a deciding toss after a second tie, preserves the original toss, and invalidates it on undo", () => {
    const m = game({live: {innings: 4}}), ds = [...normal, ...over(3, 4), ...over(4, 4)];
    expect(derive(m, ds).needsDecidingToss).toBe(true); expect(matchOutcome(m, ds)).toBeNull();
    const decided = {...m, tie_break_toss_winner: "B"};
    expect(matchOutcome(decided, ds)?.winner).toBe("B");
    expect(derive(decided, ds).result).toContain("won by deciding toss");
    const undone = replay({match: decided, deliveries: ds}, [{id: "undo", kind: "undo", delivery: ds.at(-1)!, patch: {status: "live"}, reason: ""}]);
    expect(undone.match.tie_break_toss_winner).toBeNull(); expect(undone.match.toss_winner).toBe("A");
    expect(matchOutcome(undone.match, undone.deliveries)).toBeNull();
  });
});
