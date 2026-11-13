import { useState, type ReactNode } from "react";
import { ArrowLeft, ChevronRight, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import type { tournamentSummary } from "@/lib/cricket/tournament-summary";
type Summary = ReturnType<typeof tournamentSummary>;
export function TournamentStatistics({
  summary,
  renderCard,
}: {
  summary: Summary;
  renderCard: (stat: Summary["leaders"][number]) => ReactNode;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const board = summary.leaderboards.find((b) => b.id === selected);
  const partnership = summary.partnerships[0];
  return (
    <section>
      {!selected ? (
        <>
          <h2 className="sr-only">Tournament statistics</h2>
          <div className="grid grid-cols-2 gap-5 sm:gap-8 lg:grid-cols-3">
            {summary.leaders.map((stat) => (
              <button
                key={stat.id}
                onClick={() => setSelected(stat.id)}
                className="min-w-0 rounded-[2rem] text-left transition-transform hover:-translate-y-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
                aria-label={`View ${stat.label} rankings`}
              >
                {renderCard(stat)}
              </button>
            ))}
            <button
              onClick={() => setSelected("partnership")}
              className="flex min-h-64 flex-col items-center justify-center rounded-[2rem] border border-slate-100 bg-white px-3 py-7 text-center shadow-sm sm:min-h-72"
              aria-label="View Best Partnership rankings"
            >
              <Users className="mb-5 h-12 w-12 text-teal-600" />
              <strong className="text-4xl font-semibold tabular-nums">
                {partnership?.runs ?? 0}
              </strong>
              <span className="mt-1 text-sm text-muted-foreground">Best Partnership</span>
              <span className="mt-5 break-words font-semibold">
                {partnership?.names.join(" & ") ?? "No partnerships yet"}
              </span>
              <span className="mt-1 text-xs text-muted-foreground">
                {partnership?.team ?? "Awaiting match data"}
              </span>
            </button>
          </div>
          <p className="mt-7 text-center text-xs text-muted-foreground">
            Select a statistic to see the full ranking. Updates from recorded deliveries.
          </p>
        </>
      ) : (
        <>
          <Button variant="ghost" onClick={() => setSelected(null)} className="mb-5">
            <ArrowLeft size={16} /> All statistics
          </Button>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-xl font-bold tracking-tight">
              {board?.label ?? "Best Partnership"}
            </h2>
            <select
              aria-label="Statistic"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="max-w-full rounded-xl border border-input bg-white px-3 py-2 text-sm"
            >
              {summary.leaderboards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
              <option value="partnership">Best Partnership</option>
            </select>
          </div>
          {selected === "average" && (
            <p className="mt-3 text-sm text-muted-foreground">
              Runs divided by dismissals. Players not yet dismissed do not have a ranked average.
            </p>
          )}
          {selected === "mvp" && (
            <>
              <p className="mt-3 text-sm text-muted-foreground">
                The leading MVP becomes Player of the Series when the tournament finishes.
                Live-match points are provisional.
              </p>
              {summary.uncreditedFielding > 0 && (
                <p role="status" className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                  {summary.uncreditedFielding} fielding event(s) need details before their points can be counted.
                  {summary.fieldingIssues.map((issue, i) => <span key={`${issue.matchId}-${issue.innings}-${issue.ball}-${i}`} className="mt-1 block">
                    {issue.match}, innings {issue.innings}, ball {issue.ball}: {issue.reason}.{" "}
                    <Link className="font-semibold underline" to="/score/$matchId" params={{ matchId: issue.matchId }}>Open scorer</Link> to complete the record.
                  </span>)}
                </p>
              )}
              <details className="mt-4 rounded-xl border border-border p-4 text-sm">
                <summary className="cursor-pointer font-semibold">MVP points</summary>
                <div className="mt-3 space-y-2 text-muted-foreground">
                  <p>
                    Run: 1 · Wicket: 15 · Catch: 5 · Direct run-out: 10 · Assisted run-out: 5 per
                    recorded fielder · Stumping: 5.
                  </p>
                  <p>
                    Per innings: at least 5 balls and 10 runs unlock strike-rate bonuses of 3
                    (150–199.99), 5 (200–249.99), or 8 (250+).
                  </p>
                  <p>
                    At least one match-format over unlocks economy bonuses: 8 at 6 or below, 5 above
                    6 through 9. Bonus economy uses runs conceded ÷ legal balls × match balls per over. Series awards require selection beyond the group stage.
                  </p>
                  <p>
                    Ties: points per match, then wickets, then runs. Match squads count as
                    appearances once a delivery is recorded. An exact remaining tie is shared.
                  </p>
                </div>
              </details>
            </>
          )}
          <ol className="mt-6 divide-y divide-border overflow-hidden rounded-2xl border border-border">
            {board?.rows.map(({ player: p, value }, index) => (
              <li
                key={JSON.stringify([p.teamId, p.name])}
                className="flex items-center gap-3 p-4 sm:gap-5 sm:p-5"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-50 text-xs font-semibold text-teal-700">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-words font-semibold">{p.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{p.team}</p>
                  {selected === "mvp" && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Bat {p.battingPoints} · Bowl {p.bowlingPoints} · Field {p.fieldingPoints} ·{" "}
                      {p.matches} match{p.matches === 1 ? "" : "es"}
                    </p>
                  )}
                </div>
                <strong className="text-xl font-semibold tabular-nums text-teal-800">
                  {value}
                </strong>
              </li>
            ))}
            {selected === "partnership" &&
              summary.partnerships.map((p, index) => (
                <li key={p.id} className="p-4 sm:p-5">
                  <Link
                    to="/match/$matchId"
                    params={{ matchId: p.matchId }}
                    className="flex items-center gap-3"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-50 text-xs font-semibold text-teal-700">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-semibold">{p.names.join(" & ")}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {p.team} · {p.balls} legal balls
                      </p>
                    </div>
                    <strong className="text-xl tabular-nums text-teal-800">{p.runs}</strong>
                    <ChevronRight size={16} />
                  </Link>
                </li>
              ))}
          </ol>
          {(board ? board.rows.length === 0 : summary.partnerships.length === 0) && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No qualifying performances yet.
            </p>
          )}
        </>
      )}
    </section>
  );
}
