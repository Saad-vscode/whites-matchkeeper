import { useMemo } from "react";
import { useFeatureAccess, animationFeature } from "@/lib/feature-access";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { Delivery } from "@/lib/cricket/engine";
import type { ConnState, MatchRow } from "@/lib/cricket/match";
import { useAnimationSettings } from "@/lib/cricket/tv-settings";
import { MomentArt } from "./tv-moment-art";
import {
  HIGHLIGHT_DURATION,
  TvHighlightTracker,
  selectHighlight,
  HIGHLIGHTS,
  type TvHighlight,
} from "@/lib/cricket/tv-highlights";
import "./tv-highlight.css";
import { BoundaryArt, TripleSixArt, HatTrickArt, WalkingDuck } from "./tv-broadcast-art";
import { StumpingArt, CaughtArt } from "./tv-dismissal-art";
import { victoryLevel } from "./tv-victory";

export function TvHighlights({
  matchId,
  deliveries,
  conn,
  match,
  suppressed = false,
  onActiveChange,
}: {
  matchId: string;
  deliveries: Delivery[];
  conn: ConnState;
  match?: MatchRow;
  suppressed?: boolean;
  onActiveChange?: (active: boolean) => void;
}) {
  const saved = useAnimationSettings();
  const { access } = useFeatureAccess({ match: matchId });
  const settings = useMemo(() => ({ ...saved, events: Object.fromEntries(Object.entries(saved.events).map(([key, enabled]) => [key, enabled && access[animationFeature(key as keyof typeof saved.events)]])) as typeof saved.events }), [saved, access]);
  const tracker = useRef(new TvHighlightTracker());
  const [queue, setQueue] = useState<TvHighlight[]>([]);
  useEffect(() => {
    setQueue([]);
  }, [matchId]);
  useLayoutEffect(() => {
    const live = conn === "live" && document.visibilityState !== "hidden" && settings.enabled && !suppressed;
    const additions = tracker.current.update(matchId, deliveries, live, match, settings.events);
    if (!live) setQueue(q => q.length ? [] : q);
    else
      setQueue((q) => {
        const valid = q.filter((event) =>
          deliveries.some((ball) => {
            if (ball.id !== event.id) return false;
            const now = selectHighlight(ball, deliveries, match, settings.events);
            return (
              now?.id === event.id &&
              now.kind === event.kind &&
              now.player === event.player &&
              now.team === event.team &&
              now.detail === event.detail
            );
          }),
        );
        return valid.length === q.length && !additions.length ? q : [...valid, ...additions];
      });
  }, [matchId, deliveries, conn, match, settings, suppressed]);
  useEffect(() => {
    const clear = () => {
      if (document.visibilityState === "hidden") {
        tracker.current.update(matchId, deliveries, false);
        setQueue([]);
      }
    };
    document.addEventListener("visibilitychange", clear);
    return () => document.removeEventListener("visibilitychange", clear);
  }, [matchId, deliveries]);
  const current = suppressed ? undefined : queue[0];
  useLayoutEffect(() => { onActiveChange?.(!!current); }, [current, onActiveChange]);
  useEffect(() => () => onActiveChange?.(false), [onActiveChange]);
  useEffect(() => {
    if (!current) return;
    const timer = window.setTimeout(() => setQueue((q) => q.slice(1)), settings.duration);
    return () => window.clearTimeout(timer);
  }, [current, settings.duration]);
  return current ? (
    <TvHighlightScene
      key={current.id}
      event={current}
      duration={settings.duration}
      motion={settings.motion}
      level={match ? victoryLevel(match.rules) : "match"}
    />
  ) : null;
}

