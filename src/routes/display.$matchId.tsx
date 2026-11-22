import { globalDefault } from '@/lib/global-settings';
import { useFeatureAccess } from "@/lib/feature-access";
import { useTournamentBranding } from "@/lib/cricket/tournament-branding";
import { tvTournamentName } from "@/lib/cricket/tv-tournament-name";
import { useEffect, useState, useRef } from "react";
import { useTournamentPresentation } from "@/lib/cricket/tournament-presentation";
import { TvHonours } from "@/components/cricket/tv-honours";
import { createFileRoute, Link } from "@tanstack/react-router";
import { TV_SETTINGS_EVENT } from "@/lib/cricket/tv-settings";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePlayoffs } from "@/lib/cricket/use-playoffs";
import { automaticDraw } from "@/lib/cricket/tv-playoffs";
import { TvPlayoffs } from "@/components/cricket/tv-playoffs";
import { BallChip, ConnBadge, StatusPill } from "@/components/cricket/bits";
import { Button } from "@/components/ui/button";
import { formatOvers, requiredRunRate, runRate } from "@/lib/cricket/engine";
import { getLive, teamName, useLiveMatch, type Derived, type MatchRow } from "@/lib/cricket/match";
import { useTvFeed } from "@/lib/cricket/tv-feed";
import { tvPlayers } from "@/lib/cricket/tv-players";
import { TvViewport } from "@/components/cricket/tv-viewport";
import { TvVictory, victoryLevel } from "@/components/cricket/tv-victory";
import { usePresentation } from "@/lib/presentation-settings";
import { matchOutcome } from "@/lib/cricket/tournament";
import { calculateMatchAward } from "@/lib/cricket/match-award";
import { TvHighlights } from "@/components/cricket/tv-highlight";
import { TvIntroduction, TvWatermark, tvMatchType, showTvIntroduction, useTvLogos, type TvLogos } from "@/components/cricket/tv-presentation";

export const Route = createFileRoute("/display/$matchId")({
  head: () => ({ meta: [{ title: "Scoreboard — Crease" }] }),
  component: Display,
});

