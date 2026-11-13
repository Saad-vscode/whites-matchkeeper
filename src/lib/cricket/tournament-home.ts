import type { tournamentSummary } from "./tournament-summary";
import { matchStageTitle } from "./match-stage";

type MatchSummary = ReturnType<typeof tournamentSummary>["matches"][number];

export function tournamentHonours(rows: MatchSummary[]) {
  // A finished group stage is not a finished tournament. Ambiguous finals
  // and undecided results must never produce an invented champion.
  if (rows.some(({ m }) => m.status === "scheduled" || m.status === "live")) return null;
  const finals = rows.filter(
    ({ m }) => m.status !== "cancelled" && matchStageTitle(m.rules) === "Final",
  );
  const final = finals[0];
  if (finals.length !== 1 || !final) return null;
  const { m, outcome } = final;
  if (m.status !== "completed" || !outcome || outcome.winner === "tie") return null;
  const aWon = outcome.winner === "A";
  return {
    champion: { id: aWon ? m.team_a_id : m.team_b_id, name: aWon ? m.team_a : m.team_b },
    runnerUp: { id: aWon ? m.team_b_id : m.team_a_id, name: aWon ? m.team_b : m.team_a },
  };
}

export function recentTournamentMatches(rows: MatchSummary[]) {
  return rows
    .filter(({ m }) => m.status === "completed" || m.status === "abandoned")
    .sort(
      (a, b) =>
        Date.parse(b.m.created_at) - Date.parse(a.m.created_at) || b.m.id.localeCompare(a.m.id),
    )
    .slice(0, 6);
}
