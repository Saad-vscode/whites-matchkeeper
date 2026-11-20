import type { tournamentSummary } from "./tournament-summary";
import { matchStageTitle } from "./match-stage";

type MatchSummary = ReturnType<typeof tournamentSummary>["matches"][number];

export function tournamentHonours(rows: MatchSummary[]) {
  // A decided final establishes honours even if unused fixtures remain.
  // A finished group stage, ambiguous finals or undecided results do not.
  const bracketFinals = rows.filter(({ m }) => m.status !== "cancelled" &&
    !!m.rules && typeof m.rules === "object" && !Array.isArray(m.rules) && m.rules["playoffNode"] === "final");
  const finals = bracketFinals.length ? bracketFinals : rows.filter(
    ({ m }) => m.status !== "cancelled" && (
      matchStageTitle(m.rules)?.trim().toLowerCase() === "final" ||
      (!!m.rules && typeof m.rules === "object" && !Array.isArray(m.rules) && m.rules["playoffNode"] === "final")
    ),
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
