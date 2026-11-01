import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { SiteHeader, StatusPill } from "@/components/cricket/bits";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Crease — Live Cricket Scoring" },
      { name: "description", content: "Score cricket ball by ball and share live scoreboards with everyone watching." },
      { property: "og:title", content: "Crease — Live Cricket Scoring" },
      { property: "og:description", content: "Score cricket ball by ball and share live scoreboards with everyone watching." },
    ],
  }),
  component: Index,
});

function Index() {
  const { data: matches } = useQuery({
    queryKey: ["public-matches"],
    queryFn: async () => {
      const { data } = await supabase
        .from("matches")
        .select("id,name,team_a,team_b,status,venue,match_date,result,overs,balls_per_over")
        .order("updated_at", { ascending: false })
        .limit(30);
      return data ?? [];
    },
  });
  const live = matches?.filter((m) => m.status === "live" || m.status === "innings_break" || m.status === "paused") ?? [];
  const rest = matches?.filter((m) => !live.includes(m)) ?? [];

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <section className="border-b border-border pinstripe">
        <div className="mx-auto max-w-5xl px-4 py-14 sm:py-20">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-accent">Every ball, as it happens</p>
          <h1 className="mt-3 max-w-2xl text-5xl font-extrabold leading-[1.02] text-primary sm:text-6xl">
            Score the match. Everyone else watches it live.
          </h1>
          <p className="mt-4 max-w-xl text-muted-foreground">
            Any overs, any team size, any balls per over. Big buttons for the scorer, a live scorecard for the crowd, and a full-screen board for the TV.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/matches/new">Start a quick match</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/dashboard">My matches</Link>
            </Button>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-5xl space-y-10 px-4 py-10">
        <MatchList title="Live now" items={live} empty="No matches are live right now." />
        <MatchList title="Recent & upcoming" items={rest} empty="No matches yet — start the first one." />
      </main>
    </div>
  );
}

type Item = { id: string; name: string; team_a: string; team_b: string; status: string; venue: string | null; result: string | null };

function MatchList({ title, items, empty }: { title: string; items: Item[]; empty: string }) {
  return (
    <section>
      <h2 className="mb-4 text-2xl font-bold">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((m) => (
            <Link
              key={m.id}
              to="/match/$matchId"
              params={{ matchId: m.id }}
              className="group rounded-lg border border-border bg-card p-4 transition hover:border-primary"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">{m.name}</span>
                <StatusPill status={m.status} />
              </div>
              <div className="mt-2 font-display text-xl font-bold">
                {m.team_a} <span className="text-muted-foreground">v</span> {m.team_b}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">{m.result ?? m.venue ?? "\u00a0"}</div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
