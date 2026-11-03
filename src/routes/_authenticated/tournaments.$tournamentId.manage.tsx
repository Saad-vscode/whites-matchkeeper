import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SiteHeader, StatusPill } from "@/components/cricket/bits";

export const Route = createFileRoute("/_authenticated/tournaments/$tournamentId/manage")({
  head: () => ({
    meta: [
      { title: "Manage tournament — Crease" },
      { name: "description", content: "Add teams, players and fixtures to your tournament." },
      { property: "og:title", content: "Manage tournament — Crease" },
      { property: "og:description", content: "Add teams, players and fixtures to your tournament." },
    ],
  }),
  component: Manage,
});

function Manage() {
  const { tournamentId } = Route.useParams();
  const qc = useQueryClient();
  const key = ["tournament-manage", tournamentId];
  const { data } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const [t, teams, matches] = await Promise.all([
        supabase.from("tournaments").select("*").eq("id", tournamentId).single(),
        supabase.from("tournament_teams").select("*").eq("tournament_id", tournamentId).order("created_at"),
        supabase.from("matches").select("*").eq("tournament_id", tournamentId).order("match_date").order("created_at"),
      ]);
      return { t: t.data, teams: teams.data ?? [], matches: matches.data ?? [] };
    },
  });
  const reload = () => qc.invalidateQueries({ queryKey: key });

  const [team, setTeam] = useState({ name: "", short: "", color: "#1f4d3a", players: "" });
  const [fx, setFx] = useState({ a: "", b: "", date: new Date().toISOString().slice(0, 10), venue: "", scorer: "" });

  if (!data?.t) return <div className="min-h-screen"><SiteHeader /><p className="p-10 text-center text-muted-foreground">Loading…</p></div>;
  const t = data.t;

  const addTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!team.name.trim()) return;
    const names = Array.from(new Set(team.players.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)));
    const { error } = await supabase.from("tournament_teams").insert({
      tournament_id: t.id, name: team.name.trim(), short_name: team.short.trim() || null, color: team.color, players: names,
    });
    if (error) return toast.error(error.message.includes("duplicate") ? "A team with that name already exists." : error.message);
    setTeam({ name: "", short: "", color: "#1f4d3a", players: "" });
    reload();
  };

  const removeTeam = async (id: string) => {
    const { error } = await supabase.from("tournament_teams").delete().eq("id", id);
    if (error) toast.error(error.message); else reload();
  };

  const addFixture = async (e: React.FormEvent) => {
    e.preventDefault();
    const A = data.teams.find((x) => x.id === fx.a);
    const B = data.teams.find((x) => x.id === fx.b);
    if (!A || !B || A.id === B.id) return toast.error("Pick two different teams.");
    const fill = (list: string[], name: string) => {
      const out = list.slice(0, t.players_per_team);
      for (let i = out.length; i < t.players_per_team; i++) out.push(`${name} ${i + 1}`);
      return out;
    };
    const { data: u } = await supabase.auth.getUser();
    const { data: m, error } = await supabase.from("matches").insert({
      created_by: u.user!.id, tournament_id: t.id, team_a_id: A.id, team_b_id: B.id,
      name: t.short_name || t.name, team_a: A.name, team_b: B.name,
      team_a_players: fill(A.players, A.name), team_b_players: fill(B.players, B.name),
      overs: t.overs, balls_per_over: t.balls_per_over, players_per_team: t.players_per_team, rules: t.rules,
      venue: fx.venue.trim() || null, match_date: fx.date || null,
    }).select("id").single();
    if (error || !m) return toast.error(error?.message ?? "Could not add fixture");
    if (fx.scorer.trim()) {
      const { error: e2 } = await supabase.rpc("assign_scorer", { _match: m.id, _email: fx.scorer.trim() });
      if (e2) toast.error(`Fixture added, but scorer not added: ${e2.message}`);
    }
    setFx((p) => ({ ...p, a: "", b: "" }));
    toast.success("Fixture added");
    reload();
  };

  const sel = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl space-y-10 px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-4xl font-extrabold text-primary">{t.name}</h1>
            <p className="text-sm text-muted-foreground">{t.overs} overs · {t.balls_per_over}-ball overs · {t.players_per_team} a side</p>
          </div>
          <Button asChild variant="outline"><Link to="/t/$tournamentId" params={{ tournamentId: t.id }}>Public page</Link></Button>
        </div>

        <section className="space-y-4">
          <h2 className="border-b border-border pb-1 text-xl font-bold">Teams ({data.teams.length})</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {data.teams.map((x) => (
              <div key={x.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card p-3">
                <div className="flex items-center gap-2">
                  <span className="h-4 w-4 rounded-full" style={{ background: x.color }} />
                  <span className="font-semibold">{x.name}</span>
                  <span className="text-xs text-muted-foreground">{x.players.length} players</span>
                </div>
                <Button size="sm" variant="ghost" onClick={() => removeTeam(x.id)}>Remove</Button>
              </div>
            ))}
          </div>
          <form onSubmit={addTeam} className="space-y-3 rounded-lg border border-dashed border-border p-4">
            <div className="grid grid-cols-[1fr_6rem_4rem] gap-2">
              <div className="space-y-1.5"><Label>Team name</Label><Input value={team.name} onChange={(e) => setTeam({ ...team, name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Short</Label><Input value={team.short} onChange={(e) => setTeam({ ...team, short: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Colour</Label><Input type="color" value={team.color} onChange={(e) => setTeam({ ...team, color: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label>Players</Label><Textarea rows={3} value={team.players} onChange={(e) => setTeam({ ...team, players: e.target.value })} placeholder="One per line or comma separated" /></div>
            <Button type="submit" size="sm">Add team</Button>
          </form>
        </section>

        <section className="space-y-4">
          <h2 className="border-b border-border pb-1 text-xl font-bold">Fixtures ({data.matches.length})</h2>
          {data.teams.length >= 2 ? (
            <form onSubmit={addFixture} className="grid gap-3 rounded-lg border border-dashed border-border p-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Home</Label><select className={sel} value={fx.a} onChange={(e) => setFx({ ...fx, a: e.target.value })}><option value="">Choose…</option>{data.teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
              <div className="space-y-1.5"><Label>Away</Label><select className={sel} value={fx.b} onChange={(e) => setFx({ ...fx, b: e.target.value })}><option value="">Choose…</option>{data.teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
              <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={fx.date} onChange={(e) => setFx({ ...fx, date: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Venue</Label><Input value={fx.venue} onChange={(e) => setFx({ ...fx, venue: e.target.value })} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label>Scorer's email (optional)</Label><Input type="email" value={fx.scorer} onChange={(e) => setFx({ ...fx, scorer: e.target.value })} /></div>
              <Button type="submit" size="sm" className="sm:col-span-2">Add fixture</Button>
            </form>
          ) : <p className="text-sm text-muted-foreground">Add at least two teams to create fixtures.</p>}
          <div className="space-y-2">
            {data.matches.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-3">
                <div>
                  <div className="flex items-center gap-2 font-semibold">{m.team_a} v {m.team_b} <StatusPill status={m.status} /></div>
                  <div className="text-xs text-muted-foreground">{m.match_date}{m.venue ? ` · ${m.venue}` : ""}</div>
                </div>
                <Button asChild size="sm"><Link to="/score/$matchId" params={{ matchId: m.id }}>{m.status === "completed" ? "Open" : "Score"}</Link></Button>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
