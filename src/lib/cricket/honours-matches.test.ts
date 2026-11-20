import { expect, it } from "vitest";
import { matchFixture } from "@/test/tournament-fixtures";
import { honoursMatches } from "./honours-matches";
import { makeDraw } from "./playoffs";
it("uses all four IPL nodes and excludes obsolete semi-finals", () => {
  const draw = makeDraw(["a", "b", "c", "d"], "ipl");
  const matches = [...draw.nodes.map(n => matchFixture({ id: n.id, rules: { playoffNode: n.id } })),
    matchFixture({ id: "old", rules: { tournamentStage: { kind: "other", title: "Semi Final 1" } } })];
  expect(honoursMatches({ matches, playoff: { draw, tournament_id: "t", approved: true, revision: 1 } }).map(m => m.id))
    .toEqual(["q1", "eliminator", "q2", "final"]);
});
it("excludes older manual finals and semi-finals when the bracket exists", () => {
  const fixture = (id: string, title: string, node?: string) => matchFixture({ id, rules: { tournamentStage: { kind: "other", title }, ...(node ? { playoffNode: node } : {}) } });
  const matches = [fixture("old", "Final"), fixture("old-semi", "Semi Final"), fixture("s2", "Semi Final 2", "r1-2"), fixture("f", "Final", "final"), fixture("s1", "Semi Final 1", "r1-1")];
  expect(honoursMatches({ matches }).map(m => m.id)).toEqual(["f", "s1", "s2"]);
  expect(honoursMatches({ matches: matches.slice(0, 2) }).map(m => m.id)).toEqual(["old", "old-semi"]);
});
