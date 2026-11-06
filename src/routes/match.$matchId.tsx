import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BallChip, ConnBadge, SiteHeader, StatusPill } from "@/components/cricket/bits";
import { Segmented, TeamBadge, UnderlineTabs } from "@/components/cricket/tabs";
import { ballLabel, countsAsWicket, economy, formatOvers, runRate, strikeRate, type Delivery, type InningsState } from "@/lib/cricket/engine";
import { battingSide, getLive, teamName, useLiveMatch, type Derived, type MatchRow } from "@/lib/cricket/match";
import { describeBall, fallOfWickets, maidens, overGroups } from "@/lib/cricket/scorecard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/match/$matchId")({
  head: () => ({
    meta: [
      { title: "Live score — Crease" },
      { name: "description", content: "Live summary, full scorecard, ball-by-ball and match info." },
      { property: "og:title", content: "Live score — Crease" },
      { property: "og:description", content: "Live summary, full scorecard, ball-by-ball and match info." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Spectator,
});

type Tab = "summary" | "scorecard" | "balls" | "info";

function Spectator() {
  const { matchId } = Route.useParams();
  const { match, deliveries, derived: d, conn, lastUpdated, error } = useLiveMatch(matchId);
  const [tab, setTab] = useState<Tab>("summary");
  const { data: tour } = useQuery({
    queryKey: ["match-tournament", match?.tournament_id],
    enabled: !!match?.tournament_id,
    queryFn: async () => {
      const [t, teams] = await Promise.all([
        supabase.from("tournaments").select("*").eq("id", match!.tournament_id!).maybeSingle(),
        supabase.from("tournament_teams").select("id,color,logo_url").eq("tournament_id", match!.tournament_id!),
      ]);
      return { t: t.data, teams: teams.data ?? [] };
    },
  });
  if (error) return <div className="p-10 text-center text-muted-foreground">{error}</div>;
  if (!match || !d) return <div className="p-10 text-center text-muted-foreground">Loading…</div>;
  const look = (side: "A" | "B" | null) => {
    const id = side === "A" ? match.team_a_id : side === "B" ? match.team_b_id : null;
    const t = tour?.teams.find((x) => x.id === id);
    return { name: teamName(match, side), color: t?.color, logo: t?.logo_url };
  };
  const bs1 = battingSide(match, 1), bs2 = battingSide(match, 2);
  const inn1 = deliveries.filter((x) => x.innings === 1), inn2 = deliveries.filter((x) => x.innings === 2);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ConnBadge conn={conn} lastUpdated={lastUpdated} />
          <Button asChild size="sm" variant="outline"><Link to="/display/$matchId" params={{ matchId }}>TV scoreboard</Link></Button>
        </div>
        <LiveHeader match={match} d={d} />
        {match.toss_winner && (
          <>
            <UnderlineTabs value={tab} onChange={setTab} tabs={[{ id: "summary", label: "Summary" }, { id: "scorecard", label: "Scorecard" }, { id: "balls", label: "Balls" }, { id: "info", label: "Info" }]} />
            {tab === "summary" && <Summary match={match} d={d} look={look} />}
            {tab === "scorecard" && <Scorecard match={match} d={d} inn1={inn1} inn2={inn2} />}
            {tab === "balls" && <Balls d={d} inn1={inn1} inn2={inn2} n1={teamName(match, bs1)} n2={teamName(match, bs2)} />}
          </>
        )}
        {(tab === "info" || !match.toss_winner) && <Info match={match} tour={tour?.t ?? null} look={look} />}
      </main>
    </div>
  );
}

function LiveHeader({ match, d }: { match: MatchRow; d: Derived }) {
  const live = getLive(match);
  const s = d.current;
  return (
    <section className="rounded-xl bg-board p-5 text-board-foreground shadow-lg">
      <div className="flex items-center justify-between text-xs uppercase tracking-widest text-board-muted">
        <span>{match.name}{match.venue ? ` · ${match.venue}` : ""}</span>
        <StatusPill status={match.status} />
      </div>
      <h1 className="mt-2 text-2xl font-extrabold">{match.team_a} v {match.team_b}</h1>
      {match.toss_winner ? (
        <>
          <div className="mt-3 text-sm text-board-muted">{teamName(match, d.battingSide)} · Innings {d.innings}</div>
          <div className="flex items-end justify-between">
            <div className="score-num text-5xl">{s.runs}-{s.wickets}</div>
            <div className="score-num text-xl">{formatOvers(s.legalBalls, d.cfg.ballsPerOver)} <span className="text-sm text-board-muted">/ {d.cfg.overs} ov</span></div>
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-sm text-board-muted">
            <span>CRR {runRate(s.runs, s.legalBalls, d.cfg.ballsPerOver).toFixed(2)}</span>
            {d.target != null && !d.result && <span>Need {Math.max(0, d.target - s.runs)} off {d.cfg.overs * d.cfg.ballsPerOver - s.legalBalls}</span>}
          </div>
          {match.status !== "completed" && !d.result && (
            <div className="mt-2 text-sm">
              {live.striker && <span className="mr-4">● {live.striker}</span>}
              {live.nonStriker && <span className="mr-4">{live.nonStriker}</span>}
              {live.bowler && <span className="text-board-muted">Bowler: {live.bowler}</span>}
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">{s.currentOver.map((b) => <BallChip key={b.id} d={b} />)}</div>
        </>
      ) : <p className="mt-4 text-board-muted">Waiting for the toss.</p>}
      {d.result && <div className="mt-3 font-display text-xl font-bold text-extra">{d.result}</div>}
    </section>
  );
}

type Look = (side: "A" | "B" | null) => { name: string; color?: string | null; logo?: string | null };

function Summary({ match, d, look }: { match: MatchRow; d: Derived; look: Look }) {
  const blocks = [
    { side: battingSide(match, 1), s: d.first },
    ...(d.innings === 2 || d.second.legalBalls > 0 ? [{ side: battingSide(match, 2), s: d.second }] : []),
  ];
  const winnerSide = d.result?.startsWith(teamName(match, "A")) ? "A" : d.result?.startsWith(teamName(match, "B")) ? "B" : null;
  return (
    <div className="space-y-6">
      {blocks.map(({ side, s }) => {
        const bats = [...s.batters].filter((b) => b.balls > 0 || b.runs > 0).sort((a, b) => b.runs - a.runs).slice(0, 3);
        const bowls = [...s.bowlers].sort((a, b) => b.wickets - a.wickets || a.runs - b.runs).slice(0, 3);
        return (
          <section key={side}>
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h2 className="flex items-center gap-2 text-lg font-bold uppercase text-primary">
                {look(side).name}
                {match.toss_winner === side && <span title="Won the toss" className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted-foreground text-[10px] font-bold text-background">T</span>}
              </h2>
              <span className="score-num text-lg text-primary">{s.runs}-{s.wickets} <span className="text-sm">({formatOvers(s.legalBalls, d.cfg.ballsPerOver)})</span></span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div className="space-y-2">{bats.map((b) => (
                <div key={b.name} className="flex justify-between"><span className="text-muted-foreground">{b.name}</span><span className="score-num">{b.runs}{b.out ? "" : "*"}({b.balls})</span></div>
              ))}</div>
              <div className="space-y-2">{bowls.map((b) => (
                <div key={b.name} className="flex justify-between"><span className="text-muted-foreground">{b.name}</span><span className="score-num">{b.wickets}-{b.runs}</span></div>
              ))}</div>
            </div>
          </section>
        );
      })}
      {d.result && (
        <div className="flex items-center gap-4 border-y border-border py-5">
          {winnerSide && <TeamBadge {...look(winnerSide)} size={64} />}
          <div><div className="text-sm text-muted-foreground">Winner</div><div className="text-lg font-bold uppercase">{d.result}</div></div>
        </div>
      )}
    </div>
  );
}

function outText(b: InningsState["batters"][number]) {
  if (!b.out) return "not out";
  const k = b.out.kind.replace(/_/g, " ");
  if (b.out.kind === "caught") return `c ${b.out.fielder ?? "?"} b ${b.bowler}`;
  if (b.out.kind === "bowled") return `b ${b.bowler}`;
  if (["lbw", "hit_wicket"].includes(b.out.kind)) return `${k} b ${b.bowler}`;
  if (b.out.kind === "stumped") return `st ${b.out.fielder ?? "?"} b ${b.bowler}`;
  if (b.out.kind === "run_out") return `run out${b.out.fielder ? ` (${b.out.fielder})` : ""}`;
  return k;
}

function Scorecard({ match, d, inn1, inn2 }: { match: MatchRow; d: Derived; inn1: Delivery[]; inn2: Delivery[] }) {
  const [which, setWhich] = useState<"1" | "2">(d.innings === 2 ? "2" : "1");
  const s = which === "1" ? d.first : d.second;
  const ds = which === "1" ? inn1 : inn2;
  const bpo = d.cfg.ballsPerOver;
  const mdn = maidens(ds, bpo);
  const fow = fallOfWickets(ds, bpo);
  const ex = s.extras;
  return (
    <div className="space-y-6">
      <Segmented value={which} onChange={setWhich} options={[{ id: "1", label: teamName(match, battingSide(match, 1)) }, { id: "2", label: teamName(match, battingSide(match, 2)) }]} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-primary"><tr><th className="py-2 text-left">Batter</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th className="text-right">SR</th></tr></thead>
          <tbody>
            {s.batters.map((b) => (
              <tr key={b.name} className="border-t border-border text-center">
                <td className="py-2.5 text-left"><div className="font-semibold">{b.name}</div><div className="text-xs italic text-muted-foreground">{outText(b)}</div></td>
                <td className="score-num">{b.runs}</td><td>{b.balls}</td><td>{b.fours}</td><td>{b.sixes}</td><td className="text-right">{strikeRate(b.runs, b.balls).toFixed(1)}</td>
              </tr>
            ))}
            {s.batters.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-muted-foreground">Innings not started.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
        <div className="flex justify-between"><span>Extras</span><span className="score-num">{ex.total}</span></div>
        <div className="flex justify-between"><span>Overs</span><span className="score-num">{formatOvers(s.legalBalls, bpo)}</span></div>
        <div className="flex justify-between font-bold text-primary"><span>Total</span><span className="score-num">{s.runs}/{s.wickets}</span></div>
        <div className="flex justify-between"><span>Run rate</span><span className="score-num">{runRate(s.runs, s.legalBalls, bpo).toFixed(2)}</span></div>
        <div className="col-span-2 text-xs text-muted-foreground">
          {[["WD", ex.wide], ["NB", ex.noball], ["B", ex.bye], ["LB", ex.legbye], ["P", ex.penalty]].filter(([, v]) => Number(v) > 0).map(([k, v]) => `${k} ${v}`).join(" · ") || "No extras"}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-primary"><tr><th className="py-2 text-left">Bowler</th><th>O</th><th>M</th><th>R</th><th>W</th><th>Eco</th><th className="text-right">Ext</th></tr></thead>
          <tbody>
            {s.bowlers.map((b) => (
              <tr key={b.name} className="border-t border-border text-center">
                <td className="py-2.5 text-left font-semibold">{b.name}</td>
                <td>{formatOvers(b.balls, bpo)}</td><td>{mdn[b.name] ?? 0}</td><td>{b.runs}</td><td className="score-num">{b.wickets}</td>
                <td>{economy(b.runs, b.balls, bpo).toFixed(1)}</td><td className="text-right">{b.wides + b.noBalls}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {fow.length > 0 && (
        <section>
          <h3 className="mb-2 text-lg font-bold text-primary">Fall of wickets</h3>
          {fow.map((f) => (
            <div key={f.n} className="flex justify-between border-t border-border py-2 text-sm">
              <span className="w-8 text-muted-foreground">{f.n}</span><span className="flex-1">{f.player}</span><span className="score-num">{f.score} ({f.over})</span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function Balls({ d, inn1, inn2, n1, n2 }: { d: Derived; inn1: Delivery[]; inn2: Delivery[]; n1: string; n2: string }) {
  const [which, setWhich] = useState<"1" | "2">(d.innings === 2 ? "2" : "1");
  const ds = which === "1" ? inn1 : inn2;
  const bpo = d.cfg.ballsPerOver;
  const groups = overGroups(ds, bpo).reverse();
  const st = which === "1" ? d.first : d.second;
  return (
    <div className="space-y-4">
      <div className="mx-auto max-w-sm"><Segmented value={which} onChange={setWhich} options={[{ id: "1", label: `1st · ${n1}` }, { id: "2", label: `2nd · ${n2}` }]} /></div>
      {groups.length === 0 && <p className="py-6 text-center text-muted-foreground">No balls yet.</p>}
      {groups.map((g) => {
        const done = g.balls.filter((b) => b.d.extra_type !== "wide" && b.d.extra_type !== "noball").length >= bpo;
        return (
          <div key={g.over} className="space-y-1">
            {done && (
              <div className="rounded-2xl border border-border bg-muted/60 p-4 text-sm">
                <div className="flex flex-wrap gap-1.5">{g.balls.map((b) => <BallChip key={b.d.id} d={b.d} />)}</div>
                <div className="mt-3 grid grid-cols-2 gap-x-4 border-t border-border pt-3">
                  <div className="space-y-1">{g.batters.slice(-2).map((n) => {
                    const bl = st.batters.find((x) => x.name === n);
                    return <div key={n} className="flex justify-between"><span>{n}</span><span className="score-num">{bl?.runs ?? 0}({bl?.balls ?? 0})</span></div>;
                  })}</div>
                  <div><div>{g.bowler}</div></div>
                </div>
                <div className="mt-3 flex justify-between border-t border-border pt-3 font-semibold text-primary">
                  <span>Over {g.over}</span><span>Runs {g.runs}</span><span>Score {g.scoreAfter}-{g.wicketsAfter}</span>
                </div>
              </div>
            )}
            {[...g.balls].reverse().map(({ d: b, label }) => {
              const w = countsAsWicket(b.wicket);
              return (
                <div key={b.id} className="flex items-start gap-4 py-2.5">
                  <span className="score-num w-10 pt-2 text-sm">{label}</span>
                  <span className={cn("inline-flex h-10 min-w-10 items-center justify-center rounded-full border-2 px-1 text-sm font-bold",
                    w ? "border-wicket bg-wicket text-accent-foreground" : b.runs_bat === 6 ? "border-six text-six" : b.runs_bat === 4 ? "border-four text-four" : "border-primary/30 text-primary")}>
                    {ballLabel(b)}
                  </span>
                  <div className="min-w-0">
                    <div className="font-medium">{b.bowler} to {b.striker}</div>
                    <div className="text-sm text-muted-foreground">{describeBall(b)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function Info({ match, tour, look }: { match: MatchRow; tour: { name: string; club?: string | null; ball_type?: string | null; season?: string | null } | null; look: Look }) {
  const rows: [string, string | null | undefined][] = [
    ["Tournament", tour?.name],
    ["Club", tour?.club],
    ["Match title", match.name],
    ["Format", `T${match.overs}`],
    ["Ball type", tour?.ball_type],
    ["Season", tour?.season ?? (match.match_date ? match.match_date.slice(0, 4) : null)],
    ["Playing", `${match.players_per_team} per side`],
    ["Overs", String(match.overs)],
    ["Balls per over", String(match.balls_per_over)],
    ["Venue", match.venue],
    ["Date", match.match_date ? new Date(match.match_date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : null],
    ["Toss won by", match.toss_winner ? teamName(match, match.toss_winner as "A" | "B") : "—"],
    ["Decided to", match.toss_decision ? (match.toss_decision === "bat" ? "Bat" : "Bowl") : "—"],
  ];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 border-b border-border pb-6 text-center">
        {(["A", "B"] as const).map((s) => (
          <div key={s} className="flex flex-col items-center gap-3"><TeamBadge {...look(s)} size={80} /><span className="font-bold uppercase">{look(s).name}</span></div>
        ))}
      </div>
      <dl className="grid grid-cols-[9rem_1fr] gap-y-4 text-sm">
        {rows.filter(([, v]) => v).map(([k, v]) => (<><dt key={`${k}-k`} className="font-semibold">{k}</dt><dd key={`${k}-v`} className="text-muted-foreground">{v}</dd></>))}
      </dl>
      <div className="grid gap-4 sm:grid-cols-2">
        {(["A", "B"] as const).map((s) => (
          <div key={s} className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-2 font-bold">{look(s).name} squad</h3>
            <ol className="list-decimal pl-5 text-sm text-muted-foreground">{(s === "A" ? match.team_a_players : match.team_b_players).map((p) => <li key={p}>{p}</li>)}</ol>
          </div>
        ))}
      </div>
    </div>
  );
}
