import { tvTournamentName } from "@/lib/cricket/tv-tournament-name";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Medal, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { PlayoffContext } from "@/lib/cricket/playoffs";
import { tournamentSummary, compareRuns, compareWickets } from "@/lib/cricket/tournament-summary";
import { tournamentHonours } from "@/lib/cricket/tournament-home";
import { matchStageTitle } from "@/lib/cricket/match-stage";
import { calculateMatchAward } from "@/lib/cricket/match-award";
import { usePresentation } from "@/lib/presentation-settings";
import { TvVictory } from "./tv-victory";
import { TvWatermark } from "./tv-presentation";
export function TvHonours({ ctx, seconds }: { ctx: PlayoffContext; seconds: number }) {
  const settings = usePresentation(),
    [slide, setSlide] = useState(0);
  const count =
    settings.honoursRuns ||
    settings.honoursWickets ||
    settings.honoursPlayer ||
    settings.honoursMatches
      ? 3
      : 2;
  const activeSlide = slide % count;
  useEffect(() => {
    const timer = setInterval(
      () => setSlide((i) => (i + 1) % count),
      Math.max(5, Math.min(10, seconds)) * 1000,
    );
    return () => clearInterval(timer);
  }, [seconds, count]);
  const summary = useMemo(() => tournamentSummary(ctx.matches, ctx.deliveries, ctx.teams), [ctx]);
  const honours = tournamentHonours(summary.matches);
  const matches = ctx.matches
    .filter(
      (m) =>
        m.status === "completed" &&
        /^(semi final(?: \d+)?|final)$/i.test(matchStageTitle(m.rules) ?? ""),
    )
    .sort(
      (a, b) =>
        Number(matchStageTitle(a.rules) === "Final") -
          Number(matchStageTitle(b.rules) === "Final") ||
        a.created_at.localeCompare(b.created_at) ||
        a.id.localeCompare(b.id),
    );
  const awards = useQuery({
    enabled: settings.honoursMatches,
    queryKey: [
      "honours-awards",
      ctx.tournament.id,
      matches.map((m) => `${m.id}:${m.score_revision}`).join(),
    ],
    refetchInterval: 5000,
    queryFn: async () =>
      Promise.all(
        matches.map(async (m, i) => {
          const { data, error } = await supabase.rpc("read_match_award", { _match: m.id });
          if (error) throw error;
          const published =
            data &&
            typeof data === "object" &&
            !Array.isArray(data) &&
            data["score_revision"] === m.score_revision;
          const result = published
            ? calculateMatchAward(
                m,
                ctx.deliveries.filter((d) => d.match_id === m.id),
              )
            : null;
          return {
            id: m.id,
            title: matchStageTitle(m.rules) === "Final" ? "Final" : `Semi-final ${i + 1}`,
            name:
              result && !result.uncreditedFielding
                ? result.winners.map((p) => `${p.name} · ${p.team}`).join(" & ")
                : "Awaiting publication",
          };
        }),
      ),
  });
  if (!honours)
    return (
      <main className="tv-draw grid place-items-center">
        Tournament results are being confirmed
      </main>
    );
  const logo = (id: string | null) => ctx.teams.find((t) => t.id === id)?.logo_url;
  if (activeSlide === 0)
    return (
      <TvVictory
        key="champions"
        level="final"
        name={honours.champion.name}
        result=""
        tournamentName={tvTournamentName(ctx.tournament)}
        logo={logo(honours.champion.id)}
        watermark={ctx.tournament.logo_url}
        settings={settings}
      />
    );
  if (activeSlide === 1)
    return (
      <main className="tv-victory tv-runner-presentation" data-motion={settings.motion}>
        <TvWatermark url={ctx.tournament.logo_url} />
        <div className="victory-halo" />
        <div className="victory-content">
          {ctx.tournament.logo_url && (
            <img
              className="victory-brand"
              src={ctx.tournament.logo_url}
              alt={ctx.tournament.name}
            />
          )}
          <Medal className="h-[12vh] w-[12vh]" />
          <p className="victory-title">
            Runners-up<span className="victory-tournament">of {tvTournamentName(ctx.tournament)}</span>
          </p>
          {logo(honours.runnerUp.id) && (
            <img
              className="h-[12vh] w-[12vh] rounded-xl bg-white object-contain p-2"
              src={logo(honours.runnerUp.id)!}
              alt=""
            />
          )}
          <h1>{honours.runnerUp.name}</h1>
          <p className="victory-result">A tournament to be proud of</p>
        </div>
      </main>
    );
  const runs = [...summary.players].filter((p) => p.runs > 0).sort(compareRuns),
    wickets = [...summary.players].filter((p) => p.wickets > 0).sort(compareWickets);
  const runWinners = runs.filter((p) => compareRuns(p, runs[0]!) === 0),
    wicketWinners = wickets.filter((p) => compareWickets(p, wickets[0]!) === 0);
  return (
    <main className="tv-honours" data-motion={settings.motion} aria-label="Tournament honours">
      <TvWatermark url={ctx.tournament.logo_url} />
      <header>
        {ctx.tournament.logo_url && (
          <img className="victory-brand" src={ctx.tournament.logo_url} alt="" />
        )}
        <div>
          <p>{tvTournamentName(ctx.tournament)}</p>
          <h1>Tournament honours</h1>
        </div>
        <Trophy />
      </header>
      {settings.honoursPlayer && (
        <section className="honours-series">
          <Star />
          <div>
            <p>Player of the Tournament</p>
            <h2>
              {summary.uncreditedFielding
                ? "Awaiting confirmed fielding credits"
                : summary.seriesPlayers.map((p) => `${p.name} · ${p.team}`).join(" & ") ||
                  "To be announced"}
            </h2>
          </div>
        </section>
      )}
      {(settings.honoursRuns || settings.honoursWickets) && (
        <div
          className="honours-leaders"
          style={{
            gridTemplateColumns:
              settings.honoursRuns && settings.honoursWickets ? "1fr 1fr" : "1fr",
          }}
        >
          {[
            {
              label: "Most Runs",
              rows: runWinners,
              value: runs[0]?.runs,
              enabled: settings.honoursRuns,
            },
            {
              label: "Most Wickets",
              rows: wicketWinners,
              value: wickets[0]?.wickets,
              enabled: settings.honoursWickets,
            },
          ]
            .filter((item) => item.enabled)
            .map((item) => (
              <section key={item.label}>
                <p>{item.label}</p>
                <strong>{item.value ?? "—"}</strong>
                <h2>
                  {item.rows.map((p) => `${p.name} · ${p.team}`).join(" & ") ||
                    "No performance recorded"}
                </h2>
              </section>
            ))}
        </div>
      )}
      {settings.honoursMatches && (
        <div className="honours-matches">
          {(
            awards.data ??
            matches.map((m, i) => ({
              id: m.id,
              title: matchStageTitle(m.rules) === "Final" ? "Final" : `Semi-final ${i + 1}`,
              name: awards.isError ? "Award unavailable" : "Loading award…",
            }))
          ).map((a) => (
            <section key={a.id}>
              <p>
                <Medal />
                Man of the Match · {a.title}
              </p>
              <h2>{a.name}</h2>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
