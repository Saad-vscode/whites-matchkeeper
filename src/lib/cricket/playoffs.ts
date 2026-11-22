import type { Tables } from "@/integrations/supabase/types";
import { derive, type MatchRow } from "./match";
import { matchOutcome, standings } from "./tournament";
import { countsForPoints } from "./match-stage";
import type { TournamentDelivery } from "./tournament-summary";

export type Slot = { team: string } | { from: string; result: "winner" | "loser" } | null;
export type BracketNode = { id: string; title: string; round: number; a: Slot; b: Slot };
export type PlayoffDraw = {
  format: "ipl" | "single";
  seeds: string[];
  nodes: BracketNode[];
  decisions: Record<string, { team: string; reason: string; revision: number }>;
};
export type PlayoffRecord = {
  tournament_id: string;
  draw: PlayoffDraw;
  approved: boolean;
  revision: number;
};
export type PlayoffContext = {
  tournament: Tables<"tournaments">;
  teams: Tables<"tournament_teams">[];
  groups: Tables<"tournament_groups">[];
  matches: MatchRow[];
  deliveries: TournamentDelivery[];
  playoff: PlayoffRecord | null;
  token: string;
};
export function playoffNode(m: MatchRow): string | null {
  const r = m.rules;
  return r && typeof r === "object" && !Array.isArray(r) && typeof r["playoffNode"] === "string"
    ? r["playoffNode"]
    : null;
}
export function groupRoundFinished(
  ctx: Pick<PlayoffContext, "matches" | "groups" | "teams" | "deliveries">,
) {
  const fixtures = ctx.matches.filter(
    (m) => countsForPoints(m.rules) && !playoffNode(m) && m.status !== "cancelled",
  );
  if (!fixtures.length || fixtures.some((m) => !["completed", "abandoned"].includes(m.status)))
    return false;
  // An empty group / a team with no fixtures is not a completed group round.
  const ids = ctx.groups.length
    ? ctx.groups.flatMap((g) => g.team_ids)
    : ctx.teams.map((t) => t.id);
  return (
    ids.length >= 2 &&
    ids.every((id) => fixtures.some((m) => m.team_a_id === id || m.team_b_id === id))
  );
}
export function qualificationGroups(ctx: PlayoffContext) {
  const groups = ctx.groups.length
    ? ctx.groups
    : [{ id: "league", name: "League standings", team_ids: ctx.teams.map((t) => t.id) }];
  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    rows: standings(
      ctx.teams.filter((t) => g.team_ids.includes(t.id)),
      ctx.matches
        .filter(
          (m) =>
            countsForPoints(m.rules, g.id === "league" ? undefined : g.id) &&
            g.team_ids.includes(m.team_a_id ?? "") &&
            g.team_ids.includes(m.team_b_id ?? ""),
        )
        .map((m) => ({
          teamA: m.team_a_id,
          teamB: m.team_b_id,
          outcome:
            m.status === "completed"
              ? matchOutcome(
                  m,
                  ctx.deliveries.filter((d) => d.match_id === m.id),
                )
              : null,
          noResult: m.status === "abandoned",
        })),
      {
        win: ctx.tournament.points_win,
        tie: ctx.tournament.points_tie,
        loss: ctx.tournament.points_loss,
        noResult: ctx.tournament.points_no_result,
      },
      ctx.tournament.balls_per_over,
      ctx.tournament.ranking_rule,
    ),
  }));
}
/** Seed order gives higher seeds the byes and keeps seeds 1 and 2 apart. */
export function seedPositions(size: number): number[] {
  let seeds = [1, 2];
  for (let n = 4; n <= size; n *= 2) seeds = seeds.flatMap((s) => [s, n + 1 - s]);
  return seeds;
}
/** Avoid immediate group rematches where possible without moving seeded byes. */
export function separateGroupOpponents(
  seeds: string[],
  groups: { team_ids: string[] }[],
): string[] {
  const next = [...seeds];
  if (seeds.length < 3 || groups.length < 2) return next;
  const order = seedPositions(2 ** Math.ceil(Math.log2(seeds.length)));
  const pairs = Array.from({ length: order.length / 2 }, (_, i) => [
    order[i * 2]! - 1,
    order[i * 2 + 1]! - 1,
  ]).filter(([a, b]) => a! < next.length && b! < next.length) as [number, number][];
  const eligible = pairs.flat(),
    group = (id: string) => groups.findIndex((g) => g.team_ids.includes(id));
  const conflicts = (s: string[]) =>
    pairs.filter(([a, b]) => group(s[a]!) >= 0 && group(s[a]!) === group(s[b]!)).length;
  let score = conflicts(next);
  for (let pass = 0; pass < seeds.length && score; pass++) {
    let improved = false;
    for (const a of eligible) {
      for (const b of [...eligible].reverse()) {
        if (a >= b) continue;
        [next[a], next[b]] = [next[b]!, next[a]!];
        const value = conflicts(next);
        if (value < score) {
          score = value;
          improved = true;
          break;
        }
        [next[a], next[b]] = [next[b]!, next[a]!];
      }
      if (improved) break;
    }
    if (!improved) break;
  }
  return next;
}
export function makeDraw(seeds: string[], format: "ipl" | "single"): PlayoffDraw {
  if (seeds.length < 2 || seeds.length > 32 || new Set(seeds).size !== seeds.length)
    throw new Error("Choose 2–32 different qualifying teams.");
  const team = (i: number): Slot => (seeds[i] ? { team: seeds[i] } : null);
  const from = (id: string, result: "winner" | "loser" = "winner"): Slot => ({ from: id, result });
  if (format === "ipl") {
    if (seeds.length !== 4)
      throw new Error("IPL playoffs require exactly four teams, in standings order.");
    return {
      format,
      seeds,
      decisions: {},
      nodes: [
        { id: "q1", title: "Qualifier 1", round: 1, a: team(0), b: team(1) },
        { id: "eliminator", title: "Eliminator", round: 1, a: team(2), b: team(3) },
        { id: "q2", title: "Qualifier 2", round: 2, a: from("q1", "loser"), b: from("eliminator") },
        { id: "final", title: "Final", round: 3, a: from("q1"), b: from("q2") },
      ],
    };
  }
  const size = 2 ** Math.ceil(Math.log2(seeds.length)),
    nodes: BracketNode[] = [];
  let slots = seedPositions(size).map((s) => team(s - 1)),
    round = 1;
  while (slots.length > 1) {
    const next: Slot[] = [];
    for (let i = 0; i < slots.length; i += 2) {
      const count = slots.length / 2,
        id = count === 1 ? "final" : `r${round}-${i / 2 + 1}`;
      const title =
        count === 1
          ? "Final"
          : count === 2
            ? `Semi Final ${i / 2 + 1}`
            : count === 4
              ? `Quarter Final ${i / 2 + 1}`
              : `Round of ${slots.length} · ${i / 2 + 1}`;
      nodes.push({ id, title, round, a: slots[i] ?? null, b: slots[i + 1] ?? null });
      next.push(from(id));
    }
    slots = next;
    round++;
  }
  return { format, seeds, decisions: {}, nodes };
}
export type NodeState = {
  node: BracketNode;
  a: string | null;
  b: string | null;
  winner: string | null;
  loser: string | null;
  match: MatchRow | null;
  status:
    "waiting" | "bye" | "ready" | "scheduled" | "live" | "completed" | "decision" | "conflict";
};
/** No scores or winners are stored: derive advancement from the delivery log. */
export function resolveDraw(
  draw: PlayoffDraw,
  matches: MatchRow[],
  deliveries: TournamentDelivery[],
): NodeState[] {
  const states = new Map<string, NodeState>();
  const slot = (s: Slot): string | null =>
    !s ? null : "team" in s ? s.team : (states.get(s.from)?.[s.result] ?? null);
  return draw.nodes.map((node) => {
    const a = slot(node.a),
      b = slot(node.b),
      match = matches.find((m) => playoffNode(m) === node.id) ?? null;
    let winner: string | null = null,
      loser: string | null = null,
      status: NodeState["status"] = "waiting";
    if ((!node.a || !node.b) && (a || b)) {
      winner = a || b;
      status = "bye";
    } else if (a && b) {
      status = "ready";
      if (match) {
        if (match.status === "cancelled" || match.team_a_id !== a || match.team_b_id !== b)
          status = "conflict";
        else {
          status =
            ["live", "paused", "innings_break"].includes(match.status)
              ? "live"
              : match.status === "completed" || match.status === "abandoned"
                ? "decision"
                : "scheduled";
          const outcome =
            match.status === "completed"
              ? matchOutcome(
                  match,
                  deliveries.filter((d) => d.match_id === match.id),
                )
              : null;
          if (match.status === "completed" && !outcome) {
            const pending = derive(match, deliveries.filter(d => d.match_id === match.id));
            status = pending.needsSuperOver || pending.needsDecidingToss ? "live" : "conflict";
          }
          if (outcome && outcome.winner !== "tie") winner = outcome.winner === "A" ? a : b;
          else if (status === "decision") {
            const d = draw.decisions[node.id];
            if (d && d.revision === match.score_revision && [a, b].includes(d.team))
              winner = d.team;
          }
          if (winner) {
            loser = winner === a ? b : a;
            status = "completed";
          }
        }
      }
    }
    if (match && (!a || !b)) status = "conflict";
    const state = { node, a, b, winner, loser, match, status };
    states.set(node.id, state);
    return state;
  });
}
