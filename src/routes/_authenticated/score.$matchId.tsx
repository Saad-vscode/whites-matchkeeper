import { TournamentName } from "@/components/cricket/tournament-name";
import { MatchAward } from "@/components/cricket/match-award";
import { useTvPreparation } from "@/lib/cricket/tv-feed";
import { MatchAudio } from "@/components/cricket/match-audio";
import { playoffNode } from "@/lib/cricket/playoffs";
import { usePlayoffs } from "@/lib/cricket/use-playoffs";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  battingSide,
  getLive,
  teamName,
  teamPlayers,
  type LiveState,
  type MatchRow,
} from "@/lib/cricket/match";
import { useScoring } from "@/lib/cricket/use-scoring";
import { cn } from "@/lib/utils";
import { UnderlineTabs } from "@/components/cricket/tabs";
import { Scorecard, Balls, Info } from "@/routes/match.$matchId";
import { economy, strikeRate, isLegal, deliveryRuns } from "@/lib/cricket/engine";
import { maidens } from "@/lib/cricket/scorecard";

export const Route = createFileRoute("/_authenticated/score/$matchId")({
  head: () => ({
    meta: [
      { title: "Scoring — Crease" },
      { name: "description", content: "Ball-by-ball scoring console." },
      { property: "og:title", content: "Scoring — Crease" },
      { property: "og:description", content: "Ball-by-ball scoring console." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ScorePage,
});

function ScorePage() {
  const { matchId } = Route.useParams();
  const { user } = Route.useRouteContext();
  const lm = useScoring(matchId, user.id);
  const { match, derived } = lm;
  useTvPreparation(match);
  const playoffs = usePlayoffs(match?.tournament_id ?? undefined, !!match && !!playoffNode(match), lm.pending === 0 && !lm.conflict && lm.online && !lm.syncing);
  const { data: tournament } = useQuery({
    queryKey: ["scoring-tournament-info", match?.tournament_id],
    refetchInterval: 5000,
    enabled: !!match?.tournament_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tournaments")
        .select("*")
        .eq("id", match!.tournament_id!)
        .single();
      if (error) throw error;
      return data;
    },
  });
  const [tab, setTab] = useState<"scoring" | "scorecard" | "balls" | "info">("scoring");

  if (!match || !derived)
    return (
      <Centered>
        {lm.error ??
          (lm.online
            ? "Loading match…"
            : "This match has not been opened on this device yet. Connect once to score offline.")}
      </Centered>
    );

  const needsToss = !match.toss_winner;
  return (
    <div className="tournament-page scoring-page min-h-screen bg-background">
      <div className="sticky top-0 z-10 border-b border-border bg-card/90 backdrop-blur">
        <div
          className={cn(
            "mx-auto flex items-center justify-between gap-2",
            "h-20 max-w-5xl px-5 sm:px-8",
          )}
        >
          <Link
            to={match.tournament_id ? "/tournaments/$tournamentId/manage" : "/dashboard"}
            params={{ tournamentId: match.tournament_id ?? "" }}
            className="text-sm font-semibold text-primary"
          >
            ← Matches
          </Link>
          <ConnBadge conn={lm.conn} lastUpdated={lm.lastUpdated} />
        </div>
      </div>
      <main className={cn("mx-auto space-y-3", "max-w-5xl px-4 py-5 pb-10 sm:px-8 sm:py-8")}>
        <SyncBanner lm={lm} />
        {playoffs.syncError && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Playoff progression: {playoffs.syncError} <button className="underline" onClick={playoffs.retrySync}>Retry</button></p>}
        <MatchAward match={match} deliveries={lm.deliveries} canPublish blocked={lm.pending > 0 || lm.conflict || !lm.online} />
        <LegacyRunOutCorrection lm={lm} />
        {needsToss ? (
          <TossSetup
            match={match}
            onSave={(patch) => lm.mutate({ kind: "state", delivery: null, patch, reason: "" })}
          />
        ) : (
          <>
            <UnderlineTabs
              value={tab}
              onChange={setTab}
              tabs={[
                { id: "scoring", label: "Scoring" },
                { id: "scorecard", label: "Scorecard" },
                { id: "balls", label: "Balls" },
                { id: "info", label: "Info" },
              ]}
            />
            {tab === "scoring" && <Scorer lm={lm} />}
            {tab === "scorecard" && (
              <Scorecard
                match={match}
                d={derived}
                inn1={lm.deliveries.filter((b) => b.innings === 1)}
                inn2={lm.deliveries.filter((b) => b.innings === 2)}
              />
            )}
            {tab === "balls" && (
              <Balls
                d={derived}
                inn1={lm.deliveries.filter((b) => b.innings === 1)}
                inn2={lm.deliveries.filter((b) => b.innings === 2)}
                n1={teamName(match, battingSide(match, 1))}
                n2={teamName(match, battingSide(match, 2))}
              />
            )}
            {tab === "info" && (
              <>
                <Info
                  match={match}
                  tour={tournament ?? null}
                  look={(side) => ({ name: teamName(match, side), color: null, logo: null })}
                />
                <ShareLinks match={match} />
                <ScorerAdmin match={match} />
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

/** Classify older run-outs without changing the delivery, score, or ball order. */
export function LegacyRunOutCorrection({ lm }: { lm: LM }) {
  const match = lm.match;
  const [type, setType] = useState<"direct" | "assisted" | "">("");
  const [assistant, setAssistant] = useState("");
  const legacy = lm.deliveries.find(d => d.wicket?.kind === "run_out" && d.wicket.fielder && !d.wicket.runOutType);
  if (!match || !legacy?.wicket) return null;
  const batting = battingSide(match, legacy.innings);
  const fielders = batting === "A" ? match.team_b_players : batting === "B" ? match.team_a_players : [];
  const otherFielders = fielders.filter(name => name && name !== legacy.wicket?.fielder);
  const blocked = lm.pending > 0 || lm.conflict || !lm.online || lm.syncing;
  const save = async () => {
    if (!type || (type === "assisted" && !assistant)) return;
    const accepted = await lm.mutate({
      kind: "edit",
      delivery: { ...legacy, wicket: { ...legacy.wicket!, runOutType: type, assistedBy: type === "assisted" ? assistant : null } },
      patch: {},
      reason: "Classified legacy run-out fielding credit",
    });
    if (accepted) { setType(""); setAssistant(""); }
  };
  return <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" aria-label="Complete run-out credit">
    <p className="font-semibold">Complete an older run-out record</p>
    <p className="mt-1">Innings {legacy.innings}, ball {legacy.seq}: {legacy.wicket.playerOut} was run out. {legacy.wicket.fielder} is recorded as a fielder; choose how the wicket happened to credit the correct MVP points.</p>
    <div className="mt-3 flex flex-wrap items-end gap-3">
      <label className="grid gap-1">Run-out type
        <select className="rounded-lg border border-input bg-background px-3 py-2" value={type} onChange={e => { setType(e.target.value as typeof type); setAssistant(""); }}>
          <option value="">Choose type</option><option value="direct">Direct hit · 10 points</option><option value="assisted">Assisted · 5 per fielder</option>
        </select>
      </label>
      {type === "assisted" && <label className="grid gap-1">Second fielder
        <select className="rounded-lg border border-input bg-background px-3 py-2" value={assistant} onChange={e => setAssistant(e.target.value)}>
          <option value="">Choose player</option>{otherFielders.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>}
      <Button disabled={blocked || !type || (type === "assisted" && !assistant)} onClick={() => void save()}>Save run-out credit</Button>
    </div>
    {blocked && <p className="mt-2">Sync scoring changes before editing this record.</p>}
  </section>;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6 text-muted-foreground">
      {children}
    </div>
  );
}

/* ---------------------------------- Toss --------------------------------- */

function SyncBanner({ lm }: { lm: LM }) {
  if (lm.conflict)
    return (
      <div className="space-y-2 rounded-lg border-2 border-destructive bg-card p-3 text-sm">
        <p className="font-semibold">Another scorer changed this match while you were scoring.</p>
        <p className="text-muted-foreground">
          {lm.pending} change{lm.pending === 1 ? "" : "s"} on this device were not added, so nothing
          was overwritten. Using the latest match first downloads a copy of your unsaved changes.
        </p>
        <Button size="sm" variant="destructive" disabled={!lm.online} onClick={lm.useServer}>
          Use latest match
        </Button>
      </div>
    );
  if (!lm.online || lm.pending || lm.error)
    return (
      <div className="rounded-lg border border-border bg-card p-3 text-sm">
        <b>
          {!lm.online
            ? "Offline — scoring is saved on this device."
            : lm.syncing
              ? "Sending saved balls…"
              : lm.error
                ? "Waiting to send saved balls."
                : "Saved balls are waiting."}
        </b>
        {lm.pending > 0 && (
          <span className="text-muted-foreground"> {lm.pending} waiting to send.</span>
        )}
        {lm.error && <p className="mt-1 text-muted-foreground">{lm.error}</p>}
      </div>
    );
  return null;
}

export function TossSetup({
  match,
  onSave,
}: {
  match: MatchRow;
  onSave: (patch: Partial<MatchRow>) => Promise<boolean>;
}) {
  const [winner, setWinner] = useState<"A" | "B" | null>(null);
  const [decision, setDecision] = useState<"bat" | "bowl" | null>(null);
  const [saving, setSaving] = useState(false);
  const [overs, setOvers] = useState(String(match.overs));
  const [balls, setBalls] = useState(String(match.balls_per_over));
  const { data: formatSupported = false } = useQuery({
    queryKey: ["match-format-support"],
    queryFn: async () => {
      const result = await supabase.rpc("match_format_supported");
      return !result.error && result.data === true;
    },
    staleTime: 60000,
  });
  const validFormat =
    /^\d+$/.test(overs) &&
    Number(overs) >= 1 &&
    Number(overs) <= 100 &&
    /^\d+$/.test(balls) &&
    Number(balls) >= 1 &&
    Number(balls) <= 12;
  const save = async () => {
    if (!winner || !decision || saving || !validFormat) return;
    setSaving(true);
    await onSave({
      toss_winner: winner,
      toss_decision: decision,
      live: { innings: 1 } as never,
      ...(formatSupported &&
      (Number(overs) !== match.overs || Number(balls) !== match.balls_per_over)
        ? { overs: Number(overs), balls_per_over: Number(balls) }
        : {}),
    });
    setSaving(false);
  };
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">{<TournamentName id={match.tournament_id} fallback={match.name}/>}</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
          {match.team_a} v {match.team_b}
        </h1>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <section className="space-y-5 rounded-2xl border border-border bg-card p-5 sm:p-6">
          <div>
            <h2 className="text-lg font-semibold">Match format</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Adjust for this match before confirming the toss. Tournament defaults stay unchanged.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-2 text-sm font-medium">
              <span>Overs per innings</span>
              <Input
                type="number"
                min={1}
                max={100}
                step={1}
                value={overs}
                disabled={!formatSupported || saving}
                onChange={(e) => setOvers(e.target.value)}
              />
            </label>
            <label className="space-y-2 text-sm font-medium">
              <span>Balls per over</span>
              <Input
                type="number"
                min={1}
                max={12}
                step={1}
                value={balls}
                disabled={!formatSupported || saving}
                onChange={(e) => setBalls(e.target.value)}
              />
            </label>
          </div>
          {!validFormat && (
            <p role="alert" className="text-sm text-destructive">
              Enter whole numbers: 1–100 overs and 1–12 balls per over.
            </p>
          )}
          {!formatSupported && (
            <p className="text-sm text-muted-foreground">
              Match format adjustments require the database update.
            </p>
          )}
          <Summary
            match={{
              ...match,
              overs: Number(overs) || match.overs,
              balls_per_over: Number(balls) || match.balls_per_over,
            }}
          />
        </section>
        <fieldset
          disabled={saving}
          className="min-w-0 space-y-6 rounded-2xl border border-border bg-card p-5 sm:p-6"
        >
          <h2 className="text-lg font-semibold">Toss</h2>
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
              <Choice active={decision === "bat"} onClick={() => setDecision("bat")}>
                Bat
              </Choice>
              <Choice active={decision === "bowl"} onClick={() => setDecision("bowl")}>
                Bowl
              </Choice>
            </div>
          </div>
          <Button
            size="lg"
            className="w-full"
            disabled={!winner || !decision || saving || !validFormat}
            onClick={save}
          >
            Confirm toss
          </Button>
        </fieldset>
      </div>
    </div>
  );
}

function Summary({ match }: { match: MatchRow }) {
  const r = (match.rules ?? {}) as {
    wideRuns?: number;
    noBallRuns?: number;
    maxOversPerBowler?: number | null;
    lastManBats?: boolean;
  };
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-border bg-card p-4 text-sm">
      <dt className="text-muted-foreground">Overs</dt>
      <dd className="font-semibold">{match.overs}</dd>
      <dt className="text-muted-foreground">Balls per over</dt>
      <dd className="font-semibold">{match.balls_per_over}</dd>
      <dt className="text-muted-foreground">Players per side</dt>
      <dd className="font-semibold">{match.players_per_team}</dd>
      <dt className="text-muted-foreground">Wide / No-ball runs</dt>
      <dd className="font-semibold">
        {String(r.wideRuns ?? 1)} / {String(r.noBallRuns ?? 1)}
      </dd>
      <dt className="text-muted-foreground">Max overs per bowler</dt>
      <dd className="font-semibold">
        {r.maxOversPerBowler ? String(r.maxOversPerBowler) : "No limit"}
      </dd>
      <dt className="text-muted-foreground">Last man bats</dt>
      <dd className="font-semibold">{r.lastManBats ? "Yes" : "No"}</dd>
    </dl>
  );
}

function Choice({
  active,
  onClick,
  children,
  className,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Button
      variant="ghost"
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border-2 px-3 py-3 text-left font-semibold transition",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card hover:border-primary",
        className,
      )}
    >
      {children}
    </Button>
  );
}

/* --------------------------------- Scorer -------------------------------- */

type LM = ReturnType<typeof useScoring>;

export function Scorer({ lm }: { lm: LM }) {
  const match = lm.match;
  const d = lm.derived;
  if (!match || !d) return null;
  const live = getLive(match);
  const s = d.current;
  const innings = d.innings;
  const batting = teamPlayers(match, d.battingSide);
  const bowling = teamPlayers(match, d.bowlingSide);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<
    null | "wide" | "noball" | "bye" | "legbye" | "penalty" | "wicket" | "other"
  >(null);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const [more, setMore] = useState(false);
  const [abandon, setAbandon] = useState(false);

  const finished =
    lm.conflict ||
    match.status === "completed" ||
    match.status === "abandoned" ||
    match.status === "cancelled";
  const lastManAlone = d.cfg.rules.lastManBats && s.wickets === d.cfg.playersPerTeam - 1;
  const needStriker = !live.striker;
  const needNon = !live.nonStriker && !lastManAlone;
  const needBowler = !live.bowler;
  const needsSelection =
    !finished && match.status !== "innings_break" && (needStriker || needNon || needBowler);

  const outPlayers = useMemo(
    () => new Set(s.batters.filter((b) => b.out && countsAsWicket(b.out)).map((b) => b.name)),
    [s],
  );

  const updateLive = (patch: Partial<MatchRow>) =>
    lm.mutate({ kind: "state", delivery: null, patch, reason: "" });

  const record = async (p: {
    runs_bat?: number;
    extra_type?: ExtraType;
    extras?: number;
    wicket?: Wicket | null;
    swapAfter?: boolean;
  }) => {
    if (busy || needsSelection || finished || s.complete) return;
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
    const all = [...lm.deliveries, del];
    const target = innings === 2 ? d.target : null;
    const ns = computeInnings(
      all.filter((x) => x.innings === innings),
      d.cfg,
      target,
    );
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
        const res = matchResult(
          first,
          ns,
          d.cfg,
          teamName(match, battingSide(match, 1)),
          teamName(match, battingSide(match, 2)),
        );
        patch.status = "completed";
        patch.result = res;
        patch.live = { innings: 2 } as never;
        toast.success(res ?? "Match complete");
      }
    }
    await lm.mutate({ kind: "ball", delivery: del, patch, reason: "" });
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
    if (!last) {
      toast("Nothing to undo.");
      return;
    }
    setBusy(true);
    await lm.mutate({
      kind: "undo",
      delivery: last,
      reason: "",
      patch: {
        status: "live",
        live: {
          innings: inn,
          striker: last.striker,
          nonStriker: last.non_striker || null,
          bowler: last.bowler,
        } as never,
      },
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
  const partnershipBalls = [...lm.deliveries]
    .filter((b) => b.innings === innings)
    .sort((a, b) => a.seq - b.seq);
  const lastWicket = partnershipBalls.reduce((last, b, i) => (b.wicket ? i : last), -1);
  const partnership = partnershipBalls.slice(lastWicket + 1);

  return (
    <div className="space-y-4">
      {/* scoreboard */}
      <section className="overflow-hidden rounded-xl bg-board text-board-foreground shadow-lg">
        <div className="flex items-center justify-between border-b border-board-line px-4 py-2 text-xs uppercase tracking-widest text-board-muted">
          <span>
            {<TournamentName id={match.tournament_id} fallback={match.name}/>} · Innings {innings}
          </span>
          <StatusPill status={match.status} />
        </div>
        <div className="px-4 py-4">
          <div className="text-sm text-board-muted">{teamName(match, d.battingSide)} batting</div>
          <div className="flex items-end justify-between">
            <div className="score-num text-6xl leading-none">
              {s.runs}
              <span className="text-board-muted">/</span>
              {s.wickets}
            </div>
            <div className="text-right">
              <div className="score-num text-2xl">
                {formatOvers(s.legalBalls, d.cfg.ballsPerOver)}
              </div>
              <div className="text-xs text-board-muted">of {d.cfg.overs} overs</div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-board-muted">
            <span>
              Extras <b>{s.extras.total}</b>
            </span>
            <span>
              Partnership{" "}
              <b>
                {partnership.reduce((total, b) => total + deliveryRuns(b), 0)} (
                {partnership.filter(isLegal).length})
              </b>
            </span>
            <span>
              CRR <b className="text-board-foreground">{rr.toFixed(2)}</b>
            </span>
            {d.target != null && (
              <>
                <span>
                  Target <b className="text-board-foreground">{d.target}</b>
                </span>
                <span>
                  Need <b className="text-board-foreground">{Math.max(0, d.target - s.runs)}</b> off{" "}
                  {ballsLeft}
                </span>
                {rrr != null && (
                  <span>
                    RRR <b className="text-board-foreground">{rrr.toFixed(2)}</b>
                  </span>
                )}
              </>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px bg-board-line text-sm">
          <PlayerCell
            name={live.striker}
            strike
            stat={
              strikerLine
                ? `${strikerLine.runs} (${strikerLine.balls}) · 4s ${strikerLine.fours} · 6s ${strikerLine.sixes} · SR ${strikeRate(strikerLine.runs, strikerLine.balls).toFixed(1)}`
                : "0 (0) · 4s 0 · 6s 0 · SR 0.0"
            }
          />
          <PlayerCell
            name={live.nonStriker}
            stat={
              nonLine
                ? `${nonLine.runs} (${nonLine.balls}) · 4s ${nonLine.fours} · 6s ${nonLine.sixes} · SR ${strikeRate(nonLine.runs, nonLine.balls).toFixed(1)}`
                : "0 (0) · 4s 0 · 6s 0 · SR 0.0"
            }
          />
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-board-line px-4 py-2 text-sm">
          <span>
            <span className="text-board-muted">Bowling </span>
            <b>{live.bowler ?? "—"}</b>{" "}
            {bowlerLine && (
              <span className="score-num text-board-muted">
                {formatOvers(bowlerLine.balls, d.cfg.ballsPerOver)}-{bowlerLine.runs}-
                {bowlerLine.wickets}
                {` · M ${maidens(partnershipBalls, d.cfg.ballsPerOver)[bowlerLine.name] ?? 0} · Eco ${economy(bowlerLine.runs, bowlerLine.balls, d.cfg.ballsPerOver).toFixed(1)}`}
              </span>
            )}
          </span>
        </div>
        <div className="flex min-h-12 items-center gap-1.5 overflow-x-auto bg-card/5 px-4 py-2">
          {s.currentOver.length === 0 ? (
            <span className="text-xs text-board-muted">New over</span>
          ) : (
            s.currentOver.map((b) => <BallChip key={b.id} d={b} />)
          )}
        </div>
      </section>

      {!finished && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <MatchAudio key={match.id} />
          <Button variant="outline" onClick={() => setMore(true)}>
            More
          </Button>
        </div>
      )}
      {match.status === "abandoned" && (
        <p role="status" className="rounded-xl border p-4 text-center font-semibold">
          Match abandoned · No result
        </p>
      )}
      {match.status === "completed" && (
        <div className="rounded-lg border-2 border-primary bg-card p-4 text-center">
          <div className="font-display text-2xl font-bold text-primary">{d.result}</div>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setConfirmUndo(true)}>
            Undo last ball
          </Button>
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
          onSelection={(v) => updateLive({ status: "live", live: { innings: 2, ...v } as never })}
          onUndo={() => setConfirmUndo(true)}
        />
      )}

      {needsSelection && (
        <SelectPlayers
          title={
            s.legalBalls === 0 && lm.deliveries.filter((x) => x.innings === innings).length === 0
              ? "Openers"
              : needBowler && !needStriker && !needNon
                ? "Next over"
                : "New batter"
          }
          batting={batting}
          bowling={bowling}
          need={{ striker: needStriker, non: needNon, bowler: needBowler }}
          out={outPlayers}
          live={live}
          eligibility={(n) => bowlerEligibility(s, d.cfg, n)}
          onSave={(v) => updateLive({ status: "live", live: { ...live, innings, ...v } as never })}
          onSelection={(v) => updateLive({ status: "live", live: { ...live, innings, ...v } as never })}
          onUndo={lm.deliveries.length ? () => setConfirmUndo(true) : undefined}
        />
      )}

      {!finished && match.status !== "innings_break" && !needsSelection && (
        <section className="space-y-2">
          <div className="grid grid-cols-4 gap-2">
            {[0, 1, 2, 3].map((r) => (
              <RunBtn key={r} onClick={() => record({ runs_bat: r })} disabled={busy}>
                {r}
              </RunBtn>
            ))}
            <RunBtn tone="four" onClick={() => record({ runs_bat: 4 })} disabled={busy}>
              4
            </RunBtn>
            <RunBtn onClick={() => record({ runs_bat: 5 })} disabled={busy}>
              5
            </RunBtn>
            <RunBtn tone="six" onClick={() => record({ runs_bat: 6 })} disabled={busy}>
              6
            </RunBtn>
            <RunBtn small onClick={() => setDialog("other")} disabled={busy}>
              Other
            </RunBtn>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <RunBtn small tone="extra" onClick={() => setDialog("wide")} disabled={busy}>
              Wide
            </RunBtn>
            <RunBtn small tone="extra" onClick={() => setDialog("noball")} disabled={busy}>
              No ball
            </RunBtn>
            <RunBtn small onClick={() => setDialog("bye")} disabled={busy}>
              Bye
            </RunBtn>
            <RunBtn small onClick={() => setDialog("legbye")} disabled={busy}>
              Leg bye
            </RunBtn>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <RunBtn
              small
              tone="wicket"
              className="col-span-2"
              onClick={() => setDialog("wicket")}
              disabled={busy}
            >
              Out
            </RunBtn>
            <RunBtn small onClick={() => setDialog("penalty")} disabled={busy}>
              Bonus
            </RunBtn>
            <RunBtn
              small
              onClick={() => setConfirmUndo(true)}
              disabled={busy || lm.deliveries.length === 0}
            >
              Undo
            </RunBtn>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                updateLive({
                  live: { ...live, striker: live.nonStriker, nonStriker: live.striker } as never,
                })
              }
            >
              Swap strike
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateLive({ status: match.status === "paused" ? "live" : "paused" })}
            >
              {match.status === "paused" ? "Resume" : "Pause"}
            </Button>
          </div>
        </section>
      )}

      <ShareLinks match={match} />
      <ScorerAdmin match={match} />

      <ExtrasDialog
        key={dialog ?? "closed"}
        kind={dialog}
        onClose={() => setDialog(null)}
        cfg={d.cfg.rules}
        busy={busy}
        onRecord={record}
        live={live}
        fielders={bowling}
      />
      <Dialog open={more} onOpenChange={setMore}>
        <DialogContent className="tournament-page">
          <DialogHeader>
            <DialogTitle>More match actions</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Retired hurt: select the batter leaving the field. No wicket or ball is added.
          </p>
          {[live.striker, live.nonStriker]
            .filter((name): name is string => !!name)
            .map((name) => (
              <Button
                key={name}
                variant="outline"
                disabled={busy || needsSelection || match.status === "innings_break"}
                onClick={async () => {
                  await record({
                    extra_type: "penalty",
                    extras: 0,
                    wicket: { kind: "retired_hurt", playerOut: name },
                  });
                  setMore(false);
                }}
              >
                Retired hurt · {name}
              </Button>
            ))}
          <Button
            variant="destructive"
            onClick={() => {
              setMore(false);
              setAbandon(true);
            }}
          >
            Abandon match
          </Button>
        </DialogContent>
      </Dialog>
      <AlertDialog open={abandon} onOpenChange={setAbandon}>
        <AlertDialogContent className="tournament-page">
          <AlertDialogHeader>
            <AlertDialogTitle>Abandon this match?</AlertDialogTitle>
            <AlertDialogDescription>
              The match will end with no result. Recorded balls and statistics will be kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep playing</AlertDialogCancel>
            <AlertDialogAction onClick={() => updateLive({ status: "abandoned" })}>
              Abandon match
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmUndo} onOpenChange={setConfirmUndo}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Undo the last ball?</AlertDialogTitle>
            <AlertDialogDescription>
              All totals will be recalculated and viewers will see the correction.
            </AlertDialogDescription>
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

function PlayerCell({
  name,
  stat,
  strike,
}: {
  name?: string | null | undefined;
  stat: string;
  strike?: boolean;
}) {
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
    <Button
      variant="ghost"
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
    </Button>
  );
}

export function SelectPlayers({
  title,
  batting,
  bowling,
  need,
  out,
  live,
  eligibility,
  onSave,
  onUndo,
  onSelection,
}: {
  title: string;
  batting: string[];
  bowling: string[];
  need: { striker: boolean; non: boolean; bowler: boolean };
  out: Set<string>;
  live: LiveState;
  eligibility: (n: string) => string | null;
  onSave: (v: Partial<LiveState>) => void;
  onUndo?: (() => void) | undefined;
  onSelection?: (v: Partial<LiveState>) => Promise<unknown>;
}) {
  const [striker, setStriker] = useState<string | null>(null);
  const [non, setNon] = useState<string | null>(null);
  const [bowler, setBowler] = useState<string | null>(null);
  const [picker, setPicker] = useState<"batters" | "bowler" | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);
  const publish = async (v: Partial<LiveState>) => {
    if (!onSelection) return;
    setPublishing(true);
    try { await onSelection(v); } finally { setPublishing(false); }
  };
  const requiredBatters = Number(need.striker) + Number(need.non);
  const atCrease = [live.striker, live.nonStriker].filter(Boolean) as string[];
  const available = batting.filter((p) => !out.has(p) && !atCrease.includes(p));
  const ok =
    (!need.striker || striker) &&
    (!need.non || non) &&
    (!need.bowler || bowler) &&
    (!striker || striker !== non);
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
      <div className="grid grid-cols-2 gap-3">
        {requiredBatters > 0 && (
          <Button
            variant="outline"
            disabled={publishing}
            onClick={() => {
              setPicked([striker, non].filter((n): n is string => !!n));
              setPicker("batters");
            }}
          >
            Select batsmen
          </Button>
        )}
        {need.bowler && (
          <Button variant="outline" disabled={publishing} onClick={() => setPicker("bowler")}>
            Select bowler
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        {need.striker && `Striker: ${striker ?? "Not selected"}. `}
        {need.non && `Non-striker: ${non ?? "Not selected"}. `}
        {need.bowler && `Bowler: ${bowler ?? "Not selected"}.`}
      </p>
      <Dialog open={picker !== null} onOpenChange={(open) => !open && setPicker(null)}>
        <DialogContent className="tournament-page max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{picker === "batters" ? "Select batsmen" : "Select bowler"}</DialogTitle>
          </DialogHeader>
          {picker === "batters" ? (
            <>
              <p className="text-sm text-muted-foreground">
                Select {requiredBatters} {requiredBatters === 1 ? "batter" : "batters"}.
                {need.striker && " First selection takes strike."}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {available.map((name) => (
                  <Button
                    key={name}
                    variant={picked.includes(name) ? "default" : "outline"}
                    aria-pressed={picked.includes(name)}
                    disabled={!picked.includes(name) && picked.length >= requiredBatters}
                    onClick={() =>
                      setPicked((p) =>
                        p.includes(name) ? p.filter((n) => n !== name) : [...p, name],
                      )
                    }
                  >
                    {name}
                    {picked.includes(name) &&
                      ` · ${need.striker && picked.indexOf(name) === 0 ? "Striker" : "Non-striker"}`}
                  </Button>
                ))}
              </div>
              <Button
                disabled={picked.length !== requiredBatters}
                onClick={() => {
                  if (need.striker) setStriker(picked[0] ?? null);
                  if (need.non) setNon(picked[need.striker ? 1 : 0] ?? null);
                  setPicker(null);
                  void publish({
                    ...(need.striker ? { striker: picked[0] ?? null } : {}),
                    ...(need.non ? { nonStriker: picked[need.striker ? 1 : 0] ?? null } : {}),
                  });
                }}
              >
                Confirm batsmen
              </Button>
            </>
          ) : (
            <div className="space-y-2">
              {bowling.map((name) => (
                <div key={name}>
                  <Button
                    className="w-full"
                    variant={bowler === name ? "default" : "outline"}
                    disabled={!!eligibility(name)}
                    onClick={() => {
                      setBowler(name);
                      setPicker(null);
                      void publish({ bowler: name });
                    }}
                  >
                    {name}
                  </Button>
                  {eligibility(name) && (
                    <p className="mt-1 text-xs text-muted-foreground">{eligibility(name)}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <div className="flex gap-2">
        {onUndo && (
          <Button variant="outline" onClick={onUndo}>
            Undo last ball
          </Button>
        )}
        <Button className="flex-1" disabled={!ok || publishing} onClick={save}>
          Continue
        </Button>
      </div>
    </section>
  );
}

function Picker({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  options: string[];
  value: string | null;
  onChange: (v: string) => void;
  disabled?: (v: string) => boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {options.length === 0 && (
          <span className="text-sm text-muted-foreground">No players available</span>
        )}
        {options.map((p) => (
          <Button
            variant="ghost"
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={cn(
              "rounded-full border-2 px-3 py-1.5 text-sm font-medium transition",
              value === p
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background",
              disabled?.(p) && "opacity-40",
            )}
          >
            {p}
          </Button>
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

export function ExtrasDialog({
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
  onRecord: (p: {
    runs_bat?: number;
    extra_type?: ExtraType;
    extras?: number;
    wicket?: Wicket | null;
  }) => void;
  live: LiveState;
  fielders: string[];
}) {
  const [other, setOther] = useState("7");
  const [wk, setWk] = useState<DismissalKind>("bowled");
  const [outP, setOutP] = useState<string | null>(null);
  const [fielder, setFielder] = useState<string | null>(null);
  const [roRuns, setRoRuns] = useState(0);
  const [runOutType, setRunOutType] = useState<"direct" | "assisted">("direct");
  const [assistedBy, setAssistedBy] = useState<string | null>(null);
  const [nbBye, setNbBye] = useState(false);

  const titles = {
    wide: "Wide — extra runs ran?",
    noball: "No ball — runs scored?",
    bye: "Byes",
    legbye: "Leg byes",
    penalty: "Penalty runs",
    wicket: "Wicket",
    other: "Other runs off the bat",
  };
  const pick = (n: number) => {
    if (kind === "wide") onRecord({ extra_type: "wide", extras: cfg.wideRuns + n });
    else if (kind === "noball")
      onRecord(
        nbBye
          ? { extra_type: "noball", extras: cfg.noBallRuns + n }
          : { extra_type: "noball", extras: cfg.noBallRuns, runs_bat: n },
      );
    else if (kind === "bye" || kind === "legbye") onRecord({ extra_type: kind, extras: n });
    else if (kind === "penalty") onRecord({ extra_type: "penalty", extras: n });
  };
  const needsFielder = wk === "caught" || wk === "run_out" || wk === "stumped";
  const canOut = wk === "run_out" || wk === "obstructing" || wk === "retired_out";
  const victim = canOut ? outP : live.striker;

  return (
    <Dialog open={!!kind} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="tournament-page max-h-[85dvh] max-w-sm overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{kind ? titles[kind] : ""}</DialogTitle>
        </DialogHeader>
        {kind === "other" && (
          <div className="flex gap-2">
            <Input
              type="number"
              min={0}
              max={12}
              value={other}
              onChange={(e) => setOther(e.target.value)}
            />
            <Button
              disabled={busy}
              onClick={() => onRecord({ runs_bat: Math.max(0, Math.min(12, Number(other) || 0)) })}
            >
              Record
            </Button>
          </div>
        )}
        {(kind === "wide" ||
          kind === "noball" ||
          kind === "bye" ||
          kind === "legbye" ||
          kind === "penalty") && (
          <div className="space-y-3">
            {kind === "noball" && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={nbBye}
                  onChange={(e) => setNbBye(e.target.checked)}
                />
                Runs were byes, not off the bat
              </label>
            )}
            <div className="grid grid-cols-4 gap-2">
              {(kind === "noball"
                ? [0, 1, 2, 3, 4, 5, 6]
                : kind === "bye" || kind === "legbye"
                  ? [1, 2, 3, 4, 5, 6]
                  : kind === "penalty"
                    ? [1, 2, 3, 4, 5, 6]
                    : [0, 1, 2, 3, 4, 5, 6]
              ).map((n) => (
                <Button
                  key={n}
                  variant="outline"
                  className="h-14 score-num text-xl"
                  disabled={busy}
                  onClick={() => pick(n)}
                >
                  {kind === "wide" ? (n === 0 ? "WD" : `WD+${n}`) : n}
                </Button>
              ))}
            </div>
            {kind === "wide" && (
              <p className="text-xs text-muted-foreground">
                A wide already adds {cfg.wideRuns}. Choose any extra runs completed.
              </p>
            )}
            {kind === "noball" && (
              <p className="text-xs text-muted-foreground">
                Adds the configured {cfg.noBallRuns} no-ball extra plus your selection. Select 0 for
                a no-ball with no additional runs.
              </p>
            )}
          </div>
        )}
        {kind === "wicket" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-1.5">
              {DISMISSALS.map((x) => (
                <Choice
                  key={x.k}
                  active={wk === x.k}
                  onClick={() => {
                    setWk(x.k);
                    setOutP(null);
                  }}
                  className="py-2 text-sm"
                >
                  {x.label}
                </Choice>
              ))}
            </div>
            {canOut && (
              <Picker
                label="Who is out?"
                options={[live.striker, live.nonStriker].filter(Boolean) as string[]}
                value={outP}
                onChange={setOutP}
              />
            )}
            {needsFielder && (
              <Picker
                label={wk === "stumped" ? "Keeper" : "Fielder"}
                options={fielders}
                value={fielder}
                onChange={setFielder}
              />
            )}
            {wk === "run_out" && (
              <div className="space-y-1.5">
                <Label>Run-out type</Label>
                <div className="flex gap-2">
                  <Choice
                    active={runOutType === "direct"}
                    onClick={() => setRunOutType("direct")}
                    className="flex-1 py-2"
                  >
                    Direct hit
                  </Choice>
                  <Choice
                    active={runOutType === "assisted"}
                    onClick={() => setRunOutType("assisted")}
                    className="flex-1 py-2"
                  >
                    Assisted
                  </Choice>
                </div>
                {runOutType === "assisted" && (
                  <Picker
                    label="Second fielder"
                    options={fielders.filter((name) => name !== fielder)}
                    value={assistedBy === fielder ? null : assistedBy}
                    onChange={setAssistedBy}
                  />
                )}
                <Label>Runs completed before the run out</Label>
                <div className="flex gap-1.5">
                  {[0, 1, 2, 3].map((n) => (
                    <Choice
                      key={n}
                      active={roRuns === n}
                      onClick={() => setRoRuns(n)}
                      className="flex-1 py-2 text-center"
                    >
                      {n}
                    </Choice>
                  ))}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button
                variant="destructive"
                className="w-full"
                disabled={
                  busy ||
                  !victim ||
                  (needsFielder && !fielder) ||
                  (wk === "run_out" &&
                    runOutType === "assisted" &&
                    (!assistedBy || assistedBy === fielder))
                }
                onClick={() =>
                  onRecord({
                    runs_bat: wk === "run_out" ? roRuns : 0,
                    wicket: {
                      kind: wk,
                      playerOut: victim ?? "",
                      fielder,
                      ...(wk === "run_out"
                        ? { runOutType, assistedBy: runOutType === "assisted" ? assistedBy : null }
                        : {}),
                    },
                  })
                }
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

/* ------------------------- Corrections and history ------------------------ */

function ShareLinks({ match }: { match: MatchRow }) {
  return (
    <section className="grid grid-cols-2 gap-2">
      <Button asChild variant="outline">
        <Link to="/match/$matchId" params={{ matchId: match.id }} target="_blank">
          Spectator page
        </Link>
      </Button>
      <Button asChild variant="outline">
        <Link to="/display/$matchId" params={{ matchId: match.id }} target="_blank">
          TV scoreboard
        </Link>
      </Button>
    </section>
  );
}

function ScorerAdmin({ match }: { match: MatchRow }) {
  const [email, setEmail] = useState("");
  const [list, setList] = useState<{ user_id: string; email: string | null }[] | null>(null);
  const load = async () => {
    const { data } = await supabase
      .from("match_scorers")
      .select("user_id,email")
      .eq("match_id", match.id);
    setList(data ?? []);
  };
  const add = async () => {
    const { error } = await supabase.rpc("assign_scorer", { _match: match.id, _email: email });
    if (error) {
      toast.error(error.message);
      return;
    }
    setEmail("");
    toast.success("Scorer added");
    load();
  };
  return (
    <details
      className="rounded-lg border border-border bg-card p-3 text-sm"
      onToggle={(e) => (e.currentTarget.open && !list ? load() : undefined)}
    >
      <summary className="cursor-pointer font-semibold">Scorers</summary>
      <div className="mt-3 space-y-2">
        {list?.length === 0 && (
          <p className="text-muted-foreground">Only you can score this match.</p>
        )}
        {list?.map((s) => (
          <div key={s.user_id} className="flex items-center justify-between">
            <span>{s.email}</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                await supabase
                  .from("match_scorers")
                  .delete()
                  .eq("match_id", match.id)
                  .eq("user_id", s.user_id);
                load();
              }}
            >
              Remove
            </Button>
          </div>
        ))}
        <div className="flex gap-2">
          <Input
            type="email"
            placeholder="scorer@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button onClick={add} disabled={!email}>
            Add
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Only the match creator can add or remove scorers.
        </p>
      </div>
    </details>
  );
}
