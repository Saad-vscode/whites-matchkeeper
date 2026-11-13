import { tvTournamentName } from "@/lib/cricket/tv-tournament-name";
import { useEffect, useMemo, useState } from "react";
import { Check, Trophy, ArrowRight } from "lucide-react";
import {
  resolveDraw,
  type PlayoffContext,
  type NodeState,
  type Slot,
} from "@/lib/cricket/playoffs";
import { tvBracketSlides } from "@/lib/cricket/tv-playoffs";
import { derive, battingSide } from "@/lib/cricket/match";
import { formatOvers } from "@/lib/cricket/engine";
import { TvWatermark } from "./tv-presentation";
import "./tv-playoffs.css";

export function TvPlayoffs({
  ctx,
  logo,
  forceDraw = false,
}: {
  ctx: PlayoffContext;
  logo?: string | null;
  forceDraw?: boolean;
}) {
  const states = useMemo(
    () => (ctx.playoff ? resolveDraw(ctx.playoff.draw, ctx.matches, ctx.deliveries) : []),
    [ctx],
  );
  const slides = useMemo(() => tvBracketSlides(states), [states]);
  const final = states.find((s) => s.node.id === "final"),
    champion = final?.winner;
  const next = states.find((s) => ["ready", "scheduled", "live"].includes(s.status));
  const initial = Math.max(
    0,
    slides.findIndex((s) => s.nodes.some((n) => n.node.id === next?.node.id)),
  );
  const [index, setIndex] = useState(initial);
  const roundKey = slides.map((s) => s.nodes.map((n) => n.node.id).join()).join("|");
  useEffect(() => {
    setIndex(initial);
  }, [initial, roundKey]);
  useEffect(() => {
    if (slides.length < 2) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % slides.length), 8000);
    return () => window.clearInterval(timer);
  }, [slides.length]);
  const team = (id: string | null | undefined) => ctx.teams.find((t) => t.id === id);
  if (champion && !forceDraw) {
    const winner = team(champion),
      runner = team(final?.loser);
    return (
      <main className="tv-champions" aria-label="Tournament champions">
        <TvWatermark url={logo} />
        <div className="tv-crown-rays" aria-hidden="true" />
        <p className="tv-draw-eyebrow">The journey. The moment. The champions.</p>
        <Trophy className="tv-champions-trophy" aria-hidden="true" />
        {winner?.logo_url && <img className="tv-champion-logo" src={winner.logo_url} alt="" />}
        <h1>{winner?.name ?? "Champions"}</h1>
        <p className="tv-champions-title">Champions</p>
        <p className="tv-champions-event">{tvTournamentName(ctx.tournament)}</p>
        {runner && (
          <p className="tv-runner">
            Runners-up <strong>{runner.name}</strong>
          </p>
        )}
      </main>
    );
  }
  const slide = slides[index % Math.max(1, slides.length)];
  if (!slide) return null;
  const title = slide.nodes[0]!.node.title;
  const label =
    slide.round===0 && slide.nodes.length>1 ? "The playoff draw" : slide.nodes.length === 1
      ? title
      : ctx.playoff?.draw.format === "ipl"
        ? "Qualifying round"
        : title.startsWith("Round of")
          ? title.split(" · ")[0]
          : title.replace(/ \d+$/, "s");
  const slotName = (slot: Slot) =>
    !slot
      ? "Bye"
      : "team" in slot
        ? (team(slot.team)?.name ?? "Team")
        : `${slot.result === "winner" ? "Winner" : "Loser"} · ${ctx.playoff?.draw.nodes.find((n) => n.id === slot.from)?.title ?? slot.from}`;
  return (
    <main className="tv-draw" aria-label="Playoff draw">
      <TvWatermark url={logo} />
      <header className="tv-draw-heading">
        <div>
          <p className="tv-draw-eyebrow">Road to the trophy</p>
          <h1>{label}</h1>
        </div>
        <div className="tv-draw-round">
          <Trophy aria-hidden="true" />
          <span>Playoffs</span>
          {slide.parts > 1 && (
            <small>
              {slide.part} / {slide.parts}
            </small>
          )}
        </div>
      </header>
      {slide.round===0 && slide.nodes.length>1 ? <div className="tv-draw-tree" style={{gridTemplateColumns:`repeat(${new Set(states.map(s=>s.node.round)).size},minmax(0,1fr))`}}>
        {[...new Set(states.map(s=>s.node.round))].map(round=><div className="tv-draw-tree-column" key={round} data-pair={states.filter(s=>s.node.round===round).length===2}>
          {states.filter(s=>s.node.round===round).map(s=><DrawFixture key={s.node.id} state={s} ctx={ctx} next={s.node.id===next?.node.id} slotName={slotName}/>)}
        </div>)}
      </div> : <div
        className="tv-draw-fixtures"
        data-count={slide.nodes.length}
        key={`${slide.round}-${slide.part}`}
      >
        {slide.nodes.map((s) => (
          <DrawFixture
            key={s.node.id}
            state={s}
            ctx={ctx}
            next={s.node.id === next?.node.id}
            slotName={slotName}
          />
        ))}
      </div>}
      <nav className="tv-draw-path" aria-label="Playoff rounds">
        {[...new Set(states.map((s) => s.node.round))].map((round, i) => (
          <span key={round} data-active={slide.round===0 || round === slide.round}>
            {i > 0 && <ArrowRight aria-hidden="true" />}
            {states.filter((s) => s.node.round === round).length === 1
              ? states.find((s) => s.node.round === round)!.node.title
              : `Round ${round}`}
          </span>
        ))}
      </nav>
      <p className="tv-draw-note">
        {champion
          ? `Champions · ${team(champion)?.name}`
          : next
            ? `Up next · ${team(next.a)?.name ?? slotName(next.node.a)} vs ${team(next.b)?.name ?? slotName(next.node.b)}`
            : "Waiting for confirmed results"}
        <span>
          {(index % slides.length) + 1} / {slides.length}
        </span>
      </p>
    </main>
  );
}
function DrawFixture({
  state: s,
  ctx,
  next,
  slotName,
}: {
  state: NodeState;
  ctx: PlayoffContext;
  next: boolean;
  slotName: (slot: Slot) => string;
}) {
  const score = s.match
    ? derive(
        s.match,
        ctx.deliveries.filter((d) => d.match_id === s.match!.id),
      )
    : null;
  return (
    <article className="tv-draw-card" data-next={next}>
      <header>
        <strong>{s.node.title}</strong>
        <span>
          {s.status === "completed"
            ? "Full time"
            : s.status === "bye"
              ? "Bye"
              : s.status === "decision"
                ? "Decision pending"
                : s.status === "conflict"
                  ? "Under review"
                  : s.status === "live" ? "Live" : next
                    ? "Up next"
                    : "To be decided"}
        </span>
      </header>
      {[
        { id: s.a, slot: s.node.a, side: "A" },
        { id: s.b, slot: s.node.b, side: "B" },
      ].map(({ id, slot, side }, i) => {
        const team = ctx.teams.find((t) => t.id === id),
          won = !!id && id === s.winner;
        const innings =
          score && s.match ? (battingSide(s.match, 1) === side ? score.first : score.second) : null;
        return (
          <div className="tv-draw-team" data-winner={won} key={i}>
            <div className="tv-draw-logo">
              {team?.logo_url ? (
                <img src={team.logo_url} alt="" />
              ) : (
                (team?.name.slice(0, 1) ?? "—")
              )}
            </div>
            <strong>{team?.name ?? slotName(slot)}</strong>
            {innings && innings.batters.length > 0 && (
              <span className="tv-draw-score">
                {innings.runs}/{innings.wickets}
                <small>{formatOvers(innings.legalBalls, s.match!.balls_per_over)} ov</small>
              </span>
            )}
            {won && <Check aria-label="Advances" />}
          </div>
        );
      })}
      <footer>
        {s.winner ? (
          <>
            <Check size={18} />
            {ctx.teams.find((t) => t.id === s.winner)?.name} advances
          </>
        ) : s.node.id === "final" ? (
          <>
            <Trophy size={18} />
            The championship match
          </>
        ) : (
          <>
            <ArrowRight size={18} />{" "}
            {ctx.playoff?.draw.nodes
              .filter((n) =>
                [n.a, n.b].some((slot) => slot && "from" in slot && slot.from === s.node.id),
              )
              .map((n) => n.title)
              .join(" / ") || "Next round"}
          </>
        )}
      </footer>
    </article>
  );
}
