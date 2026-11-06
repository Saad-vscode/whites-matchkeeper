import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumField } from "@/components/cricket/num-field";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SiteHeader } from "@/components/cricket/bits";

export const Route = createFileRoute("/_authenticated/tournaments/new")({
  head: () => ({
    meta: [
      { title: "New tournament — Crease" },
      { name: "description", content: "Create a branded cricket tournament with fixtures and a points table." },
      { property: "og:title", content: "New tournament — Crease" },
      { property: "og:description", content: "Create a branded cricket tournament with fixtures and a points table." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewTournament,
});

function NewTournament() {
  const navigate = useNavigate();
  const [f, setF] = useState({
    name: "", short: "", primary: "#1f4d3a", accent: "#c8a24a", logo: "",
    overs: 20, bpo: 6, players: 11, wideRuns: 1, noBallRuns: 1, lastManBats: false, maxOvers: "",
    win: 2, tie: 1, loss: 0,
  });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const num = (k: "overs" | "bpo" | "players" | "wideRuns" | "noBallRuns" | "win" | "tie" | "loss", min: number, max: number) => (
    <NumField min={min} max={max} value={f[k]} onChange={(v) => set(k, v)} />
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) { toast.error("Enter a tournament name."); return; }
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("tournaments").insert({
      created_by: u.user!.id,
      name: f.name.trim(),
      short_name: f.short.trim() || null,
      primary_color: f.primary,
      accent_color: f.accent,
      logo_url: f.logo.trim() || null,
      overs: f.overs, balls_per_over: f.bpo, players_per_team: f.players,
      rules: { wideRuns: f.wideRuns, noBallRuns: f.noBallRuns, lastManBats: f.lastManBats, maxOversPerBowler: f.maxOvers ? Number(f.maxOvers) : null },
      points_win: f.win, points_tie: f.tie, points_loss: f.loss,
    }).select("id").single();
    setBusy(false);
    if (error || !data) { toast.error(error?.message ?? "Could not create tournament"); return; }
    navigate({ to: "/tournaments/$tournamentId/manage", params: { tournamentId: data.id } });
  };

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-4xl font-extrabold text-primary">New tournament</h1>
        <form onSubmit={submit} className="mt-6 space-y-8">
          <Sec title="Branding">
            <F label="Name"><Input required value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Colombo Premier League" /></F>
            <div className="grid gap-3 sm:grid-cols-2">
              <F label="Short name"><Input value={f.short} onChange={(e) => set("short", e.target.value)} placeholder="CPL" /></F>
              <F label="Logo image link (optional)"><Input value={f.logo} onChange={(e) => set("logo", e.target.value)} placeholder="https://…" /></F>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <F label="Main colour"><Input type="color" value={f.primary} onChange={(e) => set("primary", e.target.value)} /></F>
              <F label="Accent colour"><Input type="color" value={f.accent} onChange={(e) => set("accent", e.target.value)} /></F>
            </div>
          </Sec>
          <Sec title="Format (used for every fixture)">
            <div className="grid grid-cols-3 gap-3">
              <F label="Overs">{num("overs", 1, 100)}</F>
              <F label="Balls / over">{num("bpo", 1, 12)}</F>
              <F label="Players / side">{num("players", 2, 15)}</F>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <F label="Wide runs">{num("wideRuns", 0, 5)}</F>
              <F label="No-ball runs">{num("noBallRuns", 0, 5)}</F>
              <F label="Max overs / bowler"><Input type="number" min={1} placeholder="No limit" value={f.maxOvers} onChange={(e) => set("maxOvers", e.target.value)} /></F>
            </div>
            <label className="flex items-center justify-between gap-4 rounded-md border border-border bg-card p-3">
              <span className="font-medium">Last man bats</span>
              <Switch checked={f.lastManBats} onCheckedChange={(v) => set("lastManBats", v)} />
            </label>
          </Sec>
          <Sec title="Points">
            <div className="grid grid-cols-3 gap-3">
              <F label="Win">{num("win", 0, 10)}</F>
              <F label="Tie">{num("tie", 0, 10)}</F>
              <F label="Loss">{num("loss", 0, 10)}</F>
            </div>
          </Sec>
          <Button type="submit" size="lg" className="w-full" disabled={busy}>Create tournament</Button>
        </form>
      </main>
    </div>
  );
}

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-4"><h2 className="border-b border-border pb-1 text-xl font-bold">{title}</h2>{children}</section>;
}
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
