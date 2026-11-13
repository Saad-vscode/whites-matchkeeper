import { describe, expect, it } from "vitest";
import { deliveryFixture } from "@/test/tournament-fixtures";
import { highlightFor, TvHighlightTracker } from "./tv-highlights";

describe("TV confirmed highlights", () => {
  it("distinguishes batting boundaries, wickets, extras and retired hurt", () => {
    expect(highlightFor(deliveryFixture({ runs_bat: 4 }))?.kind).toBe("four");
    expect(
      highlightFor(deliveryFixture({ runs_bat: 6, extra_type: "noball", extras: 1 }))?.kind,
    ).toBe("six");
    expect(highlightFor(deliveryFixture({ extra_type: "bye", extras: 4 }))).toBeNull();
    expect(
      highlightFor(deliveryFixture({ wicket: { kind: "retired_hurt", playerOut: "Alex" } })),
    ).toBeNull();
    expect(
      highlightFor(deliveryFixture({ runs_bat: 4, wicket: { kind: "run_out", playerOut: "Alex" } }))
        ?.kind,
    ).toBe("wicket");
  });
  it("never plays the initial history, duplicate snapshots, edits or undo", () => {
    const t = new TvHighlightTracker();
    const first = deliveryFixture({ runs_bat: 4 });
    expect(t.update("a", [first], true)).toEqual([]);
    const second = deliveryFixture({ id: "two", seq: 2, runs_bat: 6 });
    expect(t.update("a", [first, second], true)).toHaveLength(1);
    expect(t.update("a", [first, second], true)).toEqual([]);
    expect(t.update("a", [first, { ...second, runs_bat: 4 }], true)).toEqual([]);
    expect(t.update("a", [first], true)).toEqual([]);
    expect(t.update("a", [first, second], true)).toEqual([]);
  });
  it("silently catches up after reconnect and on match switches", () => {
    const t = new TvHighlightTracker();
    t.update("a", [], true);
    t.update("a", [], false);
    const old = deliveryFixture({ runs_bat: 6 });
    expect(t.update("a", [old], false)).toEqual([]);
    expect(t.update("a", [old], true)).toEqual([]);
    expect(t.update("b", [old], true)).toEqual([]);
    const next = deliveryFixture({ id: "new", seq: 2, runs_bat: 4 });
    expect(t.update("b", [old, next], true).map((x) => x.id)).toEqual(["new"]);
  });
  it("orders bursts and allows a newly scored replacement after undo", () => {
    const t = new TvHighlightTracker();
    t.update("a", [], true);
    const a = deliveryFixture({ runs_bat: 4 }),
      b = deliveryFixture({ id: "b", seq: 2, runs_bat: 6 });
    expect(t.update("a", [b, a], true).map((x) => x.id)).toEqual([a.id, b.id]);
    t.update("a", [a], true);
    expect(t.update("a", [a, { ...b, id: "replacement" }], true)).toHaveLength(1);
  });
});
