import { configOf, getLive, type Derived, type MatchRow } from "./match";

export function tvPlayers(match: MatchRow, d: Derived) {
  const live = getLive(match), s = d.current;
  const last = s.currentOver.at(-1);
  const used = new Set([live.striker, live.nonStriker].filter(Boolean));
  const names = [live.striker, live.nonStriker].map((name, index) => {
    if (name) return { name, faded: false };
    if (index === 1 && configOf(match).rules.lastManBats && s.wickets >= match.players_per_team - 1) return { name: null, faded: false };
    const expected = index === 0 ? s.next.striker : s.next.nonStriker;
    const previous = [expected, last?.wicket?.playerOut, last?.striker, last?.non_striker]
      .find(n => n && !used.has(n));
    if (previous) used.add(previous);
    return { name: previous ?? null, faded: !!previous };
  });
  return { batters: names, bowler: { name: live.bowler || s.next.lastBowler, faded: !live.bowler && !!s.next.lastBowler } };
}
