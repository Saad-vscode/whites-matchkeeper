import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BallChip, ConnBadge, StatusPill } from "@/components/cricket/bits";
import {
  bowlerEligibility,
  computeInnings,
  countsAsWicket,
  formatOvers,
  matchResult,
  requiredRunRate,
  runRate,
  type Delivery,
  type DismissalKind,
  type ExtraType,
  type Wicket,
} from "@/lib/cricket/engine";
import { battingSide, getLive, teamName, teamPlayers, useLiveMatch, type LiveState, type MatchRow } from "@/lib/cricket/match";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/score/$matchId")({
  head: () => ({
    meta: [
      { title: "Scoring — Crease" },
      { name: "description", content: "Ball-by-ball scoring console." },
      { property: "og:title", content: "Scoring — Crease" },
      { property: "og:description", content: "Ball-by-ball scoring console." },
    ],
  }),
  component: ScorePage,
});

function ScorePage() {
  const { matchId } = Route.useParams();
  const lm = useLiveMatch(matchId);
  const { match, derived } = lm;

  if (lm.error) return <Centered>{lm.error}</Centered>;
  if (!match || !derived) return <Centered>Loading match…</Centered>;

  const needsToss = !match.toss_winner;
  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-2 px-3 py-2">
          <Link to="/dashboard" className="text-sm font-semibold text-primary">
            ← Matches
          </Link>
          <ConnBadge conn={lm.conn} lastUpdated={lm.lastUpdated} />
        </div>
      </div>
      <main className="mx-auto max-w-xl px-3 py-4">
        {needsToss ? <TossSetup match={match} onDone={lm.refetch} /> : <Scorer lm={lm} />}
      </main>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center p-6 text-muted-foreground">{children}</div>;
}

/* ---------------------------------- Toss --------------------------------- */

function TossSetup({ match, onDone }: { match: MatchRow; onDone: () => void }) {
  const [winner, setWinner] = useState<"A" | "B" | null>(null);
  const [decision, setDecision] = useState<"bat" | "bowl" | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!winner || !decision) return;
    setSaving(true);
    const { error } = await supabase
      .from("matches")
      .update({ toss_winner: winner, toss_decision: decision, live: { innings: 1 } })
      .eq("id", match.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    onDone();
  };
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">{match.name}</p>
        <h1 className="text-3xl font-extrabold text-primary">
          {match.team_a} v {match.team_b}
        </h1>
      </div>
      <Summary match={match} />
      <div className="space-y-2">
        <Label>Who won the toss?</Label>
        <div className="grid grid-cols-2 gap-2">
          {(["A", "B"] as const).map((s) => (
            <Choice key={s} active={winner === s} onClick={() => setWinner(s)}>
              {teamName(match, s)}
            </Choice>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label>They chose to</Label>
        <div className="grid grid-cols-2 gap-2">
          <Choice active={decision === "bat"} onClick={() => setDecision("bat")}>Bat</Choice>
          <Choice active={decision === "bowl"} onClick={() => setDecision("bowl")}>Bowl</Choice>
        </div>
      </div>
      <Button size="lg" className="w-full" disabled={!winner || !decision || saving} onClick={save}>
        Confirm toss
      </Button>
    </div>
  );
}

function Summary({ match }: { match: MatchRow }) {
  const r = (match.rules ?? {}) as Record<string, unknown>;
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-border bg-card p-4 text-sm">
      <dt className="text-muted-foreground">Overs</dt><dd className="font-semibold">{match.overs}</dd>
      <dt className="text-muted-foreground">Balls per over</dt><dd className="font-semibold">{match.balls_per_over}</dd>
      <dt className="text-muted-foreground">Players per side</dt><dd className="font-semibold">{match.players_per_team}</dd>
      <dt className="text-muted-foreground">Wide / No-ball runs</dt><dd className="font-semibold">{String(r.wideRuns ?? 1)} / {String(r.noBallRuns ?? 1)}</dd>
      <dt className="text-muted-foreground">Max overs per bowler</dt><dd className="font-semibold">{r.maxOversPerBowler ? String(r.maxOversPerBowler) : "No limit"}</dd>
      <dt className="text-muted-foreground">Last man bats</dt><dd className="font-semibold">{r.lastManBats ? "Yes" : "No"}</dd>
    </dl>
  );
}

