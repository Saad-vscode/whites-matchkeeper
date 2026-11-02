import { createFileRoute, Link } from "@tanstack/react-router";
import { BallChip, ConnBadge, SiteHeader, StatusPill } from "@/components/cricket/bits";
import { economy, formatOvers, runRate, strikeRate, type InningsState } from "@/lib/cricket/engine";
import { battingSide, getLive, teamName, useLiveMatch, type MatchRow } from "@/lib/cricket/match";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/match/$matchId")({
  head: () => ({
    meta: [
      { title: "Live score — Crease" },
      { name: "description", content: "Live ball-by-ball score and full scorecard." },
      { property: "og:title", content: "Live score — Crease" },
      { property: "og:description", content: "Live ball-by-ball score and full scorecard." },
    ],
  }),
  component: Spectator,
});

function Spectator() {
  const { matchId } = Route.useParams();
  const { match, derived: d, conn, lastUpdated, error } = useLiveMatch(matchId);
  if (error) return <div className="p-10 text-center text-muted-foreground">{error}</div>;
  if (!match || !d) return <div className="p-10 text-center text-muted-foreground">Loading…</div>;
  const live = getLive(match);
  const s = d.current;
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ConnBadge conn={conn} lastUpdated={lastUpdated} />
          <Button asChild size="sm" variant="outline">
            <Link to="/display/$matchId" params={{ matchId }}>TV scoreboard</Link>
          </Button>
        </div>
        <section className="rounded-xl bg-board p-5 text-board-foreground shadow-lg">
          <div className="flex items-center justify-between text-xs uppercase tracking-widest text-board-muted">
            <span>{match.name}{match.venue ? ` · ${match.venue}` : ""}</span>
            <StatusPill status={match.status} />
          </div>
          <h1 className="mt-2 text-3xl font-extrabold">{match.team_a} v {match.team_b}</h1>
          {match.toss_winner ? (
            <>
              <div className="mt-4 text-sm text-board-muted">{teamName(match, d.battingSide)} · Innings {d.innings}</div>
              <div className="flex items-end justify-between">
                <div className="score-num text-6xl">{s.runs}/{s.wickets}</div>
                <div className="score-num text-2xl">{formatOvers(s.legalBalls, d.cfg.ballsPerOver)} <span className="text-sm text-board-muted">/ {d.cfg.overs} ov</span></div>
              </div>
              <div className="mt-2 flex flex-wrap gap-4 text-sm text-board-muted">
                <span>CRR {runRate(s.runs, s.legalBalls, d.cfg.ballsPerOver).toFixed(2)}</span>
                {d.target != null && <span>Target {d.target} · Need {Math.max(0, d.target - s.runs)} off {d.cfg.overs * d.cfg.ballsPerOver - s.legalBalls}</span>}
              </div>
              {match.status !== "completed" && (
                <div className="mt-3 text-sm">
                  {live.striker && <span className="mr-4">● {live.striker}</span>}
                  {live.nonStriker && <span className="mr-4">{live.nonStriker}</span>}
                  {live.bowler && <span className="text-board-muted">Bowler: {live.bowler}</span>}
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-1.5">{s.currentOver.map((b) => <BallChip key={b.id} d={b} />)}</div>
            </>
          ) : (
            <p className="mt-4 text-board-muted">Waiting for the toss.</p>
          )}
          {d.result && <div className="mt-4 font-display text-2xl font-bold text-extra">{d.result}</div>}
        </section>
        {match.toss_winner && (
          <>
            <Card match={match} s={d.first} title={`${teamName(match, battingSide(match, 1))} innings`} bpo={d.cfg.ballsPerOver} />
            {(d.innings === 2 || d.second.legalBalls > 0) && <Card match={match} s={d.second} title={`${teamName(match, battingSide(match, 2))} innings`} bpo={d.cfg.ballsPerOver} />}
          </>
        )}
      </main>
    </div>
  );
}

function outText(b: InningsState["batters"][number]) {
  if (!b.out) return "not out";
  const k = b.out.kind.replace("_", " ");
  if (b.out.kind === "caught") return `c ${b.out.fielder ?? "?"} b ${b.bowler}`;
  if (["bowled", "lbw", "hit_wicket"].includes(b.out.kind)) return `${k} b ${b.bowler}`;
  if (b.out.kind === "stumped") return `st ${b.out.fielder ?? "?"} b ${b.bowler}`;
  return k;
}

function Card({ s, title, bpo }: { match: MatchRow; s: InningsState; title: string; bpo: number }) {
  return (
    <section className="overflow-x-auto rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-xl font-bold">{title}</h2>
        <span className="score-num">{s.runs}/{s.wickets} ({formatOvers(s.legalBalls, bpo)})</span>
      </div>
      <table className="w-full text-sm">
        <thead className="text-xs uppercase text-muted-foreground">
          <tr><th className="px-4 py-2 text-left">Batter</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th className="pr-4">SR</th></tr>
        </thead>
        <tbody>
          {s.batters.map((b) => (
            <tr key={b.name} className="border-t border-border text-center">
              <td className="px-4 py-2 text-left"><div className="font-semibold">{b.name}</div><div className="text-xs text-muted-foreground">{outText(b)}</div></td>
              <td className="score-num">{b.runs}</td><td>{b.balls}</td><td>{b.fours}</td><td>{b.sixes}</td><td className="pr-4">{strikeRate(b.runs, b.balls).toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t border-border px-4 py-2 text-sm text-muted-foreground">
        Extras {s.extras.total} (wd {s.extras.wide}, nb {s.extras.noball}, b {s.extras.bye}, lb {s.extras.legbye}, p {s.extras.penalty})
      </div>
      <table className="w-full border-t border-border text-sm">
        <thead className="text-xs uppercase text-muted-foreground">
          <tr><th className="px-4 py-2 text-left">Bowler</th><th>O</th><th>R</th><th>W</th><th className="pr-4">Econ</th></tr>
        </thead>
        <tbody>
          {s.bowlers.map((b) => (
            <tr key={b.name} className="border-t border-border text-center">
              <td className="px-4 py-2 text-left font-semibold">{b.name}</td>
              <td>{formatOvers(b.balls, bpo)}</td><td>{b.runs}</td><td className="score-num">{b.wickets}</td><td className="pr-4">{economy(b.runs, b.balls, bpo).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
