type Squad = { players: string[]; captain?: string | null; vice_captain?: string | null };

export function playerRows(team?: Squad): string[] {
  const captain = team?.captain ?? "";
  const vice = team?.vice_captain ?? "";
  return [
    captain,
    vice,
    ...(team?.players ?? []).filter((name) => name !== captain && name !== vice),
  ];
}

export function validatePlayerRows(rows: string[]) {
  const players = rows.map((name) => name.trim());
  if (!players[0]) return { error: "Enter the captain's name." };
  if (!players[1]) return { error: "Enter the vice-captain's name." };
  const key = (name: string) => name.replace(/\s+/g, " ").toLocaleLowerCase();
  if (key(players[0]) === key(players[1]))
    return { error: "Captain and vice-captain must be different players." };
  if (players.some((name) => !name))
    return { error: "Enter a name in every player row or remove empty regular player rows." };
  if (new Set(players.map(key)).size !== players.length)
    return { error: "Each player can appear only once. Remove duplicate player names." };
  return { players, captain: players[0], vice_captain: players[1] };
}