function Choice({ active, onClick, children, className }: { active?: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border-2 px-3 py-3 text-left font-semibold transition",
        active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary",
        className,
      )}
    >
      {children}
    </button>
  );
}

/* --------------------------------- Scorer -------------------------------- */

type LM = ReturnType<typeof useLiveMatch>;

function Scorer({ lm }: { lm: LM }) {
  const match = lm.match!;
  const d = lm.derived!;
  const live = getLive(match);
  const s = d.current;
  const innings = d.innings;
  const batting = teamPlayers(match, d.battingSide);
  const bowling = teamPlayers(match, d.bowlingSide);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<null | "wide" | "noball" | "bye" | "legbye" | "penalty" | "wicket" | "other">(null);
  const [confirmUndo, setConfirmUndo] = useState(false);

  const finished = match.status === "completed" || match.status === "abandoned" || match.status === "cancelled";
  const lastManAlone = d.cfg.rules.lastManBats && s.wickets === d.cfg.playersPerTeam - 1;
  const needStriker = !live.striker;
  const needNon = !live.nonStriker && !lastManAlone;
  const needBowler = !live.bowler;
  const needsSelection = !finished && match.status !== "innings_break" && (needStriker || needNon || needBowler);

  const outPlayers = useMemo(() => new Set(s.batters.filter((b) => b.out && countsAsWicket(b.out)).map((b) => b.name)), [s]);

  const updateLive = async (patch: Partial<MatchRow>) => {
    lm.setMatch((m) => (m ? { ...m, ...patch } : m));
    const { error } = await supabase.from("matches").update(patch).eq("id", match.id);
    if (error) {
      toast.error(error.message);
      lm.refetch();
      return false;
    }
    return true;
  };

  const record = async (p: { runs_bat?: number; extra_type?: ExtraType; extras?: number; wicket?: Wicket | null; swapAfter?: boolean }) => {
    if (busy || needsSelection || finished) return;
    if (!live.striker || !live.bowler) return;
    setBusy(true);
    const mine = lm.deliveries.filter((x) => x.innings === innings);
    const seq = (mine.reduce((m, x) => Math.max(m, x.seq), 0) || 0) + 1;
    const del: Delivery = {
      id: crypto.randomUUID(),
      innings,
      seq,
      striker: live.striker,
      non_striker: live.nonStriker ?? "",
      bowler: live.bowler,
      runs_bat: p.runs_bat ?? 0,
      extra_type: p.extra_type ?? "none",
      extras: p.extras ?? 0,
      wicket: p.wicket ?? null,
    };
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("deliveries").insert({ ...del, wicket: del.wicket as never, created_by: u.user!.id });
    if (error) {
      setBusy(false);
      toast.error(error.code === "23505" ? "That ball was already recorded — refreshing." : error.message);
      lm.refetch();
      return;
    }
    const all = [...lm.deliveries, del];
    lm.setDeliveries(all);
    const target = innings === 2 ? d.target : null;
    const ns = computeInnings(all.filter((x) => x.innings === innings), d.cfg, target);
    let next: LiveState = {
      innings,
      striker: ns.next.striker,
      nonStriker: ns.next.nonStriker,
      bowler: ns.next.overComplete ? null : del.bowler,
    };
    if (p.swapAfter) next = { ...next, striker: next.nonStriker, nonStriker: next.striker };
    const patch: Partial<MatchRow> = { live: next as never, status: "live" };
    if (ns.complete) {
      if (innings === 1) {
        patch.live = { innings: 2 } as never;
        patch.status = "innings_break";
        toast.success(`Innings over: ${ns.runs}/${ns.wickets}. Target ${ns.runs + 1}.`);
      } else {
        const first = d.first;
        const res = matchResult(first, ns, d.cfg, teamName(match, battingSide(match, 1)), teamName(match, battingSide(match, 2)));
        patch.status = "completed";
        patch.result = res;
        patch.live = { innings: 2 } as never;
        toast.success(res ?? "Match complete");
      }
    }
    await updateLive(patch);
    setBusy(false);
    setDialog(null);
  };

  const undo = async () => {
    setConfirmUndo(false);
    let inn = innings;
    let mine = lm.deliveries.filter((x) => x.innings === inn);
    if (mine.length === 0 && inn === 2) {
      inn = 1;
      mine = lm.deliveries.filter((x) => x.innings === 1);
    }
    const last = mine.sort((a, b) => b.seq - a.seq)[0];
    if (!last) return toast("Nothing to undo.");
    setBusy(true);
    const { error } = await supabase.from("deliveries").delete().eq("id", last.id);
    if (error) {
      setBusy(false);
      return toast.error(error.message);
    }
    lm.setDeliveries(lm.deliveries.filter((x) => x.id !== last.id));
    await updateLive({
      status: "live",
      result: null,
      live: { innings: inn, striker: last.striker, nonStriker: last.non_striker || null, bowler: last.bowler } as never,
    });
    setBusy(false);
    toast("Last ball removed.");
  };

  const rr = runRate(s.runs, s.legalBalls, d.cfg.ballsPerOver);
  const rrr = d.target != null ? requiredRunRate(d.target, s, d.cfg) : null;
  const ballsLeft = d.cfg.overs * d.cfg.ballsPerOver - s.legalBalls;
  const strikerLine = s.batters.find((b) => b.name === live.striker);
  const nonLine = s.batters.find((b) => b.name === live.nonStriker);
  const bowlerLine = s.bowlers.find((b) => b.name === live.bowler);

  return (
    <div className="space-y-4">
      {/* scoreboard */}
      <section className="overflow-hidden rounded-xl bg-board text-board-foreground shadow-lg">
        <div className="flex items-center justify-between border-b border-board-line px-4 py-2 text-xs uppercase tracking-widest text-board-muted">
          <span>{match.name} · Innings {innings}</span>
          <StatusPill status={match.status} />
        </div>
        <div className="px-4 py-4">
          <div className="text-sm text-board-muted">{teamName(match, d.battingSide)} batting</div>
          <div className="flex items-end justify-between">
            <div className="score-num text-6xl leading-none">
              {s.runs}<span className="text-board-muted">/</span>{s.wickets}
            </div>
            <div className="text-right">
              <div className="score-num text-2xl">{formatOvers(s.legalBalls, d.cfg.ballsPerOver)}</div>
              <div className="text-xs text-board-muted">of {d.cfg.overs} overs</div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-board-muted">
            <span>CRR <b className="text-board-foreground">{rr.toFixed(2)}</b></span>
            {d.target != null && (
              <>
                <span>Target <b className="text-board-foreground">{d.target}</b></span>
                <span>Need <b className="text-board-foreground">{Math.max(0, d.target - s.runs)}</b> off {ballsLeft}</span>
                {rrr != null && <span>RRR <b className="text-board-foreground">{rrr.toFixed(2)}</b></span>}
              </>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px bg-board-line text-sm">
          <PlayerCell name={live.striker} strike stat={strikerLine ? `${strikerLine.runs} (${strikerLine.balls})` : ""} />
          <PlayerCell name={live.nonStriker} stat={nonLine ? `${nonLine.runs} (${nonLine.balls})` : ""} />
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-board-line px-4 py-2 text-sm">
          <span>
            <span className="text-board-muted">Bowling </span>
            <b>{live.bowler ?? "—"}</b>{" "}
            {bowlerLine && (
              <span className="score-num text-board-muted">
                {formatOvers(bowlerLine.balls, d.cfg.ballsPerOver)}-{bowlerLine.runs}-{bowlerLine.wickets}
              </span>
            )}
          </span>
        </div>
        <div className="flex min-h-12 items-center gap-1.5 overflow-x-auto bg-card/5 px-4 py-2">
          {s.currentOver.length === 0 ? <span className="text-xs text-board-muted">New over</span> : s.currentOver.map((b) => <BallChip key={b.id} d={b} />)}
        </div>
      </section>

      {match.status === "completed" && (
        <div className="rounded-lg border-2 border-primary bg-card p-4 text-center">
          <div className="font-display text-2xl font-bold text-primary">{match.result}</div>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setConfirmUndo(true)}>Undo last ball</Button>
        </div>
      )}

      {match.status === "innings_break" && (
        <SelectPlayers
          title={`Second innings — ${teamName(match, battingSide(match, 2))} need ${d.first.runs + 1}`}
          batting={teamPlayers(match, battingSide(match, 2))}
          bowling={teamPlayers(match, battingSide(match, 1))}
          need={{ striker: true, non: true, bowler: true }}
          out={new Set()}
          live={{}}
          eligibility={() => null}
          onSave={(v) => updateLive({ status: "live", live: { innings: 2, ...v } as never })}
          onUndo={() => setConfirmUndo(true)}
        />
      )}

      {needsSelection && (
        <SelectPlayers
          title={s.legalBalls === 0 && lm.deliveries.filter((x) => x.innings === innings).length === 0 ? "Openers" : needBowler && !needStriker && !needNon ? "Next over" : "New batter"}
          batting={batting}
          bowling={bowling}
          need={{ striker: needStriker, non: needNon, bowler: needBowler }}
          out={outPlayers}
          live={live}
          eligibility={(n) => bowlerEligibility(s, d.cfg, n)}
          onSave={(v) => updateLive({ status: "live", live: { ...live, innings, ...v } as never })}
          onUndo={lm.deliveries.length ? () => setConfirmUndo(true) : undefined}
        />
      )}

      {!finished && match.status !== "innings_break" && !needsSelection && (
        <section className="space-y-2">
          <div className="grid grid-cols-4 gap-2">
            {[0, 1, 2, 3].map((r) => (
              <RunBtn key={r} onClick={() => record({ runs_bat: r })} disabled={busy}>{r}</RunBtn>
            ))}
            <RunBtn tone="four" onClick={() => record({ runs_bat: 4 })} disabled={busy}>4</RunBtn>
            <RunBtn onClick={() => record({ runs_bat: 5 })} disabled={busy}>5</RunBtn>
            <RunBtn tone="six" onClick={() => record({ runs_bat: 6 })} disabled={busy}>6</RunBtn>
            <RunBtn small onClick={() => setDialog("other")} disabled={busy}>Other</RunBtn>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <RunBtn small tone="extra" onClick={() => setDialog("wide")} disabled={busy}>Wide</RunBtn>
            <RunBtn small tone="extra" onClick={() => setDialog("noball")} disabled={busy}>No ball</RunBtn>
            <RunBtn small onClick={() => setDialog("bye")} disabled={busy}>Bye</RunBtn>
            <RunBtn small onClick={() => setDialog("legbye")} disabled={busy}>Leg bye</RunBtn>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <RunBtn small tone="wicket" className="col-span-2" onClick={() => setDialog("wicket")} disabled={busy}>Wicket</RunBtn>
            <RunBtn small onClick={() => setDialog("penalty")} disabled={busy}>Penalty</RunBtn>
            <RunBtn small onClick={() => setConfirmUndo(true)} disabled={busy || lm.deliveries.length === 0}>Undo</RunBtn>
          </div>
          <div className="grid grid-cols-3 gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => updateLive({ live: { ...live, striker: live.nonStriker, nonStriker: live.striker } as never })}>
              Swap strike
            </Button>
            <Button variant="outline" size="sm" onClick={() => updateLive({ live: { ...live, striker: null } as never })}>
              Retire striker
            </Button>
            <Button variant="outline" size="sm" onClick={() => updateLive({ status: match.status === "paused" ? "live" : "paused" })}>
              {match.status === "paused" ? "Resume" : "Pause"}
            </Button>
          </div>
        </section>
      )}

      <ShareLinks match={match} />
      <ScorerAdmin match={match} />

      <ExtrasDialog kind={dialog} onClose={() => setDialog(null)} cfg={d.cfg.rules} busy={busy} onRecord={record} live={live} fielders={bowling} />

      <AlertDialog open={confirmUndo} onOpenChange={setConfirmUndo}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Undo the last ball?</AlertDialogTitle>
            <AlertDialogDescription>All totals will be recalculated and viewers will see the correction.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={undo}>Undo ball</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PlayerCell({ name, stat, strike }: { name?: string | null; stat: string; strike?: boolean }) {
  return (
    <div className="bg-board px-4 py-2">
      <div className="flex items-center gap-1.5 truncate font-semibold">
        {strike && <span className="text-extra">●</span>}
        {name ?? <span className="text-board-muted">—</span>}
      </div>
      <div className="score-num text-board-muted">{stat}</div>
    </div>
  );
}

function RunBtn({
  children,
  onClick,
  disabled,
  tone,
  small,
  className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "four" | "six" | "wicket" | "extra";
  small?: boolean;
  className?: string;
}) {
  const t =
    tone === "four"
      ? "bg-four text-accent-foreground border-four"
      : tone === "six"
        ? "bg-six text-accent-foreground border-six"
        : tone === "wicket"
          ? "bg-wicket text-accent-foreground border-wicket"
          : tone === "extra"
            ? "bg-extra text-foreground border-extra"
            : "bg-card text-foreground border-border";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "h-16 rounded-lg border-2 font-bold shadow-sm transition active:scale-95 disabled:opacity-50",
        small ? "text-base" : "score-num text-3xl",
        t,
        className,
      )}
    >
      {children}
    </button>
  );
}

