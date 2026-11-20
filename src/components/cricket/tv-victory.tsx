import { Trophy, Medal, Sparkles } from "lucide-react";
import type { CSSProperties } from "react";
import { matchStageTitle } from "@/lib/cricket/match-stage";
import type { PresentationSettings } from "@/lib/presentation-settings";
import { TvWatermark } from "./tv-presentation";
import "./tv-victory.css";

export function victoryLevel(
  rules: Parameters<typeof matchStageTitle>[0],
): "match" | "playoff" | "final" {
  const title = matchStageTitle(rules) ?? "";
  return /^final$/i.test(title)
    ? "final"
    : /qualifier|eliminator|knockout|quarter|semi/i.test(title)
      ? "playoff"
      : "match";
}
export function TvVictory({
  name,
  result,
  level,
  logo,
  watermark,
  award,
  settings,
  tournamentName,
  runnerUp = false,
}: {
  name: string;
  result: string;
  level: "match" | "playoff" | "final";
  logo?: string | null | undefined;
  watermark?: string | null | undefined;
  award?: string | undefined;
  settings: PresentationSettings;
  tournamentName?: string | undefined;
  runnerUp?: boolean;
}) {
  return (
    <main
      className={`tv-victory${runnerUp ? " tv-runner-presentation" : ""}`}
      data-level={level}
      data-style={settings.style}
      data-motion={settings.motion}
      aria-label="Match celebration"
    >
      <TvWatermark url={watermark} />
      <div className="victory-halo" aria-hidden="true" />
      <div className="victory-confetti" aria-hidden="true">
        {Array.from({ length: runnerUp ? 20 : level === "final" ? 42 : level === "playoff" ? 26 : 12 }, (_, i) => (
          <i
            key={i}
            style={
              {
                "--x": `${(i * 37) % 100}%`,
                "--delay": `${(i % 9) * -0.35}s`,
                "--turn": `${i * 47}deg`,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <div className="victory-content">
        <p className="victory-kicker">
          <Sparkles />
          {runnerUp ? "An outstanding journey" : level === "final"
            ? "A season to remember"
            : level === "playoff"
              ? "The journey continues"
              : "Match complete"}
          <Sparkles />
        </p>
        <div className="victory-hero">
          <div className="victory-emblem">
            {logo ? <img src={logo} alt="" /> : runnerUp ? <Medal /> : <Trophy />}
            {logo && (runnerUp ? <Medal className="victory-mini-trophy" /> : <Trophy className="victory-mini-trophy" />)}
          </div>
          <div className="victory-identity">
            <p className="victory-title">
              {runnerUp ? "Runners-up" : level === "final" ? "Champions" : "Victory"}
              {tournamentName && (
                <span className="victory-tournament">
                  {level === "final" ? "of " : ""}
                  {tournamentName}
                </span>
              )}
            </p>
            <h1 data-long={name.length > 20}>{name}</h1>
            {result && <p className="victory-result">{result}</p>}
          </div>
        </div>
        {award && (
          <section className="victory-award" aria-label="Man of the Match">
            <Medal />
            <div>
              <p>Man of the Match</p>
              <strong>{award}</strong>
            </div>
          </section>
        )}
        <span className="victory-rule" />
      </div>
    </main>
  );
}
