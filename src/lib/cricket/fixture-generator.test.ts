import { describe, expect, it } from "vitest";
import { generateFixtures, pairKey, type FixtureContext, type Pair } from "./fixture-generator";
function context(n: number, pairs: Pair[] = []): FixtureContext {
  const ids = Array.from({ length: n }, (_, i) => String(i));
  return {
    token: "test",
    group: { id: "group", name: "A", team_ids: ids },
    tournament: { id: "tour", players_per_team: 2 },
    teams: ids.map((id) => ({ id, name: id, players: ["A", "B"] })),
    matches: pairs.map(([a, b], i) => ({
      id: `old-${i}`,
      team_a_id: a,
      team_b_id: b,
      status: "scheduled",
      rules: { tournamentStage: { kind: "group", groupId: "group" } },
    })),
  };
}
const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
function assertValid(c: FixtureContext, pairs: Pair[], target: number) {
  const all = [
    ...c.matches
      .filter((m) => m.status !== "cancelled")
      .map((m) => [m.team_a_id!, m.team_b_id!] as Pair),
    ...pairs,
  ];
  expect(new Set(all.map(([a, b]) => pairKey(a, b))).size).toBe(all.length);
  for (const [a, b] of all) {
    expect(a).not.toBe(b);
    expect(c.group.team_ids).toContain(a);
    expect(c.group.team_ids).toContain(b);
  }
  for (const id of c.group.team_ids) expect(all.filter((p) => p.includes(id))).toHaveLength(target);
}
describe("smart fixture exact graph completion", () => {
  it.each([
    [6, 3, 9],
    [5, 4, 10],
    [4, 2, 4],
    [2, 1, 1],
  ])("schedules %i teams with %i matches each", (n, m, total) => {
    const c = context(n);
    const r = generateFixtures(c, "equal", m);
    expect(r.pairs).toHaveLength(total);
    assertValid(c, r.pairs, m);
  });
  it("builds a six-team round robin", () => {
    const c = context(6);
    const r = generateFixtures(c, "round_robin", 0);
    expect(r.pairs).toHaveLength(15);
    assertValid(c, r.pairs, 5);
  });
  it.each([
    [5, 3],
    [6, 6],
    [1, 1],
    [0, 1],
    [6, 0],
    [6, -1],
    [6, 1.5],
    [6, NaN],
  ])("rejects invalid count %i / %i", (n, m) =>
    expect(() => generateFixtures(context(n), "equal", m)).toThrow(),
  );
  it("preserves two manual matches and creates seven", () => {
    const c = context(6, [
      ["0", "1"],
      ["2", "3"],
    ]);
    const before = JSON.stringify(c);
    const r = generateFixtures(c, "equal", 3);
    expect(r.pairs).toHaveLength(7);
    expect(JSON.stringify(c)).toBe(before);
    assertValid(c, r.pairs, 3);
  });
  it("round robin fills only missing pairs and recognizes previous generated fixtures", () => {
    const c = context(4, [
      ["0", "1"],
      ["0", "2"],
      ["1", "2"],
    ]);
    const r = generateFixtures(c, "round_robin", 3);
    expect(r.pairs).toHaveLength(3);
    const completed = context(4, [
      ...c.matches.map((m) => [m.team_a_id!, m.team_b_id!] as Pair),
      ...r.pairs,
    ]);
    expect(generateFixtures(completed, "round_robin", 3).pairs).toHaveLength(0);
  });
  it("does not schedule a saturated team", () => {
    const c = context(4, [
      ["0", "1"],
      ["0", "2"],
    ]);
    const r = generateFixtures(c, "equal", 2);
    expect(r.pairs.every((p) => !p.includes("0"))).toBe(true);
    assertValid(c, r.pairs, 2);
  });
  it("rejects over-quota and repeated existing pairings", () => {
    expect(() =>
      generateFixtures(
        context(4, [
          ["0", "1"],
          ["0", "2"],
        ]),
        "equal",
        1,
      ),
    ).toThrow(/exceed/);
    expect(() =>
      generateFixtures(
        context(4, [
          ["0", "1"],
          ["1", "0"],
        ]),
        "round_robin",
        3,
      ),
    ).toThrow(/repeat/);
  });
  it("detects impossible residual graphs despite even totals", () => {
    const c = context(4, [
      ["0", "1"],
      ["0", "2"],
      ["1", "2"],
    ]);
    expect(() => generateFixtures(c, "equal", 2)).toThrow(/prevent equal/);
  });
  it("separates computational limits from impossibility", () => {
    expect(() => generateFixtures(context(6), "equal", 3, { maxNodes: 0 })).toThrow(/search limit/);
  });
  it("ignores cancelled and non-group matches but counts abandoned and paused matches", () => {
    const c = context(4, [
      ["0", "1"],
      ["0", "2"],
    ]);
    c.matches[0]!.status = "cancelled";
    c.matches[1]!.status = "abandoned";
    expect(generateFixtures(c, "round_robin", 3).pairs).toHaveLength(5);
    c.matches[0]!.status = "paused";
    expect(generateFixtures(c, "round_robin", 3).pairs).toHaveLength(4);
    c.matches[0]!.rules = { tournamentStage: { kind: "other", title: "Final" } };
    expect(generateFixtures(c, "round_robin", 3).pairs).toHaveLength(5);
  });
  it("blocks legacy, cross-group, deleted-team and insufficient squad ambiguity", () => {
    const c = context(4, [["0", "1"]]);
    c.matches[0]!.rules = {};
    expect(() => generateFixtures(c, "equal", 2)).toThrow(/group information/);
    c.matches[0]!.rules = { tournamentStage: { kind: "group", groupId: "other" } };
    expect(() => generateFixtures(c, "equal", 2)).toThrow(/group information/);
    const moved = context(4, [["0", "outside"]]);
    expect(() => generateFixtures(moved, "equal", 2)).toThrow(/moved/);
    const short = context(4);
    short.teams[0]!.players = [];
    expect(() => generateFixtures(short, "equal", 2)).toThrow(/Register/);
  });
  it("maintains invariants over randomized schedules and partial existing schedules", () => {
    for (let n = 2; n <= 10; n++)
      for (let m = 1; m < n; m++) {
        if ((n * m) % 2) continue;
        for (let seed = 1; seed <= 5; seed++) {
          const c = context(n);
          const r = generateFixtures(c, "equal", m, { random: seeded(seed) });
          assertValid(c, r.pairs, m);
          const partial = context(
            n,
            r.pairs.filter((_, i) => i % 2 === 0),
          );
          const fill = generateFixtures(partial, "equal", m, { random: seeded(seed + 10) });
          assertValid(partial, fill.pairs, m);
        }
      }
  });
});