function Display() {
  const { matchId } = Route.useParams();
  const [activeId, setActiveId] = useState(matchId);
  const { allows } = useFeatureAccess({ match: activeId });
  const [following, setFollowing] = useState(true);
  const [tournamentId, setTournamentId] = useState<string | null>(null);
  const { match, deliveries, derived, conn, lastUpdated, error, refetch } = useLiveMatch(activeId);
  const {nextId,preparing} = useTvFeed(tournamentId, activeId, following);
  const playoffs = usePlayoffs(tournamentId ?? undefined, !!tournamentId, false);
  const [autoDraw,setAutoDraw] = useState(true);
  const [manualDraw,setManualDraw] = useState<null|5|10|"hold">(null);
  const [manualRequest,setManualRequest] = useState(0);
  const [drawDismissed,setDrawDismissed] = useState(false);
  const [highlightPlaying, setHighlightPlaying] = useState(false);
  const [resultElapsed,setResultElapsed] = useState(false);
  const presentation = usePresentation();
  const broadcast = useTournamentPresentation(tournamentId);
  const honoursPlaying = allows("honours") && !!match && !broadcast.isError && !playoffs.isError && following && !!broadcast.data?.playing && !!playoffs.data;
  const wasPlaying = useRef(false);
  useEffect(()=>{if(wasPlaying.current && !honoursPlaying){setDrawDismissed(true);setResultElapsed(true);}wasPlaying.current=honoursPlaying;},[honoursPlaying]);
  const publication = useQuery({queryKey:["match-award",match?.id,match?.score_revision],enabled:match?.status==="completed",queryFn:async()=>{
    const {data,error}=await supabase.rpc("read_match_award",{_match:match!.id});if(error)throw error;return data;
  },refetchInterval:5000,retry:false});
  useEffect(()=>{
    setResultElapsed(false);
    if(highlightPlaying||!match||!["completed","abandoned","cancelled"].includes(match.status))return;
    const timer=window.setTimeout(()=>setResultElapsed(true),presentation.duration);
    return()=>window.clearTimeout(timer);
  },[match?.id,match?.status,publication.data,presentation.duration,highlightPlaying]);
  useEffect(()=>{
    setManualDraw(null);
    setDrawDismissed(false);
  },[activeId,match?.status,match?.toss_winner]);
  useEffect(()=>{
    if(!manualDraw||manualDraw==="hold")return;
    const timer=window.setTimeout(()=>setManualDraw(null),manualDraw*1000);
    return()=>window.clearTimeout(timer);
  },[manualDraw,manualRequest]);
  useEffect(()=>{try{setAutoDraw(localStorage.getItem("crease-tv-auto-draw")!=="false")}catch{/* session default */}},[]);
  const approved=!!match && !playoffs.isError && !!playoffs.data?.playoff?.approved;
  const showDraw=approved&&(!!manualDraw||(!drawDismissed&&automaticDraw(match,approved,following,autoDraw,preparing,resultElapsed)));
  const requestDraw=(duration:5|10|"hold")=>{setManualDraw(duration);setManualRequest(n=>n+1);setSettings(false)};
  const logos = useTvLogos(match);
  const branding = useTournamentBranding(match?.tournament_id);
  const tournamentLogo = branding.data?.logo_url ?? null;
  const tournamentName = match ? tvTournamentName(branding.data ?? playoffs.data?.tournament) ?? match.name : undefined;
  const outcome = match?.status === "completed" ? matchOutcome(match, deliveries) : null;
  const winner = outcome && outcome.winner !== "tie" ? outcome.winner : null;
  const published = !!match && !!publication.data && typeof publication.data === "object" && !Array.isArray(publication.data) && publication.data["score_revision"] === match.score_revision;
  const award = allows("awards") && published && match ? calculateMatchAward(match, deliveries) : null;
  const celebrating = !highlightPlaying && allows("celebrations") && !!winner && presentation.celebration && !resultElapsed && !manualDraw;
  const [settings, setSettings] = useState(false);
  const [theme, setTheme] = useState("teal");
  const [font, setFont] = useState("modern");
  const [notice, setNotice] = useState("");
  useEffect(() => { setActiveId(matchId); setTournamentId(null); }, [matchId]);
  useEffect(() => { if (match) setTournamentId(match.tournament_id); }, [match]);
  useEffect(() => { if (nextId !== activeId) setActiveId(nextId); }, [nextId, activeId]);
  useEffect(() => {
    const refreshStyle = () => {
    try {
      const stored = JSON.parse(localStorage.getItem("crease-tv-style") ?? "{}");
      if (["teal", "blue", "violet", "night"].includes(stored.theme)) setTheme(stored.theme); else setTheme(globalDefault("tv_theme", "teal"));
      if (["modern", "system", "classic"].includes(stored.font)) setFont(stored.font);
    } catch { /* Storage may be disabled. */ }
    };
    refreshStyle();
    window.addEventListener("storage",refreshStyle);
    window.addEventListener(TV_SETTINGS_EVENT,refreshStyle);
    return () => {window.removeEventListener("storage",refreshStyle);window.removeEventListener(TV_SETTINGS_EVENT,refreshStyle);};
  }, []);
  const saveStyle = (nextTheme: string, nextFont: string) => {
    setTheme(nextTheme); setFont(nextFont);
    try { localStorage.setItem("crease-tv-style", JSON.stringify({ theme: nextTheme, font: nextFont })); } catch { /* Keep session choice. */ }
  };
  const fullscreen = async () => {
    setSettings(false);
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else setNotice("Fullscreen is not supported by this browser.");
    } catch { setNotice("Use your browser’s fullscreen control to expand the scoreboard."); }
  };
  if (!allows("tv")) return <TvViewport><main className="tv-page flex min-h-dvh items-center justify-center p-8"><p>TV display is unavailable for this match.</p></main></TvViewport>;
  return <TvViewport><div className="tournament-page scoring-page tv-page tv-broadcast flex min-h-dvh flex-col" data-theme={allows("appearance") ? theme : "teal"} data-font={allows("appearance") ? font : "modern"}>
    <header className="tv-topbar flex flex-wrap items-center justify-between gap-3 border-b border-border px-[3vw] py-4">
      <div><span className="text-lg font-extrabold text-primary">Crease</span><span className="ml-3 text-sm text-muted-foreground">TV scoreboard</span></div>
      <p className="tv-topbar-title" title={tournamentName}>{tournamentName}</p>
      <div className="flex flex-wrap items-center gap-3"><ConnBadge conn={conn} lastUpdated={lastUpdated} />
        {approved && <Button variant="outline" size="sm" onClick={()=>requestDraw(10)}>Show draw</Button>}
        <Button variant="outline" size="sm" aria-expanded={settings} onClick={() => setSettings(!settings)}>Display options</Button>
        <Button variant="outline" size="sm" onClick={fullscreen}>Fullscreen</Button>
      </div>
    </header>
    {settings && <section aria-label="Display options" className="flex flex-wrap items-end gap-5 border-b border-border bg-muted p-5">
      {allows("appearance") && <><label className="grid gap-2 text-sm font-semibold">Color theme<select className="rounded-lg border border-input bg-background p-2" value={theme} onChange={e => saveStyle(e.target.value, font)}><option value="teal">Crease teal</option><option value="blue">Ocean blue</option><option value="violet">Violet</option><option value="night">Night stadium</option></select></label>
      <label className="grid gap-2 text-sm font-semibold">Font<select className="rounded-lg border border-input bg-background p-2" value={font} onChange={e => saveStyle(theme, e.target.value)}><option value="modern">Modern · Manrope</option><option value="system">System sans</option><option value="classic">Classic · Fraunces</option></select></label>
      </>}
      {tournamentId && <label className="flex items-center gap-2 py-2 text-sm"><input type="checkbox" checked={following} onChange={e => setFollowing(e.target.checked)} /> Automatically follow tournament</label>}
      {tournamentId && <label className="flex items-center gap-2 py-2 text-sm"><input type="checkbox" checked={autoDraw} onChange={e=>{setAutoDraw(e.target.checked);try{localStorage.setItem("crease-tv-auto-draw",String(e.target.checked))}catch{/* session choice */}}}/> Show playoffs between matches</label>}
      {approved && <fieldset className="flex flex-wrap items-center gap-2"><legend className="mb-2 text-sm font-semibold">Show draw</legend>{([5,10,"hold"] as const).map(duration=><Button key={duration} variant="outline" size="sm" onClick={()=>requestDraw(duration)}>{duration==="hold"?"Until dismissed":`${duration} seconds`}</Button>)}</fieldset>}
      <Button asChild variant="outline"><Link to="/settings" target="_blank" rel="noopener noreferrer">Animation settings & previews</Link></Button>
    </section>}
    {(conn === "offline" || error || notice) && <div role="status" className="bg-muted px-5 py-3 text-center text-sm">{error ?? (conn === "offline" ? "Live connection interrupted. Checking for updates every 5 seconds." : notice)} {error && <Button variant="outline" size="sm" onClick={() => void refetch()}>Retry</Button>}</div>}
    {honoursPlaying && playoffs.data ? <TvHonours key={broadcast.data?.updated_at} ctx={playoffs.data} seconds={broadcast.data?.seconds ?? 8}/> : celebrating && match && winner ? <TvVictory key={`${match.id}-${JSON.stringify(publication.data)}`} tournamentName={tvTournamentName(branding.data ?? playoffs.data?.tournament)} name={teamName(match,winner)} result={derived?.result ?? ""} level={victoryLevel(match.rules)} logo={logos[winner === "A" ? match.team_a_id ?? "" : match.team_b_id ?? ""]} watermark={tournamentLogo} award={award && !award.uncreditedFielding ? award.winners.map(p=>`${p.name} (${p.team})`).join(" & ") : undefined} settings={presentation}/> : showDraw && playoffs.data ? <TvPlayoffs ctx={playoffs.data} logo={tournamentLogo} forceDraw={!!manualDraw}/> : match && derived ? <TvScoreboard match={match} d={derived} logos={logos} tournamentLogo={tournamentLogo} /> : <main className="grid flex-1 place-items-center p-12 text-muted-foreground">{error ? "Scoreboard unavailable" : "Connecting to scoreboard…"}</main>}
    {match && match.id === activeId && <TvHighlights key={match.id} matchId={match.id} deliveries={deliveries} conn={conn} match={match} suppressed={showDraw || honoursPlaying} onActiveChange={setHighlightPlaying} />}
    <footer className="flex flex-wrap justify-between gap-2 border-t border-border px-[3vw] py-4 text-sm text-muted-foreground">
      <span>{match?.venue || "Crease · Live cricket"}{match ? ` · ${match.overs} overs · ${match.balls_per_over} balls per over` : ""}</span>
      {showDraw ? <Button size="sm" variant="outline" onClick={()=>{setManualDraw(null);setDrawDismissed(true)}}>Return to scoreboard</Button> : <span>{tournamentId && following ? "Following tournament · Next match appears when it starts" : "Following this match"}</span>}
    </footer>
  </div></TvViewport>;
}

