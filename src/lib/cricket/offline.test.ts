import { describe, expect, it } from "vitest";
import { replay, type ScoreSnapshot } from "./offline";
import type { Delivery } from "./engine";

const ball = (id: string, seq: number, runs_bat = 1): Delivery => ({ id, innings: 1, seq, striker: "A", non_striker: "B", bowler: "C", runs_bat, extra_type: "none", extras: 0, wicket: null });
const base = { match: { result: "old", status: "live" }, deliveries: [ball("one", 1)] } as unknown as ScoreSnapshot;

describe("offline scoring replay", () => {
  it("never counts the same ball twice", () => {
    const b = ball("two", 2);
    const s = replay(base, [{ id: "op1", kind: "ball", delivery: b, patch: {}, reason: "" }, { id: "op2", kind: "ball", delivery: b, patch: {}, reason: "" }]);
    expect(s.deliveries).toHaveLength(2);
  });
  it("applies a correction to the original ball", () => {
    const s = replay(base, [{ id: "op", kind: "edit", delivery: ball("one", 1, 4), patch: {}, reason: "boundary" }]);
    expect(s.deliveries[0]?.runs_bat).toBe(4);
  });
  it("removes an undone ball", () => {
    expect(replay(base, [{ id: "op", kind: "undo", delivery: ball("one", 1), patch: {}, reason: "" }]).deliveries).toHaveLength(0);
  });
});
