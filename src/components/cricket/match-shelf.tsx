import { TournamentName } from "./tournament-name";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Radio } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { derive, battingSide, type MatchRow } from "@/lib/cricket/match";
import { formatOvers, type Delivery } from "@/lib/cricket/engine";
import { matchStageTitle } from "@/lib/cricket/match-stage";
import { StatusPill } from "./bits";
import { Button } from "@/components/ui/button";
import { useTvLogos } from "./tv-presentation";

export function splitMatches(matches: MatchRow[]) {
  return {
    live: matches.filter((m) => ["live", "paused", "innings_break"].includes(m.status)),
    upcoming: matches
      .filter((m) => m.status === "scheduled")
      .sort(
        (a, b) =>
          `${a.match_date || "9999"} ${a.scheduled_time || "23:59"}`.localeCompare(
            `${b.match_date || "9999"} ${b.scheduled_time || "23:59"}`,
          ) || a.created_at.localeCompare(b.created_at),
      ),
    recent: matches
      .filter((m) => ["completed", "abandoned", "cancelled"].includes(m.status))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
  };
}

function Preview({ match: m, manage }: { match: MatchRow; manage: boolean }) {
  const logos = useTvLogos(m);
  const { data, isError } = useQuery({
    queryKey: ["match-preview", m.id, m.score_revision],
    queryFn: async () => {
      const balls: Delivery[] = [];
      if (m.status !== "scheduled")
        for (let start = 0; ; start += 1000) {
          const { data, error } = await supabase
            .from("deliveries")
            .select("*")
            .eq("match_id", m.id)
            .order("innings")
            .order("seq")
            .range(start, start + 999);
          if (error) throw error;
          balls.push(...(data as unknown as Delivery[]));
          if (data.length < 1000) break;
        }
      return { d: derive(m, balls) };
    },
    refetchInterval: ["live", "paused", "innings_break"].includes(m.status) ? 5000 : false,
  });
  const first = battingSide(m, 1);
  return (
    <article className="match-preview">
      <Link to="/match/$matchId" params={{ matchId: m.id }} className="block p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="truncate text-xs font-semibold text-primary">{<TournamentName id={m.tournament_id} fallback={m.name}/>}</span>
          <StatusPill status={m.status} />
        </div>
        <div className="mb-5 flex justify-between gap-3 text-xs text-muted-foreground">
          <span>
            {m.match_date || "Date to be confirmed"}
            {m.scheduled_time ? ` · ${m.scheduled_time.slice(0, 5)}` : ""}
          </span>
          <span>{matchStageTitle(m.rules) || "Match"}</span>
        </div>
        <div className="space-y-4">
          {(["A", "B"] as const).map((side) => {
            const name = side === "A" ? m.team_a : m.team_b;
            const id = side === "A" ? m.team_a_id : m.team_b_id;
            const logo = id ? logos[id] : null;
            const state = side === first ? data?.d.first : data?.d.second;
            const started =
              m.status !== "scheduled" &&
              !!first &&
              (side === first || data?.d.innings === 2 || !!state?.batters.length);
            return (
              <div key={side} className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-slate-50 text-sm font-bold text-primary">
                  {logo ? (
                    <img src={logo} alt="" className="h-full w-full object-contain" />
                  ) : (
                    name.slice(0, 1)
                  )}
                </span>
                <span className="min-w-0 flex-1 font-semibold">{name}</span>
                <span className="shrink-0 font-bold tabular-nums">
                  {started && state ? `${state.runs}/${state.wickets}` : "—"}
                  {started && state && (
                    <small className="ml-2 font-normal text-muted-foreground">
                      ({formatOvers(state.legalBalls, m.balls_per_over)})
                    </small>
                  )}
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-5 border-t border-border pt-3 text-sm text-primary">
          {m.status === "scheduled"
            ? "Yet to start"
            : m.status === "abandoned"
              ? "Match abandoned"
              : m.status === "cancelled"
                ? "Match cancelled"
                : isError
                  ? "Score temporarily unavailable"
                  : data?.d.result || (data ? "Match in progress" : "Loading score…")}
        </p>
      </Link>
      {manage && (
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button asChild size="sm" variant="outline">
            <Link to="/match/$matchId" params={{ matchId: m.id }}>
              View
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/score/$matchId" params={{ matchId: m.id }}>
              {m.status === "completed" ? "Open scorer" : "Score match"}
            </Link>
          </Button>
        </div>
      )}
    </article>
  );
}

export function MatchShelf({
  title,
  matches,
  manage = false,
}: {
  title: string;
  matches: MatchRow[];
  manage?: boolean;
}) {
  const [page, setPage] = useState(0);
  const pages = Math.ceil(matches.length / 4),
    current = Math.min(page, Math.max(0, pages - 1));
  return (
    <section aria-label={title} className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xl font-bold">
          {title === "Live Now" && <Radio size={20} className="text-primary" />}
          {title}
        </h2>
        <span className="text-sm text-muted-foreground">{matches.length} matches</span>
      </div>
      {matches.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {matches.slice(current * 4, current * 4 + 4).map((m) => (
            <Preview key={m.id} match={m} manage={manage} />
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-border bg-slate-50/50 p-8 text-center text-sm text-muted-foreground">
          {title === "Live Now"
            ? "No matches are live right now."
            : title === "Upcoming Matches"
              ? "Scheduled matches will appear here."
              : "Finished matches will appear here."}
        </p>
      )}
      {pages > 1 && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="icon"
            className="rounded-full"
            disabled={!current}
            onClick={() => setPage(current - 1)}
            aria-label={`Previous ${title} page`}
          >
            <ChevronLeft size={18} />
          </Button>
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {current + 1} / {pages}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="rounded-full"
            disabled={current === pages - 1}
            onClick={() => setPage(current + 1)}
            aria-label={`Next ${title} page`}
          >
            <ChevronRight size={18} />
          </Button>
        </div>
      )}
    </section>
  );
}