export function TvScoreboard({ match, d, logos = {}, tournamentLogo }: { match: MatchRow; d: Derived; logos?: TvLogos; tournamentLogo?: string | null | undefined }) {
  return showTvIntroduction(match, d) ? <TvIntroduction key={match.id} match={match} logos={logos} tournamentLogo={tournamentLogo} /> : <TvScoreDetail match={match} d={d} tournamentLogo={tournamentLogo} />;
}

function TvScoreDetail({ match, d, tournamentLogo }: { match: MatchRow; d: Derived; tournamentLogo?: string | null | undefined }) {
  const s = d.current, live = getLive(match);
  const finished = ["completed", "abandoned", "cancelled"].includes(match.status);
  const slots = tvPlayers(match, d);
  const names = finished ? [...s.batters].sort((a, b) => b.runs - a.runs).slice(0, 2).map(b => b.name) : slots.batters.map(b => b.name);
  const bowlerName = live.bowler ?? s.next.lastBowler;
  const bowl = s.bowlers.find(b => b.name === bowlerName);
  const rrr = d.target != null ? requiredRunRate(d.target, s, d.cfg) : null;
  const toss = match.toss_winner && match.toss_decision
    ? `${teamName(match, match.toss_winner === "A" ? "A" : "B")} won the toss and elected to ${match.toss_decision === "bat" ? "bat" : "bowl"}`
    : "Waiting for the toss";
  return <main className="tv-arena">
    <section className="tv-arena-match">
      <div className="tv-match-type tv-score-match-type">{tvMatchType(match)}</div>
      <h1 aria-label={match.team_a + " vs " + match.team_b}>
        <span className="tv-arena-team">{match.team_a}</span>
        <span className="tv-arena-vs">vs</span>
        <span className="tv-arena-team">{match.team_b}</span>
      </h1>
      <div className="tv-arena-status"><StatusPill status={match.status} /></div>
      <p>{toss}</p>
    </section>
    <section className="tv-arena-score" aria-label="Score summary">
      <div className="tv-arena-metric"><span>Overs</span><strong>{formatOvers(s.legalBalls, d.cfg.ballsPerOver)}</strong><small>of {d.cfg.overs} overs</small></div>
      <div className="tv-arena-total">
        <TvWatermark url={tournamentLogo} />
        <p>{teamName(match, d.battingSide)} · {d.innings >= 3 ? `Super Over - Innings ${d.innings - 2}` : `Innings ${d.innings}`}</p>
        <div className="score-num" data-compact={String(s.runs).length + String(s.wickets).length > 3}>{s.runs}<span>/</span>{s.wickets}</div>
      </div>
      <div className="tv-arena-metric"><span>Current run rate</span><strong>{runRate(s.runs, s.legalBalls, d.cfg.ballsPerOver).toFixed(2)}</strong><small>runs per over</small></div>
    </section>
    <div className="tv-arena-result" aria-live="polite">
      {d.target != null && <span>Target <b>{d.target}</b></span>}
      {(match.status === "completed" || d.needsSuperOver || d.needsDecidingToss) && d.result ? <strong>{d.result}</strong> : <>
        {d.target != null && !finished && <span>Need <b>{Math.max(0, d.target - s.runs)}</b> from <b>{Math.max(0, d.cfg.overs * d.cfg.ballsPerOver - s.legalBalls)}</b> balls</span>}
        {rrr != null && !finished && <span>RRR <b>{Math.max(0, rrr).toFixed(2)}</b></span>}
      </>}
      {["paused", "innings_break", "abandoned", "cancelled"].includes(match.status) && <span className="capitalize">{match.status.replace("_", " ")}</span>}
    </div>
    <section className="tv-arena-players" aria-label={finished ? "Leading batters · This innings" : "At the crease"}>
      {names.map((name, index) => {
        const batter = s.batters.find(b => b.name === name);
        return <div key={index} className="tv-arena-player" data-faded={!finished && slots.batters[index]?.faded} data-striker={!finished && index === 0 && !!live.striker}>
          <p>{finished ? (batter?.out ? "Out" : "Not out") : index === 0 ? "Striker" : "Non-striker"}</p>
          <div><strong className="tv-arena-player-name">{name || "—"}</strong><strong className="tv-arena-player-score">{name ? batter?.runs ?? 0 : "—"} {name && <small>({batter?.balls ?? 0})</small>}</strong></div>
          <small>Runs (balls)</small>
        </div>;
      })}
      <div className="tv-arena-player" data-faded={!finished && slots.bowler.faded}>
        <p>{finished ? "Last bowler" : "Bowler"}</p>
        <div><strong className="tv-arena-player-name">{bowlerName || "—"}</strong><strong className="tv-arena-player-score">{bowlerName ? (bowl?.wickets ?? 0) + "/" + (bowl?.runs ?? 0) : "—"}</strong></div>
        <small>{formatOvers(bowl?.balls ?? 0, d.cfg.ballsPerOver)} overs</small>
      </div>
    </section>
    <section className="tv-arena-timeline" aria-label="Ball by ball">
      <div><span>Ball by ball</span><strong>This over</strong></div>
      <div>{s.currentOver.length ? s.currentOver.map(b => <BallChip key={b.id} d={b} size="lg" />) : <span>Waiting for the first ball of the over</span>}</div>
    </section>
  </main>;
}
