import type { Delivery } from "./engine";
import type { MatchRow } from "./match";
import { bowlingEconomy, tournamentSummary } from "./tournament-summary";

/** Awards use exactly the same per-match points that contribute to series MVP. */
export function calculateMatchAward(match: MatchRow, deliveries: Delivery[]) {
  const summary = tournamentSummary([match], deliveries.map(d => ({ ...d, match_id: match.id })), []);
  const players = summary.players;
  const points = Math.max(0, ...players.map(p => p.points));
  let tied = players.filter(p => p.points === points);
  const wickets = Math.max(0, ...tied.map(p => p.wickets));
  tied = tied.filter(p => p.wickets === wickets);
  const runs = Math.max(0, ...tied.map(p => p.runs));
  tied = tied.filter(p => p.runs === runs);
  // Economy is comparable only when ALL remaining candidates bowled legal balls.
  if (tied.length > 1 && tied.every(p => p.bowlingOvers > 0)) {
    const economy = Math.min(...tied.map(bowlingEconomy));
    tied = tied.filter(p => Math.abs(bowlingEconomy(p) - economy) < 1e-9);
  }
  return {
    winners: match.status === "completed" && deliveries.length ? tied : [],
    players: [...players].sort((a,b) => b.points - a.points || b.wickets - a.wickets || b.runs - a.runs || a.name.localeCompare(b.name)),
    uncreditedFielding: summary.uncreditedFielding,
  };
}
