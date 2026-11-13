import { expect, it } from "vitest";
import { automaticDraw, tvBracketSlides } from "./tv-playoffs";
import { makeDraw, resolveDraw } from "./playoffs";
import { matchFixture } from "@/test/tournament-fixtures";
it("waits for approval and the result interval, then returns for preparation or live play", () => {
  const m = matchFixture({ status: "completed" });
  expect(automaticDraw(m, false, true, true, null, true)).toBe(false);
  expect(automaticDraw(m, true, true, true, null, false)).toBe(false);
  expect(automaticDraw(m, true, true, true, null, true)).toBe(true);
  expect(automaticDraw(m, true, false, true, null, true)).toBe(false);
  expect(automaticDraw(m, true, true, false, null, true)).toBe(false);
  const scheduled = { ...m, status: "scheduled", toss_winner: null };
  expect(automaticDraw(scheduled, true, true, true, null, false)).toBe(true);
  expect(automaticDraw(scheduled, true, true, true, m.id, false)).toBe(false);
  expect(automaticDraw({ ...scheduled, toss_winner: "A" }, true, true, true, null, true)).toBe(
    false,
  );
  for (const status of ["live", "paused", "innings_break"])
    expect(automaticDraw({ ...m, status }, true, true, true, null, true)).toBe(false);
});
it("splits a 32-team draw into legible panels, without dropping fixtures", () => {
  const nodes = resolveDraw(
    makeDraw(
      Array.from({ length: 32 }, (_, i) => String(i)),
      "single",
    ),
    [],
    [],
  );
  const slides = tvBracketSlides(nodes);
  expect(slides.every((s) => s.nodes.length <= 4)).toBe(true);
  expect(slides.flatMap((s) => s.nodes)).toEqual(nodes);
  expect(slides.filter((s) => s.round === 1)).toHaveLength(4);
});
