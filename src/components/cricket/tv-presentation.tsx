import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getLive, type Derived, type MatchRow } from "@/lib/cricket/match";
import { matchStageTitle } from "@/lib/cricket/match-stage";

export function tvMatchType(match: MatchRow) {
  return matchStageTitle(match.rules)?.replace(/^Group Stage · /, "") || "Match";
}

export type TvLogos = Record<string, string | null>;
export function TvWatermark({ url }: { url?: string | null | undefined }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!url || failedUrl === url) return null;
  return <img className="tv-watermark" src={url} alt="" aria-hidden="true" draggable={false} onError={() => setFailedUrl(url)} />;
}
export function useTvLogos(match: MatchRow | null) {
  const ids = [match?.team_a_id, match?.team_b_id].filter((id): id is string => !!id);
  const { data } = useQuery({
    queryKey: ["tv-team-logos", ...ids], enabled: ids.length > 0, refetchInterval: 5000,
    queryFn: async () => {
      const {data,error} = await supabase.from("tournament_teams").select("id,logo_url").in("id",ids);
      if(error) throw error;
      return Object.fromEntries((data ?? []).map(team => [team.id,team.logo_url])) as TvLogos;
    },
  });
  return data ?? {};
}
export function showTvIntroduction(match: MatchRow, d: Derived) {
  const live = getLive(match);
  const played = d.first.legalBalls > 0 || d.first.currentOver.length > 0 || d.first.batters.length > 0 || d.first.runs > 0;
  return !["completed", "abandoned", "cancelled"].includes(match.status) &&
    d.innings === 1 && !played &&
    !(match.toss_winner && match.toss_decision && live.striker && live.nonStriker && live.bowler);
}

export function TvTeamLogo({ name, url }: { name: string; url?: string | null | undefined }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return <span className="tv-team-logo">
    {url && !failed ? <img src={url} alt={name + " logo"} onError={() => setFailed(true)} /> : <span aria-label={name + " team emblem"}>{name.split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase()}</span>}
  </span>;
}

export function TvIntroduction({ match, logos, tournamentLogo }: { match: MatchRow; logos: TvLogos; tournamentLogo?: string | null | undefined }) {
  const decided = !!(match.toss_winner && match.toss_decision);
  const winner = match.toss_winner === "A" ? match.team_a : match.team_b;
  return <main className="tv-introduction" aria-label="Match introduction">
    <TvWatermark url={tournamentLogo} />
    <div className="tv-intro-top"><span className="tv-match-type tv-intro-match-type">{tvMatchType(match)}</span><span className="tv-intro-tag">{decided ? "THE TOSS" : "UP NEXT"}</span></div>
    <div key={match.id} className="tv-faceoff" aria-label={match.team_a + " vs " + match.team_b}>
      <div className="tv-team"><TvTeamLogo name={match.team_a} url={logos[match.team_a_id ?? ""]} /><h1>{match.team_a}</h1></div>
      <div className="tv-versus"><span /><b>VS</b><span /></div>
      <div className="tv-team"><TvTeamLogo name={match.team_b} url={logos[match.team_b_id ?? ""]} /><h1>{match.team_b}</h1></div>
    </div>
    <div key={match.id + String(match.toss_winner) + String(match.toss_decision)} className="tv-toss-announcement" data-decided={decided} role="status">
      {decided ? <><p className="tv-eyebrow">Toss decision</p><h2><strong>{winner}</strong> won the toss<br />and elected to <strong>{match.toss_decision === "bat" ? "bat" : "bowl"}</strong></h2></> : <><p className="tv-eyebrow">Match day</p><h2>Waiting for the toss</h2></>}
    </div>
    <div className="tv-intro-bottom"><span>{match.overs} overs <i /> {match.balls_per_over} balls per over</span><span>{decided ? "Play begins shortly" : "The stage is set"}</span></div>
  </main>;
}
