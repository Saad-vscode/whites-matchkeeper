import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Trophy } from "lucide-react";
import type { MatchRow } from "@/lib/cricket/match";
import { MatchShelf, splitMatches } from "./match-shelf";

export type PublicTournament = { id: string; name: string; short_name: string | null; logo_url: string | null; platform_archived?: boolean; platform_hidden?: boolean; platform_deleted_at?: string | null };
export function publicTournamentGroups(tournaments: PublicTournament[], matches: MatchRow[]) {
  const excluded = new Set(tournaments.filter(t => t.platform_archived || t.platform_hidden || t.platform_deleted_at).map(t => t.id));
  tournaments = tournaments.filter(t => !excluded.has(t.id));
  matches = matches.filter(m => {
    if (m.tournament_id) return !excluded.has(m.tournament_id);
    const visibility = m as MatchRow & { platform_hidden?: boolean; platform_archived?: boolean; platform_deleted_at?: string | null };
    return !visibility.platform_hidden && !visibility.platform_archived && !visibility.platform_deleted_at;
  });
  const buckets = new Map<string | null, MatchRow[]>();
  for (const m of matches) {
    if (!buckets.has(m.tournament_id)) buckets.set(m.tournament_id, []);
    buckets.get(m.tournament_id)!.push(m);
  }
  const known = new Set(tournaments.map(t => t.id));
  return [
    ...tournaments.map(t => ({ tournament: t, matches: buckets.get(t.id) ?? [] })),
    ...[...buckets].filter(([id]) => id && !known.has(id)).map(([id, fixtures]) => ({ tournament: { id: id!, name: fixtures[0]?.name ?? "Tournament", short_name: null, logo_url: null }, matches: fixtures })),
    ...(buckets.has(null) ? [{ tournament: null, matches: buckets.get(null)! }] : []),
  ];
}
export function PublicTournaments({ tournaments, matches }: { tournaments: PublicTournament[]; matches: MatchRow[] }) {
  const groups = publicTournamentGroups(tournaments, matches);
  return <div id="tournaments" className="space-y-10 scroll-mt-8">
    <div><p className="front-eyebrow">Follow the competition</p><h2 className="mt-2 text-3xl font-extrabold">Around the grounds</h2></div>
    {!groups.length && <p className="rounded-2xl border border-dashed border-border p-8 text-muted-foreground">Tournaments and matches will appear here.</p>}
    {groups.map(({ tournament: t, matches: fixtures }) => {
      const sections = splitMatches(fixtures);
      const heading = <><span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-card">{t?.logo_url ? <img src={t.logo_url} alt="" className="h-full w-full object-contain" /> : <Trophy className="text-primary" />}</span><span className="min-w-0 flex-1"><span className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t ? "Tournament" : "Independent fixtures"}</span><span className="mt-1 block break-words text-2xl font-extrabold">{t?.name ?? "Other matches"}</span></span>{t && <ArrowUpRight aria-hidden="true" className="shrink-0 text-primary" />}</>;
      return <section key={t?.id ?? "other"} aria-label={t?.name ?? "Other matches"} className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
        {t ? <Link to="/t/$tournamentId" params={{ tournamentId: t.id }} className="flex items-center gap-4 border-b border-border bg-primary/5 p-5 transition-colors hover:bg-primary/10 sm:p-7">{heading}</Link> : <h2 className="flex items-center gap-4 border-b border-border bg-muted/40 p-5 sm:p-7">{heading}</h2>}
        <div className="space-y-8 p-5 sm:p-7">
          {sections.live.length > 0 && <MatchShelf title="Live Now" matches={sections.live} />}
          {sections.recent.length > 0 && <MatchShelf title="Recent Matches" matches={sections.recent} />}
          {sections.upcoming.length > 0 && <MatchShelf title="Upcoming Matches" matches={sections.upcoming} />}
          {!fixtures.length && <p className="text-sm text-muted-foreground">Fixtures will appear once they are scheduled. Open the tournament to meet the teams.</p>}
        </div>
      </section>;
    })}
  </div>;
}