function SelectPlayers({
  title,
  batting,
  bowling,
  need,
  out,
  live,
  eligibility,
  onSave,
  onUndo,
}: {
  title: string;
  batting: string[];
  bowling: string[];
  need: { striker: boolean; non: boolean; bowler: boolean };
  out: Set<string>;
  live: LiveState;
  eligibility: (n: string) => string | null;
  onSave: (v: Partial<LiveState>) => void;
  onUndo?: () => void;
}) {
  const [striker, setStriker] = useState<string | null>(null);
  const [non, setNon] = useState<string | null>(null);
  const [bowler, setBowler] = useState<string | null>(null);
  const atCrease = [live.striker, live.nonStriker].filter(Boolean) as string[];
  const available = batting.filter((p) => !out.has(p) && !atCrease.includes(p));
  const ok = (!need.striker || striker) && (!need.non || non) && (!need.bowler || bowler) && (!striker || striker !== non);
  const save = () => {
    const v: Partial<LiveState> = {};
    if (need.striker) v.striker = striker;
    if (need.non) v.nonStriker = non;
    if (need.bowler) v.bowler = bowler;
    onSave(v);
  };
  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <h2 className="text-xl font-bold">{title}</h2>
      {need.striker && <Picker label="On strike" options={available.filter((p) => p !== non)} value={striker} onChange={setStriker} />}
      {need.non && <Picker label="Non-striker" options={available.filter((p) => p !== striker)} value={non} onChange={setNon} />}
      {need.bowler && (
        <Picker
          label="Bowler"
          options={bowling}
          value={bowler}
          onChange={(n) => {
            const e = eligibility(n);
            if (e) return toast.error(e);
            setBowler(n);
          }}
          disabled={(n) => !!eligibility(n)}
        />
      )}
      <div className="flex gap-2">
        {onUndo && <Button variant="outline" onClick={onUndo}>Undo last ball</Button>}
        <Button className="flex-1" disabled={!ok} onClick={save}>Continue</Button>
      </div>
    </section>
  );
}

