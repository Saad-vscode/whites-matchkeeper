import { describe, expect, it } from "vitest";
import {
  bowlerEligibility,
  computeInnings,
  DEFAULT_RULES,
  formatOvers,
  matchResult,
  type Delivery,
  type MatchConfig,
} from "./engine";

const cfg = (o: Partial<MatchConfig> = {}): MatchConfig => ({
  overs: 2,
  ballsPerOver: 6,
  playersPerTeam: 6,
  rules: DEFAULT_RULES,
  ...o,
});
let seq = 0;
const d = (p: Partial<Delivery>): Delivery => ({
  id: String(++seq),
  innings: 1,
  seq,
  striker: "A",
  non_striker: "B",
  bowler: "X",
  runs_bat: 0,
  extra_type: "none",
  extras: 0,
  wicket: null,
  ...p,
});

describe("cricket engine", () => {
  it("uses configured balls per over (5-ball overs)", () => {
    const balls = Array.from({ length: 5 }, () => d({}));
    const s = computeInnings(balls, cfg({ ballsPerOver: 5 }), null);
    expect(formatOvers(s.legalBalls, 5)).toBe("1.0");
    expect(s.next.overComplete).toBe(true);
  });

  it("wides and no-balls are not legal balls and add penalty runs", () => {
    const s = computeInnings([d({ extra_type: "wide", extras: 1 }), d({ extra_type: "noball", extras: 1, runs_bat: 4 })], cfg(), null);
    expect(s.legalBalls).toBe(0);
    expect(s.runs).toBe(6);
    expect(s.batters.find((b) => b.name === "A")!.balls).toBe(1);
    expect(s.bowlers[0].runs).toBe(6);
  });

  it("odd runs rotate strike; end of over rotates strike", () => {
    expect(computeInnings([d({ runs_bat: 1 })], cfg(), null).next.striker).toBe("B");
    const over = Array.from({ length: 6 }, () => d({}));
    expect(computeInnings(over, cfg(), null).next.striker).toBe("B");
  });

  it("byes count as extras, not to batter or bowler", () => {
    const s = computeInnings([d({ extra_type: "bye", extras: 1 })], cfg(), null);
    expect(s.runs).toBe(1);
    expect(s.batters[0].runs).toBe(0);
    expect(s.bowlers[0].runs).toBe(0);
    expect(s.next.striker).toBe("B");
  });

  it("run out is not credited to bowler; retired hurt is not a wicket", () => {
    const s = computeInnings(
      [d({ wicket: { kind: "run_out", playerOut: "B" } }), d({ non_striker: "C", wicket: { kind: "retired_hurt", playerOut: "A" } })],
      cfg(),
      null,
    );
    expect(s.wickets).toBe(1);
    expect(s.bowlers[0].wickets).toBe(0);
  });

  it("innings ends when all out with players-1 wickets (6 players => 5)", () => {
    const outs = ["A", "B", "C", "D", "E"].map((p) => d({ striker: p, wicket: { kind: "bowled", playerOut: p } }));
    const s = computeInnings(outs, cfg(), null);
    expect(s.complete).toBe(true);
    expect(s.endReason).toBe("all_out");
  });

  it("chase ends when target reached and result uses wickets left", () => {
    const first = computeInnings([d({ runs_bat: 6 })], cfg({ overs: 1, ballsPerOver: 1 }), null);
    const second = computeInnings([d({ innings: 2, runs_bat: 6 }), d({ innings: 2, runs_bat: 1 })], cfg(), 7);
    expect(second.complete).toBe(true);
    expect(matchResult(first, second, cfg(), "T1", "T2")).toBe("T2 won by 5 wickets");
  });

  it("bowler cannot bowl consecutive overs or exceed max overs", () => {
    const over = Array.from({ length: 6 }, () => d({}));
    const c = cfg({ rules: { ...DEFAULT_RULES, maxOversPerBowler: 1 } });
    const s = computeInnings(over, c, null);
    expect(bowlerEligibility(s, c, "X")).not.toBeNull();
    expect(bowlerEligibility(s, c, "Y")).toBeNull();
  });
});
