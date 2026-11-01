import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { SiteHeader, StatusPill } from "@/components/cricket/bits";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "My matches — Crease" },
      { name: "description", content: "Matches you created or score." },
      { property: "og:title", content: "My matches — Crease" },
      { property: "og:description", content: "Matches you created or score." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { user } = Route.useRouteContext();
  const { data, isLoading } = useQuery({
    queryKey: ["my-matches", user.id],
    queryFn: async () => {
      const { data: assigned } = await supabase.from("match_scorers").select("match_id").eq("user_id", user.id);
      const ids = (assigned ?? []).map((a) => a.match_id);
      let q = supabase.from("matches").select("*").order("created_at", { ascending: false });
      q = ids.length ? q.or(`created_by.eq.${user.id},id.in.(${ids.join(",")})`) : q.eq("created_by", user.id);
      const { data } = await q;
      return data ?? [];
    },
  });

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex items-end justify-between gap-4">
          <h1 className="text-4xl font-extrabold text-primary">My matches</h1>
          <Button asChild>
            <Link to="/matches/new">New match</Link>
          </Button>
        </div>
        <div className="mt-6 space-y-3">
          {isLoading && <p className="text-muted-foreground">Loading…</p>}
          {data?.length === 0 && <p className="text-muted-foreground">No matches yet. Create your first one.</p>}
          {data?.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-display text-lg font-bold">
                    {m.team_a} v {m.team_b}
                  </span>
                  <StatusPill status={m.status} />
                </div>
                <div className="text-sm text-muted-foreground">
                  {m.name} · {m.overs} overs · {m.balls_per_over}-ball overs · {m.players_per_team} a side
                  {m.created_by !== user.id && " · you are scorer"}
                </div>
              </div>
              <div className="flex gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link to="/match/$matchId" params={{ matchId: m.id }}>
                    View
                  </Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/score/$matchId" params={{ matchId: m.id }}>
                    {m.status === "completed" ? "Open" : "Score"}
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
