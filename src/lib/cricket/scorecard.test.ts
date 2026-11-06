import { describe, expect, it } from "vitest";
import { fallOfWickets, maidens, overGroups } from "./scorecard";
import type { Delivery } from "./engine";

let seq = 0;
const b = (p: Partial<Delivery>): Delivery => ({ id: String(++seq), innings: 1, seq, striker: "A", non_striker: "B", bowler: "X", runs_bat: 0, extra_type: "none", extras: 0, wicket: null, ...p });

describe("scorecard", () => {
  it("records fall of wickets with score and over", () => {
    const ds = [b({ runs_bat: 4 }), b({ wicket: { kind: "bowled", playerOut: "A" } })];
    expect(fallOfWickets(ds, 6)).toEqual([{ n: 1, player: "A", score: 4, over: "0.2" }]);
  });
  it("counts a six-dot over as a maiden but not one with a wide", () => {
    const dots = Array.from({ length: 6 }, () => b({ bowler: "X" }));
    const withWide = [b({ bowler: "Y", extra_type: "wide", extras: 1 }), ...Array.from({ length: 6 }, () => b({ bowler: "Y" }))];
    expect(maidens([...dots, ...withWide], 6)).toEqual({ X: 1 });
  });
  it("groups balls into overs with labels", () => {
    const ds = Array.from({ length: 7 }, () => b({ runs_bat: 1 }));
    const g = overGroups(ds, 6);
    expect(g.length).toBe(2);
    expect(g[0].runs).toBe(6);
    expect(g[1].balls[0].label).toBe("1.1");
  });
});
