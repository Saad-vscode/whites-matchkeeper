import { MatchShelf, splitMatches } from "@/components/cricket/match-shelf";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/cricket/bits";
import { useEffect, useState } from "react";
import { loadDraft, replay } from "@/lib/cricket/offline";
import type { MatchRow } from "@/lib/cricket/match";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "My matches — Crease" },
      { name: "description", content: "Matches you created or score." },
      { property: "og:title", content: "My matches — Crease" },
      { property: "og:description", content: "Matches you created or score." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { user } = Route.useRouteContext();
  const [saved, setSaved] = useState<MatchRow[]>([]);
  useEffect(() => {
    const matches: MatchRow[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(`crease:score:v1:${user.id}:`)) continue;
      const draft = loadDraft(key);
      if (draft) matches.push(replay(draft.base, draft.queue).match);
    }
    setSaved(matches);
  }, [user.id]);
  const { data, isLoading, error } = useQuery({
    queryKey: ["my-matches", user.id],
    refetchInterval: 10000,
    queryFn: async () => {
      const { data: assigned } = await supabase
        .from("match_scorers")
        .select("match_id")
        .eq("user_id", user.id);
      const ids = (assigned ?? []).map((a) => a.match_id);
      let q = supabase.from("matches").select("*").order("created_at", { ascending: false });
      q = ids.length
        ? q.or(`created_by.eq.${user.id},id.in.(${ids.join(",")})`)
        : q.eq("created_by", user.id);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: tours } = useQuery({
    queryKey: ["my-tournaments", user.id],
    queryFn: async () =>
      (
        await supabase
          .from("tournaments")
          .select("*")
          .eq("created_by", user.id)
          .order("created_at", { ascending: false })
      ).data ?? [],
  });

  const groups = splitMatches(data ?? saved);
  return (
    <div className="tournament-page front-page min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <div className="front-page-heading">
          <div>
            <p className="front-eyebrow">Your cricket hub</p>
            <h1 className="mt-2 text-4xl font-extrabold tracking-tight">My Matches</h1>
            <p className="mt-3 text-muted-foreground">
              Your teams, your tournaments, your next great game.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link to="/tournaments/new">New tournament</Link>
            </Button>
            <Button asChild>
              <Link to="/matches/new">New match</Link>
            </Button>
          </div>
        </div>
        <div className="mt-10 space-y-10">
          {isLoading && !saved.length && <p role="status">Loading your matches…</p>}
          {error && (
            <p role="status" className="rounded-xl bg-muted p-4">
              Could not refresh matches. Showing matches saved on this device.
            </p>
          )}
          <MatchShelf title="Live Now" matches={groups.live} manage />
          <MatchShelf title="Upcoming Matches" matches={groups.upcoming} manage />
          <MatchShelf title="Recent Matches" matches={groups.recent} manage />
        </div>{" "}
        <div className="mt-12 flex items-end justify-between gap-4">
          <h2 className="text-2xl font-bold">My tournaments</h2>
          <Button asChild variant="outline">
            <Link to="/tournaments/new">New tournament</Link>
          </Button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {tours?.length === 0 && <p className="text-muted-foreground">No tournaments yet.</p>}
          {tours?.map((t) => (
            <div
              key={t.id}
              className="rounded-2xl border border-border bg-card p-5 shadow-sm"
              style={{ borderLeft: `6px solid ${t.primary_color}` }}
            >
              <div className="text-lg font-bold">{t.name}</div>
              <div className="text-sm text-muted-foreground">
                {t.overs} overs · {t.players_per_team} a side
              </div>
              <div className="mt-3 flex gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link to="/t/$tournamentId" params={{ tournamentId: t.id }}>
                    View
                  </Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/tournaments/$tournamentId/manage" params={{ tournamentId: t.id }}>
                    Manage
                  </Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
