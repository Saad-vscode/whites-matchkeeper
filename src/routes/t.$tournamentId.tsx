import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader, StatusPill } from "@/components/cricket/bits";
import type { Delivery } from "@/lib/cricket/engine";
import { matchOutcome, standings } from "@/lib/cricket/tournament";

export const Route = createFileRoute("/t/$tournamentId")({
  head: () => ({
    meta: [
      { title: "Tournament — Crease" },
      { name: "description", content: "Fixtures, results and the live points table." },
      { property: "og:title", content: "Tournament — Crease" },
      { property: "og:description", content: "Fixtures, results and the live points table." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TournamentPage,
});

function TournamentPage() {
  const { tournamentId } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["tournament-public", tournamentId],
    refetchInterval: 20000,
    queryFn: async () => {
      const [t, teams, matches] = await Promise.all([
        supabase.from("tournaments").select("*").eq("id", tournamentId).maybeSingle(),
        supabase.from("tournament_teams").select("*").eq("tournament_id", tournamentId).order("name"),
        supabase.from("matches").select("*").eq("tournament_id", tournamentId).order("match_date").order("created_at"),
      ]);
      const ms = matches.data ?? [];
      const ids = ms.filter((m) => m.status !== "scheduled" || m.toss_winner).map((m) => m.id);
      const del = ids.length ? (await supabase.from("deliveries").select("*").in("match_id", ids)).data ?? [] : [];
      return { t: t.data, teams: teams.data ?? [], matches: ms, deliveries: del as unknown as (Delivery & { match_id: string })[] };
    },
  });

  if (isLoading) return <div className="min-h-screen"><SiteHeader /><p className="p-10 text-center text-muted-foreground">Loading…</p></div>;
  if (!data?.t) return <div className="min-h-screen"><SiteHeader /><p className="p-10 text-center text-muted-foreground">Tournament not found.</p></div>;
  const { t, teams, matches, deliveries } = data;

  const results = matches.map((m) => ({ m, outcome: matchOutcome(m, deliveries.filter((d) => d.match_id === m.id)) }));
  const table = standings(
    teams.map((x) => ({ id: x.id, name: x.name })),
    results.map((r) => ({ teamA: r.m.team_a_id, teamB: r.m.team_b_id, outcome: r.outcome })),
    { win: t.points_win, tie: t.points_tie, loss: t.points_loss },
    t.balls_per_over,
  );
  const colorOf = (id: string | null) => teams.find((x) => x.id === id)?.color;

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <header style={{ background: t.primary_color, borderBottom: `6px solid ${t.accent_color}` }}>
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-8">
          {t.logo_url && <img src={t.logo_url} alt="" className="h-16 w-16 rounded-full bg-card object-cover" />}
          <div className="text-primary-foreground">
            <div className="text-xs font-bold uppercase tracking-[0.25em] opacity-80">{t.short_name ?? "Tournament"}</div>
            <h1 className="text-4xl font-extrabold">{t.name}</h1>
            <div className="text-sm opacity-80">{t.overs} overs · {teams.length} teams</div>
          </div>
        </div>
      </header>
      <main className="mx-auto grid max-w-5xl gap-8 px-4 py-8 lg:grid-cols-[1.2fr_1fr]">
        <section>
          <h2 className="mb-3 border-b border-border pb-1 text-xl font-bold">Points table</h2>
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="p-2 text-left">#</th><th className="p-2 text-left">Team</th>
                  <th className="p-2">P</th><th className="p-2">W</th><th className="p-2">L</th><th className="p-2">T</th>
                  <th className="p-2">NRR</th><th className="p-2">Pts</th>
                </tr>
              </thead>
              <tbody>
                {table.map((r, i) => (
                  <tr key={r.teamId} className="border-b border-border last:border-0">
                    <td className="p-2 text-muted-foreground">{i + 1}</td>
                    <td className="p-2 font-semibold"><span className="mr-2 inline-block h-3 w-3 rounded-full align-middle" style={{ background: colorOf(r.teamId) }} />{r.name}</td>
                    <td className="score-num p-2 text-center">{r.played}</td>
                    <td className="score-num p-2 text-center">{r.won}</td>
                    <td className="score-num p-2 text-center">{r.lost}</td>
                    <td className="score-num p-2 text-center">{r.tied}</td>
                    <td className="score-num p-2 text-center">{r.nrr >= 0 ? "+" : ""}{r.nrr.toFixed(3)}</td>
                    <td className="score-num p-2 text-center font-bold">{r.points}</td>
                  </tr>
                ))}
                {table.length === 0 && <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">No teams yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
        <section>
          <h2 className="mb-3 border-b border-border pb-1 text-xl font-bold">Fixtures & results</h2>
          <div className="space-y-2">
            {results.map(({ m, outcome }) => (
              <Link key={m.id} to="/match/$matchId" params={{ matchId: m.id }} className="block rounded-lg border border-border bg-card p-3 hover:border-primary">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{m.team_a} v {m.team_b}</span>
                  <StatusPill status={m.status} />
                </div>
                <div className="text-xs text-muted-foreground">
                  {m.match_date}{m.venue ? ` · ${m.venue}` : ""}
                  {outcome && ` · ${outcome.A.runs} – ${outcome.B.runs} · ${outcome.winner === "tie" ? "Tied" : `${outcome.winner === "A" ? m.team_a : m.team_b} won`}`}
                </div>
              </Link>
            ))}
            {results.length === 0 && <p className="text-sm text-muted-foreground">No fixtures yet.</p>}
          </div>
        </section>
      </main>
    </div>
  );
}
