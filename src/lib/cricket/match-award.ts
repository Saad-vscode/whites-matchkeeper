import type { Delivery } from "./engine";
import { derive, type MatchRow } from "./match";
import { compareMvp, tournamentSummary } from "./tournament-summary";

/** Awards use exactly the same per-match points that contribute to series MVP. */
export function calculateMatchAward(match: MatchRow, deliveries: Delivery[]) {
  const summary = tournamentSummary([match], deliveries.map(d => ({ ...d, match_id: match.id })), []);
  const players = summary.players;
  const ranked = [...players].sort((a, b) => compareMvp(a, b) || a.name.localeCompare(b.name));
  const leader = ranked[0];
  const tied = leader ? ranked.filter(p => compareMvp(p, leader) === 0) : [];
  const state = derive(match, deliveries);
  return {
    winners: match.status === "completed" && !state.needsSuperOver && !state.needsDecidingToss && deliveries.length ? tied : [],
    players: ranked,
    uncreditedFielding: summary.uncreditedFielding,
  };
}
