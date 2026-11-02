import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { BallChip, ConnBadge } from "@/components/cricket/bits";
import { formatOvers, requiredRunRate, runRate } from "@/lib/cricket/engine";
import { getLive, teamName, useLiveMatch } from "@/lib/cricket/match";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/display/$matchId")({
  head: () => ({
    meta: [
      { title: "Scoreboard — Crease" },
      { name: "description", content: "Full-screen live cricket scoreboard for TVs and projectors." },
      { property: "og:title", content: "Scoreboard — Crease" },
      { property: "og:description", content: "Full-screen live cricket scoreboard for TVs and projectors." },
    ],
  }),
  component: Display,
});

function Display() {
  const { matchId } = Route.useParams();
  const { match, derived: d, conn, lastUpdated } = useLiveMatch(matchId);
  const [calm, setCalm] = useState(false);
  if (!match || !d) return <div className="flex min-h-screen items-center justify-center bg-board text-board-muted">Loading scoreboard…</div>;
  const s = d.current;
  const live = getLive(match);
  const bat = (n?: string | null) => s.batters.find((b) => b.name === n);
  const bowl = s.bowlers.find((b) => b.name === live.bowler);
  const rrr = d.target != null ? requiredRunRate(d.target, s, d.cfg) : null;

  return (
    <div className={cn("flex min-h-screen flex-col bg-board text-board-foreground", calm && "[&_.live-dot]:animate-none")}>
      <header className="flex items-center justify-between border-b border-board-line px-[3vw] py-[1.5vh]">
        <span className="font-display text-[2.2vw] font-extrabold">{match.name}</span>
        <div className="flex items-center gap-4">
          <ConnBadge conn={conn} lastUpdated={lastUpdated} dark />
          <button onClick={() => setCalm(!calm)} className="text-xs text-board-muted underline">{calm ? "Animations off" : "Animations on"}</button>
          <button onClick={() => document.documentElement.requestFullscreen?.()} className="rounded border border-board-line px-3 py-1 text-sm">Fullscreen</button>
        </div>
      </header>
      {conn === "offline" && <div className="bg-wicket px-4 py-2 text-center font-bold">Disconnected — score may be out of date</div>}
      <main className="grid flex-1 grid-cols-[1.4fr_1fr] gap-[2vw] px-[3vw] py-[3vh]">
        <section className="flex flex-col justify-center">
          <div className="text-[2vw] text-board-muted">{teamName(match, d.battingSide)} · Innings {d.innings}</div>
          <div className="score-num text-[13vw] leading-none">{s.runs}<span className="text-board-muted">/</span>{s.wickets}</div>
          <div className="score-num mt-[1vh] text-[3.5vw]">{formatOvers(s.legalBalls, d.cfg.ballsPerOver)} <span className="text-[2vw] text-board-muted">of {d.cfg.overs} overs</span></div>
          <div className="mt-[2vh] flex gap-[3vw] text-[1.8vw] text-board-muted">
            <span>CRR <b className="text-board-foreground">{runRate(s.runs, s.legalBalls, d.cfg.ballsPerOver).toFixed(2)}</b></span>
            {d.target != null && <span>Target <b className="text-board-foreground">{d.target}</b></span>}
            {rrr != null && <span>RRR <b className="text-board-foreground">{rrr.toFixed(2)}</b></span>}
          </div>
          {d.target != null && match.status !== "completed" && (
            <div className="mt-[2vh] text-[2.4vw] font-bold text-extra">Need {Math.max(0, d.target - s.runs)} off {d.cfg.overs * d.cfg.ballsPerOver - s.legalBalls} balls</div>
          )}
          {d.result && <div className="mt-[2vh] font-display text-[3.5vw] font-extrabold text-extra">{d.result}</div>}
        </section>
        <section className="flex flex-col justify-center gap-[2vh] text-[2vw]">
          {[live.striker, live.nonStriker].map((n, i) => n && (
            <div key={i} className="flex justify-between border-b border-board-line pb-[1vh]">
              <span>{i === 0 && <span className="text-extra">● </span>}{n}</span>
              <span className="score-num">{bat(n)?.runs ?? 0} <span className="text-board-muted">({bat(n)?.balls ?? 0})</span></span>
            </div>
          ))}
          {live.bowler && (
            <div className="flex justify-between text-board-muted">
              <span>{live.bowler}</span>
              <span className="score-num">{bowl ? `${formatOvers(bowl.balls, d.cfg.ballsPerOver)}-${bowl.runs}-${bowl.wickets}` : "0.0-0-0"}</span>
            </div>
          )}
          <div className="mt-[2vh] text-[1.2vw] uppercase tracking-widest text-board-muted">This over</div>
          <div className="flex flex-wrap gap-3">{s.currentOver.map((b) => <BallChip key={b.id} d={b} size="xl" />)}</div>
        </section>
      </main>
      <footer className="border-t border-board-line px-[3vw] py-[1.5vh] text-[1.4vw] text-board-muted">{match.team_a} v {match.team_b}{match.venue ? ` · ${match.venue}` : ""}</footer>
    </div>
  );
}