function Picker({ label, options, value, onChange, disabled }: { label: string; options: string[]; value: string | null; onChange: (v: string) => void; disabled?: (v: string) => boolean }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {options.length === 0 && <span className="text-sm text-muted-foreground">No players available</span>}
        {options.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={cn(
              "rounded-full border-2 px-3 py-1.5 text-sm font-medium transition",
              value === p ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background",
              disabled?.(p) && "opacity-40",
            )}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------ Extras dialogs ---------------------------- */

const DISMISSALS: { k: DismissalKind; label: string }[] = [
  { k: "bowled", label: "Bowled" },
  { k: "caught", label: "Caught" },
  { k: "lbw", label: "LBW" },
  { k: "run_out", label: "Run out" },
  { k: "stumped", label: "Stumped" },
  { k: "hit_wicket", label: "Hit wicket" },
  { k: "retired_out", label: "Retired out" },
  { k: "obstructing", label: "Obstructing" },
];

function ExtrasDialog({
  kind,
  onClose,
  cfg,
  busy,
  onRecord,
  live,
  fielders,
}: {
  kind: null | "wide" | "noball" | "bye" | "legbye" | "penalty" | "wicket" | "other";
  onClose: () => void;
  cfg: { wideRuns: number; noBallRuns: number };
  busy: boolean;
  onRecord: (p: { runs_bat?: number; extra_type?: ExtraType; extras?: number; wicket?: Wicket | null }) => void;
  live: LiveState;
  fielders: string[];
}) {
  const [other, setOther] = useState("7");
  const [wk, setWk] = useState<DismissalKind>("bowled");
  const [outP, setOutP] = useState<string | null>(null);
  const [fielder, setFielder] = useState<string | null>(null);
  const [roRuns, setRoRuns] = useState(0);
  const [nbBye, setNbBye] = useState(false);

  const titles = { wide: "Wide — extra runs ran?", noball: "No ball — runs scored?", bye: "Byes", legbye: "Leg byes", penalty: "Penalty runs", wicket: "Wicket", other: "Other runs off the bat" };
  const pick = (n: number) => {
    if (kind === "wide") onRecord({ extra_type: "wide", extras: cfg.wideRuns + n });
    else if (kind === "noball") onRecord(nbBye ? { extra_type: "noball", extras: cfg.noBallRuns + n } : { extra_type: "noball", extras: cfg.noBallRuns, runs_bat: n });
    else if (kind === "bye" || kind === "legbye") onRecord({ extra_type: kind, extras: n });
    else if (kind === "penalty") onRecord({ extra_type: "penalty", extras: n });
  };
  const needsFielder = wk === "caught" || wk === "run_out" || wk === "stumped";
  const canOut = wk === "run_out" || wk === "obstructing" || wk === "retired_out";
  const victim = canOut ? outP : live.striker;

  return (
    <Dialog open={!!kind} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{kind ? titles[kind] : ""}</DialogTitle>
        </DialogHeader>
        {kind === "other" && (
          <div className="flex gap-2">
            <Input type="number" min={0} max={12} value={other} onChange={(e) => setOther(e.target.value)} />
            <Button disabled={busy} onClick={() => onRecord({ runs_bat: Math.max(0, Math.min(12, Number(other) || 0)) })}>Record</Button>
          </div>
        )}
        {(kind === "wide" || kind === "noball" || kind === "bye" || kind === "legbye" || kind === "penalty") && (
          <div className="space-y-3">
            {kind === "noball" && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={nbBye} onChange={(e) => setNbBye(e.target.checked)} />
                Runs were byes, not off the bat
              </label>
            )}
            <div className="grid grid-cols-4 gap-2">
              {(kind === "noball" ? [0, 1, 2, 3, 4, 6] : kind === "bye" || kind === "legbye" ? [1, 2, 3, 4] : kind === "penalty" ? [1, 2, 5] : [0, 1, 2, 3, 4]).map((n) => (
                <Button key={n} variant="outline" className="h-14 score-num text-xl" disabled={busy} onClick={() => pick(n)}>
                  {kind === "wide" ? `+${n}` : n}
                </Button>
              ))}
            </div>
            {kind === "wide" && <p className="text-xs text-muted-foreground">A wide already adds {cfg.wideRuns}. Choose any extra runs completed.</p>}
          </div>
        )}
        {kind === "wicket" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-1.5">
              {DISMISSALS.map((x) => (
                <Choice key={x.k} active={wk === x.k} onClick={() => { setWk(x.k); setOutP(null); }} className="py-2 text-sm">
                  {x.label}
                </Choice>
              ))}
            </div>
            {canOut && (
              <Picker label="Who is out?" options={[live.striker, live.nonStriker].filter(Boolean) as string[]} value={outP} onChange={setOutP} />
            )}
            {needsFielder && <Picker label={wk === "stumped" ? "Keeper" : "Fielder"} options={fielders} value={fielder} onChange={setFielder} />}
            {wk === "run_out" && (
              <div className="space-y-1.5">
                <Label>Runs completed before the run out</Label>
                <div className="flex gap-1.5">
                  {[0, 1, 2, 3].map((n) => (
                    <Choice key={n} active={roRuns === n} onClick={() => setRoRuns(n)} className="flex-1 py-2 text-center">{n}</Choice>
                  ))}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button
                variant="destructive"
                className="w-full"
                disabled={busy || !victim}
                onClick={() => onRecord({ runs_bat: wk === "run_out" ? roRuns : 0, wicket: { kind: wk, playerOut: victim!, fielder } })}
              >
                Confirm wicket
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------------- Admin --------------------------------- */

function ShareLinks({ match }: { match: MatchRow }) {
  return (
    <section className="grid grid-cols-2 gap-2">
      <Button asChild variant="outline">
        <Link to="/match/$matchId" params={{ matchId: match.id }} target="_blank">Spectator page</Link>
      </Button>
      <Button asChild variant="outline">
        <Link to="/display/$matchId" params={{ matchId: match.id }} target="_blank">TV scoreboard</Link>
      </Button>
    </section>
  );
}

function ScorerAdmin({ match }: { match: MatchRow }) {
  const [email, setEmail] = useState("");
  const [list, setList] = useState<{ user_id: string; email: string | null }[] | null>(null);
  const load = async () => {
    const { data } = await supabase.from("match_scorers").select("user_id,email").eq("match_id", match.id);
    setList(data ?? []);
  };
  const add = async () => {
    const { error } = await supabase.rpc("assign_scorer", { _match: match.id, _email: email });
    if (error) return toast.error(error.message);
    setEmail("");
    toast.success("Scorer added");
    load();
  };
  return (
    <details className="rounded-lg border border-border bg-card p-3 text-sm" onToggle={(e) => (e.currentTarget.open && !list ? load() : undefined)}>
      <summary className="cursor-pointer font-semibold">Scorers</summary>
      <div className="mt-3 space-y-2">
        {list?.length === 0 && <p className="text-muted-foreground">Only you can score this match.</p>}
        {list?.map((s) => (
          <div key={s.user_id} className="flex items-center justify-between">
            <span>{s.email}</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                await supabase.from("match_scorers").delete().eq("match_id", match.id).eq("user_id", s.user_id);
                load();
              }}
            >
              Remove
            </Button>
          </div>
        ))}
        <div className="flex gap-2">
          <Input type="email" placeholder="scorer@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button onClick={add} disabled={!email}>Add</Button>
        </div>
        <p className="text-xs text-muted-foreground">Only the match creator can add or remove scorers.</p>
      </div>
    </details>
  );
}
