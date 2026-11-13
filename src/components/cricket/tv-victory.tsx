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
}: {
  name: string;
  result: string;
  level: "match" | "playoff" | "final";
  logo?: string | null | undefined;
  watermark?: string | null | undefined;
  award?: string | undefined;
  settings: PresentationSettings;
  tournamentName?: string | undefined;
}) {
  return (
    <main
      className="tv-victory"
      data-level={level}
      data-style={settings.style}
      data-motion={settings.motion}
      aria-label="Match celebration"
    >
      <TvWatermark url={watermark} />
      <div className="victory-halo" aria-hidden="true" />
      <div className="victory-confetti" aria-hidden="true">
        {Array.from({ length: level === "final" ? 42 : level === "playoff" ? 26 : 12 }, (_, i) => (
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
        {watermark && <img className="victory-brand" src={watermark} alt="Tournament logo" />}
        <p className="victory-kicker">
          <Sparkles />
          {level === "final"
            ? "A season to remember"
            : level === "playoff"
              ? "The journey continues"
              : "A moment to celebrate"}
          <Sparkles />
        </p>
        <div className="victory-emblem">
          {logo ? <img src={logo} alt="" /> : <Trophy />}
          {logo && <Trophy className="victory-mini-trophy" />}
        </div>
        <p className="victory-title">
          {level === "final" ? "Champions" : "Victory"}
          {tournamentName && (
            <span className="victory-tournament">
              {level === "final" ? "of " : ""}
              {tournamentName}
            </span>
          )}
        </p>
        <h1>{name}</h1>
        {result && <p className="victory-result">{result}</p>}
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
