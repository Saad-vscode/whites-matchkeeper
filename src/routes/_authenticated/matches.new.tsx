import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { SiteHeader } from "@/components/cricket/bits";

export const Route = createFileRoute("/_authenticated/matches/new")({
  head: () => ({
    meta: [
      { title: "New match — Crease" },
      { name: "description", content: "Set up a quick cricket match with your own rules." },
      { property: "og:title", content: "New match — Crease" },
      { property: "og:description", content: "Set up a quick cricket match with your own rules." },
    ],
  }),
  component: NewMatch,
});

const PRESETS = [
  { label: "T20", overs: 20, bpo: 6, players: 11 },
  { label: "10 overs", overs: 10, bpo: 6, players: 11 },
  { label: "6-a-side", overs: 5, bpo: 6, players: 6 },
  { label: "8 · 5-ball", overs: 4, bpo: 5, players: 8 },
];

function parsePlayers(text: string, n: number, team: string) {
  const names = text.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
  const out = Array.from(new Set(names)).slice(0, n);
  for (let i = out.length; i < n; i++) out.push(`${team} ${i + 1}`);
  return out;
}

function NewMatch() {
  const navigate = useNavigate();
  const [f, setF] = useState({
    name: "Quick match",
    teamA: "",
    teamB: "",
    playersA: "",
    playersB: "",
    overs: 10,
    bpo: 6,
    players: 11,
    venue: "",
    date: new Date().toISOString().slice(0, 10),
    wideRuns: 1,
    noBallRuns: 1,
    lastManBats: false,
    maxOvers: "",
    scorerEmail: "",
  });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.teamA.trim() || !f.teamB.trim()) { toast.error("Enter both team names."); return; }
    if (f.teamA.trim().toLowerCase() === f.teamB.trim().toLowerCase()) { toast.error("Teams must be different."); return; }
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("matches")
      .insert({
        created_by: u.user!.id,
        name: f.name.trim() || "Quick match",
        team_a: f.teamA.trim(),
        team_b: f.teamB.trim(),
        team_a_players: parsePlayers(f.playersA, f.players, f.teamA.trim()),
        team_b_players: parsePlayers(f.playersB, f.players, f.teamB.trim()),
        overs: f.overs,
        balls_per_over: f.bpo,
        players_per_team: f.players,
        venue: f.venue.trim() || null,
        match_date: f.date || null,
        rules: {
          wideRuns: f.wideRuns,
          noBallRuns: f.noBallRuns,
          lastManBats: f.lastManBats,
          maxOversPerBowler: f.maxOvers ? Number(f.maxOvers) : null,
        },
      })
      .select("id")
      .single();
    if (error || !data) {
      setBusy(false);
      { toast.error(error?.message ?? "Could not create match"); return; }
    }
    if (f.scorerEmail.trim()) {
      const { error: e2 } = await supabase.rpc("assign_scorer", { _match: data.id, _email: f.scorerEmail.trim() });
      if (e2) toast.error(`Match created, but scorer not added: ${e2.message}`);
    }
    navigate({ to: "/score/$matchId", params: { matchId: data.id } });
  };

  const num = (k: "overs" | "bpo" | "players" | "wideRuns" | "noBallRuns", min: number, max: number) => (
    <Input type="number" min={min} max={max} value={f[k]} onChange={(e) => set(k, Math.max(min, Math.min(max, Number(e.target.value) || min)))} />
  );

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-4xl font-extrabold text-primary">New quick match</h1>
        <form onSubmit={submit} className="mt-6 space-y-8">
          <Section title="Teams">
            <Field label="Match name"><Input value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-3">
                <Field label="Team A"><Input required value={f.teamA} onChange={(e) => set("teamA", e.target.value)} placeholder="e.g. Colombo Lions" /></Field>
                <Field label="Players (optional)">
                  <Textarea rows={4} value={f.playersA} onChange={(e) => set("playersA", e.target.value)} placeholder="One per line or comma separated" />
                </Field>
              </div>
              <div className="space-y-3">
                <Field label="Team B"><Input required value={f.teamB} onChange={(e) => set("teamB", e.target.value)} placeholder="e.g. Kandy Tuskers" /></Field>
                <Field label="Players (optional)">
                  <Textarea rows={4} value={f.playersB} onChange={(e) => set("playersB", e.target.value)} placeholder="Missing names are filled automatically" />
                </Field>
              </div>
            </div>
          </Section>

          <Section title="Format">
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <Button key={p.label} type="button" variant="outline" size="sm" onClick={() => setF((s) => ({ ...s, overs: p.overs, bpo: p.bpo, players: p.players }))}>
                  {p.label}
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Overs">{num("overs", 1, 100)}</Field>
              <Field label="Balls / over">{num("bpo", 1, 12)}</Field>
              <Field label="Players / side">{num("players", 2, 15)}</Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Venue"><Input value={f.venue} onChange={(e) => set("venue", e.target.value)} /></Field>
              <Field label="Date"><Input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} /></Field>
            </div>
          </Section>

          <Section title="Rules">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Wide runs">{num("wideRuns", 0, 5)}</Field>
              <Field label="No-ball runs">{num("noBallRuns", 0, 5)}</Field>
              <Field label="Max overs / bowler">
                <Input type="number" min={1} placeholder="No limit" value={f.maxOvers} onChange={(e) => set("maxOvers", e.target.value)} />
              </Field>
            </div>
            <label className="flex items-center justify-between gap-4 rounded-md border border-border bg-card p-3">
              <span>
                <span className="block font-medium">Last man bats</span>
                <span className="text-sm text-muted-foreground">The final batter can continue alone.</span>
              </span>
              <Switch checked={f.lastManBats} onCheckedChange={(v) => set("lastManBats", v)} />
            </label>
          </Section>

          <Section title="Scorer">
            <Field label="Extra scorer's email (optional)">
              <Input type="email" value={f.scorerEmail} onChange={(e) => set("scorerEmail", e.target.value)} placeholder="They need a Crease account" />
            </Field>
            <p className="text-sm text-muted-foreground">You can always score your own matches.</p>
          </Section>

          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            Create match
          </Button>
        </form>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="border-b border-border pb-1 text-xl font-bold">{title}</h2>
      {children}
    </section>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
