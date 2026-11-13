/** Exact simple-graph completion. Preview only: no database access. */
export type Pair = [string, string];
export type ScheduleMode = "round_robin" | "equal";
export interface ExistingFixture {
  id: string;
  team_a_id: string | null;
  team_b_id: string | null;
  status: string;
  rules: unknown;
}
export interface FixtureContext {
  token: string;
  group: { id: string; name: string; team_ids: string[] };
  tournament: { id: string; players_per_team: number };
  teams: { id: string; name: string; players: string[] }[];
  matches: ExistingFixture[];
}
export class FixtureError extends Error {
  constructor(
    public code: "invalid" | "conflict" | "impossible" | "limit",
    message: string,
  ) {
    super(message);
  }
}
export const pairKey = (a: string, b: string) => JSON.stringify([a, b].sort());
export function relevantFixtures(context: FixtureContext) {
  const ids = new Set(context.group.team_ids);
  return context.matches.filter((m) => {
    if (m.status === "cancelled") return false;
    const stage = (m.rules as { tournamentStage?: { kind?: string; groupId?: string } } | null)
      ?.tournamentStage;
    const touches = ids.has(m.team_a_id ?? "") || ids.has(m.team_b_id ?? "");
    if (stage?.kind === "other") return false;
    if (stage?.kind === "group" && stage.groupId === context.group.id) return true;
    if (touches || (stage?.kind !== "group" && (!m.team_a_id || !m.team_b_id)))
      throw new FixtureError(
        "conflict",
        "An existing fixture has missing or conflicting group information. Review its match type and group before generating.",
      );
    return false;
  });
}
export function validateContext(context: FixtureContext) {
  const ids = context.group.team_ids;
  if (ids.length < 2 || new Set(ids).size !== ids.length)
    throw new FixtureError("invalid", "Assign at least two distinct teams to this group.");
  for (const id of ids) {
    const team = context.teams.find((t) => t.id === id);
    if (!team)
      throw new FixtureError("conflict", "A group team no longer exists. Update the group first.");
    if (team.players.length < context.tournament.players_per_team)
      throw new FixtureError(
        "invalid",
        `Register at least ${context.tournament.players_per_team} players for ${team.name} before generating.`,
      );
  }
}
function shuffle<T>(items: T[], random: () => number) {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j]!, list[i]!];
  }
  return list;
}
export function generateFixtures(
  context: FixtureContext,
  mode: ScheduleMode,
  matchesPerTeam: number,
  options: { random?: () => number; maxNodes?: number; maxMs?: number } = {},
) {
  validateContext(context);
  const ids = [...context.group.team_ids];
  const n = ids.length;
  if (n > 32)
    throw new FixtureError(
      "limit",
      "This generator supports up to 32 teams per group. Split this group before generating.",
    );
  if (mode !== "round_robin" && mode !== "equal")
    throw new FixtureError("invalid", "Choose a supported scheduling mode.");
  const target = mode === "round_robin" ? n - 1 : matchesPerTeam;
  if (!Number.isInteger(target) || target < 1 || target >= n)
    throw new FixtureError(
      "invalid",
      `Matches per team must be a whole number from 1 to ${n - 1}.`,
    );
  if ((n * target) % 2)
    throw new FixtureError(
      "invalid",
      `Equal match distribution is not possible. ${n} teams cannot each play exactly ${target} matches without repeating opponents. Change the matches-per-team value.`,
    );
  const existing = relevantFixtures(context);
  const used = new Set<string>();
  const remaining = Array(n).fill(target) as number[];
  for (const m of existing) {
    const a = ids.indexOf(m.team_a_id ?? ""),
      b = ids.indexOf(m.team_b_id ?? "");
    if (a < 0 || b < 0 || a === b)
      throw new FixtureError(
        "conflict",
        "An existing group fixture has missing, moved, or identical teams. Review the group fixtures first.",
      );
    const key = pairKey(ids[a]!, ids[b]!);
    if (used.has(key))
      throw new FixtureError(
        "conflict",
        "Existing group fixtures repeat an opponent pairing. Generation cannot safely continue.",
      );
    used.add(key);
    remaining[a]!--;
    remaining[b]!--;
  }
  if (remaining.some((d) => d < 0))
    throw new FixtureError(
      "conflict",
      "Existing fixtures already exceed the selected matches-per-team limit.",
    );
  const random = options.random ?? Math.random;
  let pairs: Pair[] = [];
  if (mode === "round_robin") {
    for (let a = 0; a < n; a++)
      for (let b = a + 1; b < n; b++)
        if (!used.has(pairKey(ids[a]!, ids[b]!))) pairs.push([ids[a]!, ids[b]!]);
  } else {
    const chosen: Pair[] = [];
    const failed = new Set<string>();
    let nodes = 0;
    const start = Date.now();
    const maxNodes = options.maxNodes ?? 200000,
      maxMs = options.maxMs ?? 1500;
    const search = (): boolean => {
      if (++nodes > maxNodes || Date.now() - start > maxMs)
        throw new FixtureError(
          "limit",
          "A valid schedule could not be determined within the search limit. Try Shuffle again or change the match target.",
        );
      if (remaining.every((d) => d === 0)) return true;
      const key = remaining.join(",");
      if (failed.has(key)) return false;
      let v = -1,
        candidates: number[] = [];
      let slack = Infinity;
      for (const i of shuffle(
        ids.map((_, i) => i),
        random,
      )) {
        if (!remaining[i]) continue;
        const available = ids
          .map((_, j) => j)
          .filter((j) => j !== i && remaining[j]! > 0 && !used.has(pairKey(ids[i]!, ids[j]!)));
        if (available.length < remaining[i]!) return false;
        if (available.length - remaining[i]! < slack) {
          v = i;
          candidates = available;
          slack = available.length - remaining[i]!;
        }
      }
      const need = remaining[v]!;
      candidates = shuffle(candidates, random);
      remaining[v] = 0;
      const pick = (offset: number, left: number): boolean => {
        if (++nodes > maxNodes || Date.now() - start > maxMs)
          throw new FixtureError(
            "limit",
            "A valid schedule could not be determined within the search limit. Try Shuffle again or change the match target.",
          );
        if (left === 0) return search();
        if (candidates.length - offset < left) return false;
        for (let k = offset; k <= candidates.length - left; k++) {
          const j = candidates[k]!;
          if (remaining[j]! <= 0) continue;
          remaining[j]!--;
          chosen.push([ids[v]!, ids[j]!]);
          if (pick(k + 1, left - 1)) return true;
          chosen.pop();
          remaining[j]!++;
        }
        return false;
      };
      if (pick(0, need)) return true;
      remaining[v] = need;
      failed.add(key);
      return false;
    };
    if (!search())
      throw new FixtureError(
        "impossible",
        "The existing matches prevent equal fixture distribution under these conditions. Review the existing fixtures or change the number of matches per team.",
      );
    pairs = chosen;
  }
  return { pairs: shuffle(pairs, random), existing, target, total: (n * target) / 2 };
}
