import { describe, expect, it } from "vitest";
import { standings, type Outcome } from "./tournament";

const teams = [
  { id: "a", name: "Lions" },
  { id: "b", name: "Tuskers" },
  { id: "c", name: "Eagles" },
];
const pts = { win: 2, tie: 1, loss: 0 };
const o = (winner: Outcome["winner"], A: [number, number], B: [number, number]): Outcome => ({
  winner,
  A: { runs: A[0], balls: A[1] },
  B: { runs: B[0], balls: B[1] },
});

describe("tournament standings", () => {
  it("awards win, tie and loss points", () => {
    const t = standings(
      teams,
      [
        { teamA: "a", teamB: "b", outcome: o("A", [120, 120], [100, 120]) },
        { teamA: "b", teamB: "c", outcome: o("tie", [90, 120], [90, 120]) },
      ],
      pts,
      6,
    );
    const pt = (id: string) => t.find((r) => r.teamId === id)!.points;
    expect(pt("a")).toBe(2);
    expect(pt("b")).toBe(1);
    expect(pt("c")).toBe(1);
    expect(t[0]!.teamId).toBe("a");
  });

  it("ignores unfinished matches", () => {
    const t = standings(teams, [{ teamA: "a", teamB: "b", outcome: null }], pts, 6);
    expect(t.every((r) => r.played === 0)).toBe(true);
  });

  it("computes net run rate per over", () => {
    const t = standings(teams, [{ teamA: "a", teamB: "b", outcome: o("A", [120, 120], [60, 120]) }], pts, 6);
    expect(t.find((r) => r.teamId === "a")!.nrr).toBeCloseTo(3);
  });
});
