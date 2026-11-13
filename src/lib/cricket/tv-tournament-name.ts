/** Compact tournament identity for TV, with a full-name fallback. */
export function tvTournamentName(tournament?: { name: string; short_name?: string | null } | null) {
  return tournament?.short_name?.trim() || tournament?.name;
}
