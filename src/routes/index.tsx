import { MatchShelf, splitMatches } from "@/components/cricket/match-shelf";
import type { MatchRow } from "@/lib/cricket/match";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/cricket/bits";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Crease — Live Cricket Scoring" },
      {
        name: "description",
        content: "Score cricket ball by ball and share live scoreboards with everyone watching.",
      },
      { property: "og:title", content: "Crease — Live Cricket Scoring" },
      {
        property: "og:description",
        content: "Score cricket ball by ball and share live scoreboards with everyone watching.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  const {
    data = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["public-matches"],
    queryFn: async () => {
      const rows: MatchRow[] = [];
      for (let start = 0; ; start += 500) {
        const result = await supabase
          .from("matches")
          .select("*")
          .order("created_at", { ascending: false })
          .order("id")
          .range(start, start + 499);
        if (result.error) throw result.error;
        rows.push(...result.data);
        if (result.data.length < 500) break;
      }
      return rows;
    },
    refetchInterval: 10000,
  });
  const groups = splitMatches(data);
  return (
    <div className="tournament-page front-page min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl space-y-12 px-5 py-8 sm:px-8 sm:py-12">
        <section className="front-hero">
          <div className="relative z-10 max-w-2xl">
            <p className="front-eyebrow">Your game. Every moment.</p>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">
              Bring your match
              <br />
              <span className="text-primary">to everyone.</span>
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground">
              From the first toss to the final ball. Score your cricket, follow your teams, and
              share every moment live.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/matches/new">Start a match</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/tournaments/new">Create tournament</Link>
              </Button>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs font-semibold text-muted-foreground">
              <span>Live scorecards</span>
              <span>Your match rules</span>
              <span>Big-screen scoreboards</span>
            </div>
          </div>
          <div className="front-pitch" aria-hidden="true">
            <div />
            <span>EVERY BALL COUNTS</span>
          </div>
        </section>
        {isLoading && <p role="status">Loading matches…</p>}
        {error && (
          <p role="alert" className="rounded-xl bg-muted p-4">
            Matches are temporarily unavailable. Please try again shortly.
          </p>
        )}
        {!isLoading && !error && (
          <>
            <MatchShelf title="Live Now" matches={groups.live} />
            <MatchShelf title="Upcoming Matches" matches={groups.upcoming} />
            <MatchShelf title="Recent Matches" matches={groups.recent} />
          </>
        )}
        <footer className="flex flex-wrap justify-between gap-3 border-t border-border py-6 text-sm text-muted-foreground">
          <span className="font-bold text-primary">Crease</span>
          <span>A place for every cricket match.</span>
          <Link to="/dashboard" className="font-semibold text-primary">
            Go to My Matches →
          </Link>
        </footer>
      </main>
    </div>
  );
}