/** Original SVG motion graphics: crisp at any display size, no video download. */
export function TvHighlightScene({
  event,
  duration = HIGHLIGHT_DURATION,
  motion = "full",
  level = "match",
}: {
  event: TvHighlight;
  duration?: number;
  motion?: "full" | "reduced";
  level?: "match" | "playoff" | "final";
}) {
  const wicket = event.kind === "wicket";
  const boundary = ["four", "six", "winning_four", "winning_six"].includes(event.kind);
  const dismissed = ["wicket", "stumped", "caught", "run_out", "duck", "golden_duck"].includes(event.kind);
  const bowler = ["wide", "no_ball", "hat_chance", "hat_trick", "maiden"].includes(event.kind);
  return (
    <div
      className={`tv-highlight tv-highlight--${event.kind}`}
      data-motion={motion}
      data-level={level}
      role="status"
      aria-label={`${HIGHLIGHTS[event.kind]} · ${event.player}`}
      style={{ "--highlight-duration": `${duration}ms` } as CSSProperties}
    >
      <div className="broadcast-lights" aria-hidden="true" />
      <div className="tv-highlight-grid" aria-hidden="true" />
      <div className="tv-highlight-sweep" aria-hidden="true" />
      <div className="tv-highlight-brand">
        <b>Crease</b>
        <span>THE MOMENT</span>
      </div>
      <div className="tv-highlight-stage" aria-hidden="true">
        <svg className="tv-highlight-art" viewBox="0 0 1000 560" fill="none">
          <defs>
            <linearGradient id={`metal-${event.kind}`} x1="0" x2="1">
              <stop stopColor="#a37429" />
              <stop offset=".35" stopColor="#fff2bd" />
              <stop offset=".65" stopColor="#eabc60" />
              <stop offset="1" stopColor="#8d641e" />
            </linearGradient>
            <radialGradient id={`ball-${event.kind}`} cx=".3" cy=".25">
              <stop stopColor="#ffb5a4" />
              <stop offset=".3" stopColor="#e85540" />
              <stop offset="1" stopColor="#7e201c" />
            </radialGradient>
          </defs>
          <ellipse cx="500" cy="465" rx="330" ry="35" stroke="currentColor" opacity=".15" />
          {!wicket && !boundary ? (
            event.kind === "stumped" ? <StumpingArt /> :
            event.kind === "caught" ? <CaughtArt /> :
            event.kind === "triple_six" ? <TripleSixArt /> :
            event.kind === "hat_chance" || event.kind === "hat_trick" ? <HatTrickArt chance={event.kind === "hat_chance"} /> :
            event.kind === "duck" || event.kind === "golden_duck" ? <WalkingDuck golden={event.kind === "golden_duck"} /> :
            <MomentArt event={event} />
          ) : wicket ? (
            <>
              <path d="M100 465H900M200 482H800" stroke="currentColor" opacity=".3" />
              <g className="tv-wicket-ball">
                <circle cx="500" cy="330" r="23" fill="url(#ball-wicket)" />
                <path
                  d="M489 309Q512 330 489 351M494 308Q517 330 494 352"
                  stroke="#ffe9dc"
                  strokeWidth="2"
                  strokeDasharray="3 2"
                />
              </g>
              <g className="tv-stumps" fill="url(#metal-wicket)">
                {[456, 490, 524].map((x, i) => (
                  <g
                    key={x}
                    className={`tv-stump tv-stump-${i}`}
                    style={{ transformOrigin: `${x + 9}px 460px` }}
                  >
                    <rect x={x} y="174" width="18" height="286" rx="9" />
                    <path d={`M${x + 4} 200V435`} stroke="#fff" opacity=".4" />
                    <rect x={x} y="216" width="18" height="9" fill="#123a30" />
                    <rect x={x} y="235" width="18" height="5" fill="#123a30" />
                  </g>
                ))}
                <rect
                  className="tv-bail tv-bail-left"
                  x="459"
                  y="163"
                  width="43"
                  height="12"
                  rx="5"
                />
                <rect
                  className="tv-bail tv-bail-right"
                  x="496"
                  y="163"
                  width="43"
                  height="12"
                  rx="5"
                />
              </g>
              <circle
                className="tv-impact-ring"
                cx="500"
                cy="330"
                r="30"
                stroke="currentColor"
                strokeWidth="3"
              />
              <g className="tv-impact-particles">
                {Array.from({ length: 18 }, (_, i) => (
                  <path
                    key={i}
                    d="M500 330l8 -3"
                    stroke={i % 3 === 0 ? "#fff4d4" : "currentColor"}
                    strokeWidth={(i % 2) + 2}
                    style={
                      {
                        "--dx": `${Math.cos(i * 2.4) * (90 + i * 10)}px`,
                        "--dy": `${Math.sin(i * 2.4) * (90 + i * 8)}px`,
                      } as CSSProperties
                    }
                  />
                ))}
              </g>

            </>
          ) : (
            <BoundaryArt event={event} />
          )}
        </svg>
        <div className="tv-highlight-caption">
          <span>{event.detail}</span>
          <strong>{event.kind === "winning_six" ? "SEALED WITH A SIX!" : event.kind === "winning_four" ? "WINNING BOUNDARY!" : event.kind === "triple_six" ? "THREE IN A ROW!" : HIGHLIGHTS[event.kind].toUpperCase()}</strong>
        </div>
      </div>
      <div className="tv-highlight-player">
        <span>{dismissed ? "Batter dismissed" : bowler ? "Bowler" : "At the crease"}</span>
        <strong>{event.player}</strong>
        {event.team && <span>{event.team}</span>}
        <i />
      </div>
      <div className="tv-highlight-progress" aria-hidden="true" />
    </div>
  );
}
