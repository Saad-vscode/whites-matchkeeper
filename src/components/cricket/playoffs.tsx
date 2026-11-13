import { useEffect, useRef, useState, type RefObject } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, GitBranch, Pencil, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  makeDraw,
  separateGroupOpponents,
  qualificationGroups,
  resolveDraw,
  type PlayoffContext,
  type PlayoffDraw,
  type Slot,
  type NodeState,
} from "@/lib/cricket/playoffs";
import { playoffError, type usePlayoffs } from "@/lib/cricket/use-playoffs";
import { derive, battingSide } from "@/lib/cricket/match";
import { formatOvers } from "@/lib/cricket/engine";

const selectClass = "h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm";
function BracketConnections({
  graphRef,
  draw,
}: {
  graphRef: RefObject<HTMLDivElement | null>;
  draw: PlayoffDraw;
}) {
  const [paths, setPaths] = useState<{ d: string; loser: boolean }[]>([]);
  const signature = JSON.stringify(draw.nodes);
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const bounds = graph.getBoundingClientRect(),
        cards = new Map(
          Array.from(graph.querySelectorAll<HTMLElement>("[data-bracket-node]")).map((e) => [
            e.dataset["bracketNode"],
            e.getBoundingClientRect(),
          ]),
        );
      const next: { d: string; loser: boolean }[] = [];
      for (const node of draw.nodes)
        for (const slot of [node.a, node.b]) {
          if (!slot || !("from" in slot)) continue;
          const a = cards.get(slot.from),
            b = cards.get(node.id);
          if (!a || !b) continue;
          const x1 = a.right - bounds.left,
            y1 = a.top + a.height / 2 - bounds.top,
            x2 = b.left - bounds.left,
            y2 = b.top + b.height / 2 - bounds.top;
          // Qualifier 1's direct route to the final travels above Qualifier 2.
          const skip = node.round - (draw.nodes.find((n) => n.id === slot.from)?.round ?? 0) > 1;
          const mid = (x1 + x2) / 2;
          next.push({
            loser: slot.result === "loser",
            d: skip
              ? `M${x1},${y1} H${x1 + 18} V5 H${x2 - 18} V${y2} H${x2}`
              : `M${x1},${y1} H${mid} V${y2} H${x2}`,
          });
        }
      setPaths(next);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(graph);
    graph.querySelectorAll("[data-bracket-node]").forEach((e) => observer.observe(e));
    measure();
    return () => observer.disconnect();
  }, [graphRef, signature]);
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      fill="none"
    >
      {paths.map((p, i) => (
        <path
          key={i}
          d={p.d}
          stroke={p.loser ? "#d4a34a" : "#8bc9c1"}
          strokeWidth="1.5"
          strokeDasharray={p.loser ? "5 4" : undefined}
        />
      ))}
    </svg>
  );
}
export function Playoffs({
  query,
  canManage,
}: {
  query: ReturnType<typeof usePlayoffs>;
  canManage: boolean;
}) {
  if (query.isPending) return <p className="p-8 text-sm text-slate-500">Loading playoffs…</p>;
  if (query.isError || !query.data)
    return (
      <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm">
        {canManage
          ? (query.error?.message ?? "Playoffs is unavailable.")
          : "The playoff draw is not available yet. Please try again shortly."}
        <Button variant="outline" className="ml-3" onClick={() => void query.refetch()}>
          Retry
        </Button>
      </div>
    );
  return (
    <PlayoffContent
      key={`${query.data.tournament.id}-${query.data.playoff?.revision ?? 0}`}
      ctx={query.data}
      canManage={canManage}
      syncError={query.syncError}
      retry={query.retrySync}
    />
  );
}
function PlayoffContent({
  ctx,
  canManage,
  syncError,
  retry,
}: {
  ctx: PlayoffContext;
  canManage: boolean;
  syncError: string | null;
  retry: () => void;
}) {
  const qc = useQueryClient(),
    groups = qualificationGroups(ctx);
  const graphRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [counts, setCounts] = useState(() =>
    Object.fromEntries(
      groups.map((g) => [
        g.id,
        ctx.playoff
          ? ctx.playoff.draw.seeds.filter((id) => g.rows.some((r) => r.teamId === id)).length
          : ctx.tournament.competition_format === "knockout"
            ? g.rows.length
            : Math.min(g.rows.length, groups.length === 1 ? 4 : 2),
      ]),
    ),
  );
  const initialSeeds = () =>
    separateGroupOpponents(
      Array.from({ length: Math.max(...Object.values(counts)) }, (_, rank) =>
        groups.flatMap((g) =>
          rank < (counts[g.id] ?? 0) && g.rows[rank] ? [g.rows[rank]!.teamId] : [],
        ),
      ).flat(),
      ctx.groups,
    );
  const [seeds, setSeeds] = useState(() => ctx.playoff?.draw.seeds ?? initialSeeds());
  const [format, setFormat] = useState<"ipl" | "single">(
    () =>
      ctx.playoff?.draw.format ??
      (groups.length === 1 && ctx.tournament.competition_format !== "knockout" && seeds.length === 4
        ? "ipl"
        : "single"),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<{ node: string; team: string; reason: string } | null>(
    null,
  );
  const started = ctx.matches.some(
    (m) =>
      typeof m.rules === "object" &&
      m.rules &&
      !Array.isArray(m.rules) &&
      m.rules["playoffNode"] &&
      (m.status !== "scheduled" ||
        m.toss_winner ||
        ctx.deliveries.some((d) => d.match_id === m.id)),
  );
  const configuring = canManage && (!ctx.playoff || editing);
  let draft: PlayoffDraw | null = null,
    validation: string | null = null;
  try {
    draft = makeDraw(seeds, format);
  } catch (e) {
    validation = (e as Error).message;
  }
  const shown = configuring ? draft : ctx.playoff?.draw;
  const states = shown ? resolveDraw(shown, configuring ? [] : ctx.matches, ctx.deliveries) : [];
  const champion = states.find((s) => s.node.id === "final")?.winner;
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["playoffs", ctx.tournament.id] }),
      qc.invalidateQueries({ queryKey: ["tournament", ctx.tournament.id] }),
    ]);
  };
  const save = async (approve: boolean) => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const r = await supabase.rpc("save_playoff_draw", {
        _t: ctx.tournament.id,
        _draw: draft as unknown as Json,
        _approve: approve,
        _token: ctx.token,
      });
      if (r.error) throw playoffError(r.error);
      setEditing(false);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const decide = async () => {
    if (!decision) return;
    setBusy(true);
    setError(null);
    try {
      const r = await supabase.rpc("decide_playoff_tie", {
        _t: ctx.tournament.id,
        _node: decision.node,
        _team: decision.team,
        _reason: decision.reason,
        _token: ctx.token,
      });
      if (r.error) throw playoffError(r.error);
      setDecision(null);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-teal-700">
            The road to the trophy
          </p>
          <h2 className="flex items-center gap-2 text-2xl font-bold">
            <GitBranch className="text-teal-600" />
            Playoffs
          </h2>
          <p className="mt-2 max-w-xl text-sm text-slate-500">
            {ctx.playoff?.approved
              ? "Follow every round. Winners advance and ready fixtures appear in Matches automatically."
              : ctx.tournament.competition_format === "knockout"
                ? "Review the teams and shape your knockout rounds."
                : "The group stage is complete. Review the qualifiers and shape the final rounds."}
          </p>
        </div>
        {ctx.playoff && (
          <span
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${ctx.playoff.approved ? "bg-teal-50 text-teal-700" : "bg-amber-50 text-amber-800"}`}
          >
            {ctx.playoff.approved ? "Approved draw" : "Draft · awaiting approval"}
          </span>
        )}
      </header>
      {(error || syncError) && (
        <div
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          {error || syncError}
          <Button variant="outline" size="sm" className="ml-3" onClick={retry}>
            Refresh & retry
          </Button>
        </div>
      )}
      {canManage && ctx.playoff && !configuring && !started && (
        <Button variant="outline" onClick={() => setEditing(true)}>
          <Pencil size={16} />
          Edit draw
        </Button>
      )}
      {configuring && (
        <div className="space-y-5 rounded-2xl border border-slate-200 bg-slate-50/60 p-5 sm:p-6">
          <div>
            <h3 className="text-lg font-bold">Build your draw</h3>
            <p className="mt-1 text-sm text-slate-500">
              Choose qualifiers, then arrange the seeds. Higher seeds receive byes when needed. You
              can change the draft before any playoff starts.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((g) => (
              <label key={g.id} className="space-y-2 text-sm font-medium">
                <span className="block">{g.name} · qualifying teams</span>
                <select
                  aria-label={`${g.name} qualifying teams`}
                  className={selectClass}
                  value={counts[g.id]}
                  onChange={(e) => setCounts({ ...counts, [g.id]: Number(e.target.value) })}
                >
                  {Array.from({ length: g.rows.length + 1 }, (_, i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setSeeds(initialSeeds());
              setError(null);
            }}
          >
            Use top teams from standings
          </Button>
          <label className="block max-w-sm space-y-2 text-sm font-medium">
            <span className="block">Playoff format</span>
            <select
              className={selectClass}
              value={format}
              onChange={(e) => setFormat(e.target.value as "ipl" | "single")}
            >
              <option value="single">Knockout · single elimination</option>
              <option value="ipl">IPL · Qualifiers + Eliminator + Final</option>
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            {seeds.map((id, i) => (
              <label key={i} className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-50 text-xs font-bold text-teal-700">
                  {i + 1}
                </span>
                <select
                  aria-label={`Seed ${i + 1}`}
                  className={selectClass}
                  value={id}
                  onChange={(e) => {
                    const next = [...seeds],
                      old = next.indexOf(e.target.value);
                    next[i] = e.target.value;
                    if (old >= 0) next[old] = id;
                    setSeeds(next);
                  }}
                >
                  {ctx.teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            Two-group default: A1 vs B2 and B1 vs A2. For other group counts, review the seeded
            pairings below and swap teams as needed. Equal standings remain subject to organiser
            review.
          </p>
          {validation && (
            <p role="alert" className="text-sm text-red-700">
              {validation}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <Button disabled={busy || !draft} variant="outline" onClick={() => void save(false)}>
              Save draft
            </Button>
            <Button disabled={busy || !draft} onClick={() => void save(true)}>
              <Check size={16} />
              {busy ? "Saving…" : "Approve draw & create fixtures"}
            </Button>
            {ctx.playoff && (
              <Button disabled={busy} variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            )}
          </div>
          {ctx.playoff?.approved && (
            <p className="text-xs text-amber-800">
              Saving changes replaces only the unstarted playoff fixtures. Review their schedules
              after saving.
            </p>
          )}
        </div>
      )}
      {!shown && !canManage && (
        <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center">
          <GitBranch className="mx-auto mb-3 text-teal-600" />
          <h3 className="font-bold">The draw is coming</h3>
          <p className="mt-2 text-sm text-slate-500">The organiser is reviewing the qualifiers.</p>
        </div>
      )}
      {states.length > 0 && (
        <div
          className="overflow-x-auto rounded-2xl border border-slate-200 bg-gradient-to-br from-teal-50/60 via-white to-white p-5 sm:p-6"
          aria-label="Playoff bracket"
        >
          <div ref={graphRef} className="relative flex min-w-max items-stretch gap-12 pt-4">
            {shown && <BracketConnections graphRef={graphRef} draw={shown} />}
            {[...new Set(states.map((s) => s.node.round))].map((round) => (
              <div key={round} className="flex w-[260px] flex-col">
                <h3 className="mb-5 border-b border-teal-100 pb-3 text-xs font-bold uppercase tracking-wider text-teal-700">
                  {states.filter((s) => s.node.round === round).length === 1 &&
                  states.find((s) => s.node.round === round)?.node.title === "Final"
                    ? "The final"
                    : `Round ${round}`}
                </h3>
                <div className="flex flex-1 flex-col justify-around gap-5">
                  {states
                    .filter((s) => s.node.round === round)
                    .map((s) => (
                      <BracketCard
                        key={s.node.id}
                        state={s}
                        ctx={ctx}
                        draw={shown!}
                        canDecide={canManage && !configuring}
                        onDecide={() =>
                          setDecision({ node: s.node.id, team: s.a ?? "", reason: "" })
                        }
                      />
                    ))}
                </div>
              </div>
            ))}
            {champion && (
              <div className="flex w-48 flex-col justify-center text-center">
                <div className="mx-auto rounded-full bg-amber-50 p-5">
                  <Trophy size={38} className="text-amber-600" />
                </div>
                <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-amber-700">
                  Champions
                </p>
                <strong className="mt-2 break-words text-xl">
                  {ctx.teams.find((t) => t.id === champion)?.name}
                </strong>
              </div>
            )}
          </div>
        </div>
      )}
      {states.length > 0 && (
        <p className="text-xs text-slate-500">
          Swipe horizontally to follow the draw on smaller screens. A bye advances a team without
          creating a match.
        </p>
      )}
      {decision && (
        <section className="space-y-4 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h3 className="font-bold">Resolve a tied or abandoned match</h3>
          <p className="text-sm">
            Record the team advancing under your tournament rules. This does not change the match
            score.
          </p>
          <select
            aria-label="Advancing team"
            className={selectClass}
            value={decision.team}
            onChange={(e) => setDecision({ ...decision, team: e.target.value })}
          >
            {[
              states.find((s) => s.node.id === decision.node)?.a,
              states.find((s) => s.node.id === decision.node)?.b,
            ]
              .filter(Boolean)
              .map((id) => (
                <option key={id} value={id!}>
                  {ctx.teams.find((t) => t.id === id)?.name}
                </option>
              ))}
          </select>
          <Input
            aria-label="Decision reason"
            placeholder="Reason, e.g. won the tie-break match"
            value={decision.reason}
            onChange={(e) => setDecision({ ...decision, reason: e.target.value })}
          />
          <div className="flex gap-3">
            <Button
              disabled={busy || decision.reason.trim().length < 5}
              onClick={() => void decide()}
            >
              Confirm advancing team
            </Button>
            <Button variant="outline" onClick={() => setDecision(null)}>
              Cancel
            </Button>
          </div>
        </section>
      )}
    </section>
  );
}
function BracketCard({
  state: s,
  ctx,
  draw,
  canDecide,
  onDecide,
}: {
  state: NodeState;
  ctx: PlayoffContext;
  draw: PlayoffDraw;
  canDecide: boolean;
  onDecide: () => void;
}) {
  const slotName = (slot: Slot) =>
    !slot
      ? "Bye"
      : "team" in slot
        ? (ctx.teams.find((t) => t.id === slot.team)?.name ?? "Team")
        : `${slot.result === "winner" ? "Winner" : "Loser"} · ${draw.nodes.find((n) => n.id === slot.from)?.title ?? slot.from}`;
  const scores = s.match
    ? derive(
        s.match,
        ctx.deliveries.filter((d) => d.match_id === s.match!.id),
      )
    : null;
  return (
    <article
      data-bracket-node={s.node.id}
      className={`relative rounded-xl border bg-white shadow-sm ${s.winner ? "border-teal-200" : "border-slate-200"}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <h4 className="text-xs font-bold">{s.node.title}</h4>
        <span
          className={`text-[10px] font-semibold uppercase tracking-wider ${s.status === "live" ? "text-red-600" : "text-teal-700"}`}
        >
          {s.status === "decision" ? "Decision needed" : s.status}
        </span>
      </div>
      {[
        { id: s.a, slot: s.node.a, side: "A" as const },
        { id: s.b, slot: s.node.b, side: "B" as const },
      ].map(({ id, slot, side }, i) => {
        const team = ctx.teams.find((t) => t.id === id),
          won = !!id && s.winner === id;
        const innings =
          s.match && scores
            ? battingSide(s.match, 1) === side
              ? scores.first
              : scores.second
            : null;
        return (
          <div
            key={i}
            className={`flex min-h-16 items-center gap-2 px-4 py-3 ${won ? "bg-teal-50/70" : ""}`}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-slate-50 text-xs font-bold text-teal-700">
              {team?.logo_url ? (
                <img src={team.logo_url} alt="" className="h-full w-full object-contain" />
              ) : (
                (team?.name.slice(0, 1) ?? "—")
              )}
            </div>
            <span
              className={`min-w-0 flex-1 break-words text-sm ${won ? "font-bold text-teal-800" : team ? "font-medium" : "text-slate-400"}`}
            >
              {team?.name ?? slotName(slot)}
            </span>
            {innings && innings.batters.length > 0 && (
              <span className="text-right text-sm font-bold tabular-nums">
                {innings.runs}/{innings.wickets}
                <small className="block text-[10px] font-normal text-slate-400">
                  {formatOvers(innings.legalBalls, s.match!.balls_per_over)}
                </small>
              </span>
            )}
            {won && <Check size={14} className="text-teal-600" />}
          </div>
        );
      })}
      <div className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
        {s.match ? (
          <Link
            to="/match/$matchId"
            params={{ matchId: s.match.id }}
            className="flex items-center justify-between text-teal-700"
          >
            View match
            <ArrowRight size={13} />
          </Link>
        ) : s.status === "bye" ? (
          "Advances with a bye"
        ) : s.status === "ready" ? (
          "Fixture will be created after approval"
        ) : (
          "Waiting for the previous round"
        )}
      </div>
      {(s.status === "decision" || !!draw.decisions[s.node.id]) && canDecide && (
        <Button size="sm" variant="outline" className="m-3 mt-0" onClick={onDecide}>
          {draw.decisions[s.node.id] ? "Review advancing team" : "Choose advancing team"}
        </Button>
      )}
    </article>
  );
}
