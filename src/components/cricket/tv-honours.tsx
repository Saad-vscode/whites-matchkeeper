import { useFeatureAccess } from "@/lib/feature-access";
import { tvTournamentName } from "@/lib/cricket/tv-tournament-name";
import { useEffect, useMemo, useState, useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Medal, Star, CircleDot } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { playoffNode, type PlayoffContext } from "@/lib/cricket/playoffs";
import { honoursMatches } from "@/lib/cricket/honours-matches";
import { tournamentSummary, compareRuns, compareWickets } from "@/lib/cricket/tournament-summary";
import { tournamentHonours } from "@/lib/cricket/tournament-home";
import { matchStageTitle } from "@/lib/cricket/match-stage";
import { calculateMatchAward } from "@/lib/cricket/match-award";
import { usePresentation } from "@/lib/presentation-settings";
import { TvVictory } from "./tv-victory";
import { TvWatermark } from "./tv-presentation";
import "./tv-honours.css";

export function TvHonours({ ctx, seconds }: { ctx: PlayoffContext; seconds: number }) {
  const { allows } = useFeatureAccess({ tournament: ctx.tournament.id });
  const saved = usePresentation();
  const settings = { ...saved, honoursPlayer: saved.honoursPlayer && allows("awards"), honoursMatches: saved.honoursMatches && allows("awards") };
  const [slide, setSlide] = useState(0);
  const pages = ["champions", "runners", ...(settings.honoursRuns || settings.honoursWickets || settings.honoursPlayer ? ["individual"] : []), ...(settings.honoursMatches ? ["knockout"] : [])];
  const count = pages.length, activeSlide = slide % count;
  useEffect(() => {
    const timer = setInterval(() => setSlide(i => (i + 1) % count), Math.max(5, Math.min(10, seconds)) * 1000);
    return () => clearInterval(timer);
  }, [seconds, count]);
  const summary = useMemo(() => tournamentSummary(ctx.matches, ctx.deliveries, ctx.teams), [ctx]);
  const honours = tournamentHonours(summary.matches);
  const matches = honoursMatches(ctx);
  const stage = (m: typeof matches[number]) => (ctx.playoff?.draw.nodes.find(n => n.id === playoffNode(m))?.title ?? matchStageTitle(m.rules) ?? "Match").replace(/semi[ -]final/i, "Semi-final");
  const ipl = ctx.playoff?.draw.format === "ipl" || (!ctx.playoff && matches.some(m => /qualifier|eliminator/i.test(stage(m))));
  const awards = useQuery({
    enabled: settings.honoursMatches,
    queryKey: ["honours-awards", ctx.tournament.id, matches.map(m => `${m.id}:${m.score_revision}:${m.status}`).join()],
    refetchInterval: 5000,
    queryFn: async () => Promise.all(matches.map(async m => {
      const { data, error } = await supabase.rpc("read_match_award", { _match: m.id });
      if (error) throw error;
      const published = data && typeof data === "object" && !Array.isArray(data) && data["score_revision"] === m.score_revision;
      const result = published && m.status === "completed" ? calculateMatchAward(m, ctx.deliveries.filter(d => d.match_id === m.id)) : null;
      return { id: m.id, title: stage(m), name: result && !result.uncreditedFielding ? result.winners.map(p => `${p.name} (${p.team})`).join(" & ") : "Awaiting publication" };
    })),
  });
  if (!honours) return <main className="tv-draw grid place-items-center">Tournament results are being confirmed</main>;
  const logo = (id: string | null) => ctx.teams.find(t => t.id === id)?.logo_url;
  if (activeSlide < 2) {
    const runner = activeSlide === 1, team = runner ? honours.runnerUp : honours.champion;
    return <TvVictory key={pages[activeSlide]} level="final" runnerUp={runner} name={team.name} result={runner ? "A brilliant campaign. A team to celebrate." : ""} tournamentName={tvTournamentName(ctx.tournament)} logo={logo(team.id)} watermark={ctx.tournament.logo_url} settings={settings} />;
  }
  const runs = [...summary.players].filter(p => p.runs > 0).sort(compareRuns), wickets = [...summary.players].filter(p => p.wickets > 0).sort(compareWickets);
  const runWinners = runs.filter(p => compareRuns(p, runs[0]!) === 0), wicketWinners = wickets.filter(p => compareWickets(p, wickets[0]!) === 0);
  const individual = pages[activeSlide] === "individual";
  const matchAwards = awards.data ?? matches.map(m => ({ id: m.id, title: stage(m), name: awards.isError ? "Award unavailable" : "Awaiting publication" }));
  const awardFor = (title: string): Award => ({
    title: `Man of the Match · ${title}`,
    name: matchAwards.find(a => a.title.toLowerCase() === title.toLowerCase())?.name ?? "Awaiting publication",
    hero: title === "Final", kind: title === "Final" ? "trophy" : "medal",
  });
  const items: Award[] = individual ? [
    ...(settings.honoursRuns ? [{ title: "Most Runs", name: runWinners.map(p => `${p.name} (${p.team})`).join(" & ") || "No performance recorded", value: runs[0]?.runs, kind: "bat" as const }] : []),
    ...(settings.honoursPlayer ? [{ title: "Player of the Tournament", name: summary.uncreditedFielding ? "Awaiting confirmed fielding credits" : summary.seriesPlayers.map(p => `${p.name} (${p.team})`).join(" & ") || "To be announced", hero: true, kind: "star" as const }] : []),
    ...(settings.honoursWickets ? [{ title: "Most Wickets", name: wicketWinners.map(p => `${p.name} (${p.team})`).join(" & ") || "No performance recorded", value: wickets[0]?.wickets, kind: "ball" as const }] : []),
  ] : (ipl ? ["Qualifier 1", "Final", "Qualifier 2", "Eliminator"] : ["Semi-final 1", "Final", "Semi-final 2"]).map(awardFor);
  return <main key={pages[activeSlide]} className="tv-honours ceremony" data-motion={settings.motion} aria-label={individual ? "Tournament honours" : "Knockout match honours"}>
    <TvWatermark url={ctx.tournament.logo_url} />
    <CeremonyHeading subtitle={individual ? "Individual excellence" : "The knockout match winners"} />
    <div className="ceremony-podium" data-count={items.length}>{items.map(item => <AwardPodium key={item.title} {...item} />)}</div>
    <footer className="ceremony-footer"><span>{tvTournamentName(ctx.tournament)}</span><span>{individual ? "Tournament Individual Honors" : "Knockout Match Honors"}</span></footer>
  </main>;
}
type Award = { title: string; name: string; hero?: boolean; value?: number | undefined; kind: "bat" | "ball" | "star" | "medal" | "trophy" };
function AwardPodium({ title, name, hero, value, kind }: Award) {
  const Icon = { bat: CricketBat, ball: CircleDot, star: Star, medal: Medal, trophy: Trophy }[kind];
  return <section className="ceremony-award" data-hero={!!hero} aria-label={title}>
    <div className="ceremony-seal" aria-hidden="true"><Icon /></div>
    <p className="ceremony-award-title">{title}</p>
    {value !== undefined && <strong className="ceremony-value">{value}<small>{kind === "bat" ? "runs" : "wickets"}</small></strong>}
    <h2 className="ceremony-name" data-long={name.length > 44}>{name}</h2>
    <div className="ceremony-laurel" aria-hidden="true">✦ <span /> ✦</div>
  </section>;
}
function CricketBat() {
  return <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><g transform="rotate(32 24 24)"><path d="M21 4h6v14h-6zM18 18h12v23q-6 5-12 0z" /><path d="M21 8h6m-6 4h6m-6 20v7" /></g><circle cx="37" cy="37" r="6" /><path d="M35 32q6 5 2 10" /></svg>;
}
function CeremonyHeading({ subtitle }: { subtitle: string }) {
  const id = useId().replace(/:/g, "");
  return <header className="ceremony-heading">
    <h1><span className="sr-only">Tournament Honors</span><svg viewBox="0 0 800 126" aria-hidden="true">
      <defs><path id={id} d="M 45,112 Q 400,-68 755,112" /></defs>
      <path className="ceremony-arc" d="M 110,115 Q 400,-12 690,115" />
      <text><textPath href={`#${id}`} startOffset="50%" textAnchor="middle">TOURNAMENT HONORS</textPath></text>
    </svg></h1>
    <p>{subtitle}</p>
  </header>;
}
