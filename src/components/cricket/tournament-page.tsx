import { useFeatureAccess } from "@/lib/feature-access";
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  Copy,
  MapPin,
  Pencil,
  Plus,
  Share2,
  Shield,
  Trophy,
  Users,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useTournament } from "@/lib/cricket/use-tournament";
import { tournamentSummary } from "@/lib/cricket/tournament-summary";
import { HonoursControl } from "./honours-control";
import { TournamentStatistics } from "./tournament-statistics";
import { SmartFixtureGenerator } from "./smart-fixture-generator";
import { Playoffs } from "./playoffs";
import { groupRoundFinished, playoffNode } from "@/lib/cricket/playoffs";
import { usePlayoffs } from "@/lib/cricket/use-playoffs";
import { standings } from "@/lib/cricket/tournament";
import { battingSide } from "@/lib/cricket/match";
import { formatOvers, matchResult, maxWickets, normalizeRules } from "@/lib/cricket/engine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusPill, useUser } from "./bits";
import { FixtureEditor, GroupEditor, TeamEditor } from "./tournament-actions";
import { ScheduledMatchEditor } from "./scheduled-match-editor";
import { AssignMatchScorer } from "./assign-match-scorer";
import { countsForPoints, matchStageTitle } from "@/lib/cricket/match-stage";
import { recentTournamentMatches, tournamentHonours } from "@/lib/cricket/tournament-home";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";

type Summary = ReturnType<typeof tournamentSummary>;
type Tab = "home" | "teams" | "matches" | "playoffs" | "points" | "statistics";
const tabs: Tab[] = ["home", "teams", "matches", "playoffs", "points", "statistics"];

function RecentMatches({
  title = "Recent Matches",
  rows,
  teams,
}: {
  title?: string;
  rows: Summary["matches"];
  teams: Tables<"tournament_teams">[];
}) {
  const [api, setApi] = useState<CarouselApi>();
  const [selected, setSelected] = useState(0);
  const [snapCount, setSnapCount] = useState(0);
  useEffect(() => {
    if (!api) return;
    const update = () => { setSelected(api.selectedScrollSnap()); setSnapCount(api.scrollSnapList().length); };
    update();
    api.on("select", update);
    api.on("reInit", update);
    return () => {
      api.off("select", update);
      api.off("reInit", update);
    };
  }, [api]);
  return (
    <section className="tournament-section">
      <h3 className="mb-5 text-sm font-semibold text-muted-foreground">{title}</h3>
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 px-5 py-10 text-center text-sm text-muted-foreground">
          Finished matches will appear here.
        </p>
      ) : (
        <Carousel setApi={setApi} opts={{ align: "start" }} aria-label={title}>
          <CarouselContent className="pb-1">
            {rows.map((row, index) => (
              <CarouselItem className="md:basis-1/2 xl:basis-1/3" key={row.m.id} aria-label={`${index + 1} of ${rows.length}`}>
                <MatchCard
                  row={row}
                  teams={teams}
                  canScore={false}
                  canDelete={false}
                  deleting={false}
                  onDelete={() => {}}
                  onEdit={() => {}}
                />
              </CarouselItem>
            ))}
          </CarouselContent>
          {snapCount > 1 && (
            <div className="mt-4 flex items-center justify-between gap-3">
              <CarouselPrevious
                className="static translate-y-0"
                aria-label={`Previous ${title}`}
              />
              <div className="flex items-center gap-1">
                {snapCount > 8 ? <span className="text-xs text-muted-foreground">{selected + 1} / {snapCount}</span> : Array.from({length: snapCount}, (_, index) => (
                  <button
                    key={index}
                    aria-label={`Show ${title} page ${index + 1}`}
                    aria-current={selected === index ? "true" : undefined}
                    onClick={() => api?.scrollTo(index)}
                    className="flex h-9 w-9 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
                  >
                    <span
                      className={`h-2 rounded-full transition-all ${selected === index ? "w-5 bg-teal-600" : "w-2 bg-slate-200"}`}
                    />
                  </button>
                ))}
              </div>
              <CarouselNext className="static translate-y-0" aria-label={`Next ${title}`} />
            </div>
          )}
        </Carousel>
      )}
    </section>
  );
}

function TournamentHonours({
  awardsAllowed = true,
  honours,
  teams,
  summary,
}: {
  awardsAllowed?: boolean;
  honours: NonNullable<ReturnType<typeof tournamentHonours>>;
  teams: Tables<"tournament_teams">[];
  summary: Summary;
}) {
  return (
    <section className="tournament-section">
      <h3 className="mb-5 text-sm font-semibold text-muted-foreground">Tournament Honours</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { title: "Champions", side: honours.champion },
          { title: "Runner-up", side: honours.runnerUp },
        ].map(({ title, side }, index) => (
          <article
            key={title}
            className={`flex flex-col items-center rounded-2xl border px-4 py-7 text-center ${index === 0 ? "border-teal-100 bg-teal-50/60" : "border-slate-100 bg-slate-50/50"}`}
          >
            <p className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-teal-700">
              {index === 0 && <Trophy size={16} />}
              {title}
            </p>
            <TeamLogo
              team={teams.find((team) => team.id === side.id)}
              name={side.name}
              size="h-20 w-20"
            />
            <p className="mt-4 break-words text-lg font-semibold">{side.name}</p>
          </article>
        ))}
        {awardsAllowed && <article className="flex flex-col items-center rounded-2xl border border-slate-100 bg-slate-50/50 px-4 py-7 text-center">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Player of the Series
          </p>
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-white text-slate-400">
            <UserRound size={36} strokeWidth={1.5} />
          </span>
          <p className="mt-4 text-lg font-semibold">
            {summary.seriesPlayers.map((p) => p.name).join(" & ") || "To be announced"}
          </p>
          {summary.seriesPlayers.map((p) => (
            <p
              key={JSON.stringify([p.teamId, p.name])}
              className="mt-2 text-xs text-muted-foreground"
            >
              {p.team} · {p.points} MVP points
            </p>
          ))}
          {summary.uncreditedFielding > 0 && (
            <p className="mt-2 text-xs text-amber-700">Provisional: fielding details missing</p>
          )}
        </article>}
      </div>
    </section>
  );
}

export function TeamLogo({
  team,
  name,
  size = "h-12 w-12",
}: {
  team?: Tables<"tournament_teams"> | undefined;
  name?: string;
  size?: string;
}) {
  return (
    <span
      className={`${size} flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-100 bg-slate-50`}
    >
      {team?.logo_url ? (
        <img src={team.logo_url} alt="" className="h-full w-full object-contain p-1" />
      ) : (
        <span className="text-sm font-bold" style={{ color: team?.color ?? "#0f766e" }}>
          {(team?.short_name || team?.name || name || "")
            .split(/\s+/)
            .slice(0, 2)
            .map((w) => w[0])
            .join("")
            .toUpperCase() || <Shield className="h-6 w-6" />}
        </span>
      )}
    </span>
  );
}

export function CricketEmpty({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-80 flex-col items-center justify-center px-5 py-14 text-center sm:min-h-96">
      <svg aria-hidden="true" viewBox="0 0 220 160" className="mb-6 h-32 w-44 text-teal-700/70">
        <ellipse cx="110" cy="140" rx="83" ry="10" fill="currentColor" opacity=".06" />
        <circle cx="105" cy="70" r="58" fill="currentColor" opacity=".04" />
        <g
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        >
          <path d="M61 135V82m14 53V82m14 53V82M58 79h34" />
          <path d="m104 115 39-65 19 12-39 65Z" fill="white" />
          <path d="m151 55 19-31 7 4-19 31" />
          <path d="m110 116 12 7" />
          <circle cx="169" cy="122" r="14" fill="white" />
          <path d="M163 110q15 12 5 25" strokeDasharray="2 4" strokeWidth="2" />
          <path d="M42 140h146" strokeWidth="2" />
        </g>
      </svg>
      <h3 className="text-2xl font-bold tracking-tight">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{text}</p>
      {action && (
        <div className="mt-7 w-full max-w-xs [&>button]:h-12 [&>button]:w-full">{action}</div>
      )}
    </div>
  );
}

function StatCard({
  stat,
  compact = false,
}: {
  stat: Summary["leaders"][number];
  compact?: boolean;
}) {
  return (
    <article
      className={
        compact
          ? "px-3 py-6 text-center"
          : "flex min-h-64 flex-col items-center rounded-[2rem] border border-slate-100 bg-white px-3 py-7 text-center shadow-[0_5px_12px_-5px_rgba(15,23,42,0.22)] sm:min-h-72 sm:py-9"
      }
    >
      {!compact && (
        <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-400 sm:h-20 sm:w-20">
          <UserRound className="h-10 w-10" strokeWidth={1.25} aria-hidden="true" />
        </span>
      )}
      {compact && <p className="mb-3 text-sm text-muted-foreground">{stat.label}</p>}
      <p className="text-4xl font-semibold tabular-nums tracking-tight sm:text-5xl">{stat.value}</p>
      {!compact && <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{stat.label}</p>}
      <p className="mt-5 max-w-full break-words text-base font-semibold sm:text-lg">
        {stat.player?.name ?? "No performances yet"}
      </p>
      <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
        {stat.player?.team ?? "Awaiting match data"}
      </p>
    </article>
  );
}

function MatchCard({
  row,
  teams,
  canScore,
  canDelete,
  deleting,
  onDelete,
  onEdit,
}: {
  row: Summary["matches"][number];
  teams: Tables<"tournament_teams">[];
  canScore: boolean;
  canDelete: boolean;
  deleting: boolean;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const { m, derived: d } = row;
  const firstSide = battingSide(m, 1);
  const result = matchResult(
    d.first,
    d.second,
    d.cfg,
    firstSide === "A" ? m.team_a : m.team_b,
    firstSide === "A" ? m.team_b : m.team_a,
  );
  const situation =
    m.status === "abandoned"
      ? "No result — match abandoned"
      : m.status === "cancelled"
        ? "Match cancelled"
        : (result ??
          (d.innings === 2 && d.target
            ? `${d.target - d.second.runs} needed from ${Math.max(0, m.overs * m.balls_per_over - d.second.legalBalls)} balls`
            : m.status === "scheduled"
              ? "Yet to start"
              : "Match in progress"));
  return (
    <article className="rounded-2xl border border-border bg-white shadow-sm">
      <Link
        to="/match/$matchId"
        params={{ matchId: m.id }}
        className="block rounded-2xl p-4 transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 sm:p-5"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {m.match_date || "Date to be confirmed"}
            {m.scheduled_time ? ` · ${m.scheduled_time.slice(0, 5)}` : ""}
            {m.venue ? ` · ${m.venue}` : ""}
          </p>
          <StatusPill status={m.status} />
          {matchStageTitle(m.rules) && (
            <span className="text-xs text-muted-foreground">{matchStageTitle(m.rules)}</span>
          )}
        </div>
        <div className="space-y-3">
          {(["A", "B"] as const).map((side) => {
            const team = teams.find((t) => t.id === (side === "A" ? m.team_a_id : m.team_b_id));
            const state = side === firstSide ? d.first : d.second;
            const started =
              !!firstSide && (side === firstSide || d.innings === 2 || state.batters.length > 0);
            return (
              <div key={side} className="flex items-center gap-3">
                <TeamLogo team={team} name={side === "A" ? m.team_a : m.team_b} size="h-10 w-10" />
                <span className="min-w-0 flex-1 text-sm font-semibold">
                  {side === "A" ? m.team_a : m.team_b}
                </span>
                <span className="text-right">
                  <strong className="text-lg tabular-nums">
                    {started ? `${state.runs}/${state.wickets}` : "—"}
                  </strong>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {started ? `(${formatOvers(state.legalBalls, m.balls_per_over)})` : ""}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-4 border-t border-border pt-3 text-sm font-medium text-teal-700">
          {situation}
        </p>
      </Link>
      {canScore && m.status !== "cancelled" && (
        <div className="border-t border-border px-4 py-3">
          <Button asChild size="sm" variant="outline">
            <Link to="/score/$matchId" params={{ matchId: m.id }}>
              {m.status === "scheduled" ? "Start match" : "Scoring controls"}
            </Link>
          </Button>
        </div>
      )}
      {canDelete && m.status === "scheduled" && (
        <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
          <AssignMatchScorer
            matchId={m.id}
            matchName={`${m.team_a} vs ${m.team_b}`}
            disabled={deleting}
          />
          <Button size="sm" variant="outline" disabled={deleting} onClick={onEdit}>
            Edit
          </Button>
          <Button size="sm" variant="destructive" disabled={deleting} onClick={onDelete}>
            {deleting ? "Deleting…" : "Delete scheduled match"}
          </Button>
        </div>
      )}
    </article>
  );
}

function PointsTable({
  teams,
  summary,
  tournament,
  groupId,
}: {
  teams: Tables<"tournament_teams">[];
  summary: Summary;
  tournament: Tables<"tournaments">;
  groupId?: string;
}) {
  const table = standings(
    teams,
    summary.matches
      .filter((r) => countsForPoints(r.m.rules, groupId))
      .map((r) => ({
        teamA: r.m.team_a_id,
        teamB: r.m.team_b_id,
        outcome: r.outcome,
        noResult: r.noResult,
      })),
    {
      win: tournament.points_win,
      tie: tournament.points_tie,
      loss: tournament.points_loss,
      noResult: tournament.points_no_result ?? 1,
    },
    tournament.balls_per_over,
    tournament.ranking_rule,
  );
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[600px] text-sm">
        <caption className="sr-only">Tournament points table</caption>
        <thead className="bg-slate-50 text-xs text-muted-foreground">
          <tr>
            {["Team", "P", "W", "L", "T", "NR", "PTS", "NRR"].map((h) => (
              <th
                key={h}
                scope="col"
                className={`px-3 py-4 ${h === "Team" ? "text-left" : "text-center"}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.map((r) => (
            <tr key={r.teamId} className="border-t border-border">
              <th scope="row" className="px-3 py-4 text-left font-semibold">
                {r.name}
              </th>
              {[
                r.played,
                r.won,
                r.lost,
                r.tied,
                r.noResult,
                r.points,
                `${r.nrr >= 0 ? "+" : ""}${r.nrr.toFixed(3)}`,
              ].map((v, i) => (
                <td
                  key={i}
                  className={`px-3 py-4 text-center tabular-nums ${i === 5 ? "font-bold text-teal-700" : ""}`}
                >
                  {v}
                </td>
              ))}
            </tr>
          ))}
          {!table.length && (
            <tr>
              <td colSpan={8} className="p-6 text-center text-muted-foreground">
                No teams in this table yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ShareTournament({ tournament }: { tournament: Tables<"tournaments"> }) {
  const [open, setOpen] = useState(false),
    [url, setUrl] = useState(""),
    [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      toast.error("Copy the link from the field below.");
    }
  }
  async function share() {
    try {
      await navigator.share({ title: tournament.name, url });
    } catch (e) {
      if (!(e instanceof Error && e.name === "AbortError"))
        toast.error("Sharing is unavailable. Copy the link instead.");
    }
  }
  return (
    <>
      <button
        type="button"
        className="tournament-icon-action"
        onClick={() => {
          setUrl(new URL(`/t/${tournament.id}`, window.location.origin).href);
          setCopied(false);
          setOpen(true);
        }}
      >
        <span>
          <Share2 size={20} />
        </span>
        Share
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="tournament-page">
          <DialogHeader>
            <DialogTitle>Share {tournament.name}</DialogTitle>
            <DialogDescription>
              Anyone with this link can view the tournament and live scores. No sign-in required.
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label="Public tournament link"
            value={url}
            readOnly
            onFocus={(e) => e.target.select()}
          />
          <div className="flex flex-wrap gap-3">
            <Button onClick={copy}>
              {copied ? <Check /> : <Copy />}
              {copied ? "Copied" : "Copy link"}
            </Button>
            {typeof navigator !== "undefined" && typeof navigator.share === "function" && (
              <Button variant="outline" onClick={share}>
                <Share2 />
                Share via…
              </Button>
            )}
            <Button asChild variant="outline">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`${tournament.name} ${url}`)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                WhatsApp
              </a>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function TournamentPage({
  tournamentId,
  management = false,
}: {
  tournamentId: string;
  management?: boolean;
}) {
  const { user } = useUser();
  const qc = useQueryClient();
  const query = useTournament(tournamentId);
  const { allows } = useFeatureAccess({ tournament: tournamentId });
  const [tab, setTab] = useState<Tab>("home");
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ kind: "team" | "fixture" | "group"; id?: string } | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const ids = (query.data?.matches ?? [])
    .map((m) => m.id)
    .sort()
    .join(",");
  const { data: permissions } = useQuery({
    queryKey: ["tournament-permissions", tournamentId, user?.id, ids],
    enabled: !!user,
    queryFn: async () => {
      const [owner, scoring] = await Promise.all([
        supabase.rpc("is_tournament_owner", { _t: tournamentId }),
        Promise.all(
          (query.data?.matches ?? []).map(async (m) => {
            const r = await supabase.rpc("can_score", { _match: m.id });
            return r.data === true ? m.id : null;
          }),
        ),
      ]);
      if (owner.error) throw owner.error;
      return { owner: owner.data === true, scoreIds: scoring.filter((id): id is string => !!id) };
    },
  });
  const restricted = query.data?.tournament?.platform_disabled || query.data?.tournament?.platform_archived || !!query.data?.tournament?.platform_deleted_at;
  const canManage = !restricted && management && !!user && permissions?.owner === true;
  const showPlayoffs = !!query.data && (groupRoundFinished(query.data) || query.data.matches.some(m=>!!playoffNode(m)) || (query.data.tournament?.competition_format === "knockout" && query.data.teams.length >= 2));
  const playoffs = usePlayoffs(tournamentId, showPlayoffs, !!canManage);
  const summary = useMemo(
    () =>
      tournamentSummary(
        query.data?.matches ?? [],
        query.data?.deliveries ?? [],
        query.data?.teams ?? [],
      ),
    [query.data],
  );
  const reload = async () => {
    await qc.invalidateQueries({ queryKey: ["tournament", tournamentId] });
    await qc.invalidateQueries({ queryKey: ["my-tournaments"] });
    setEditor(null);
  };
  const [deletingMatch, setDeletingMatch] = useState<string | null>(null);
  const [editingMatch, setEditingMatch] = useState<Tables<"matches"> | null>(null);
  async function deleteScheduledMatch(row: Summary["matches"][number]) {
    if (!canManage || deletingMatch || row.m.status !== "scheduled") return;
    if (
      !window.confirm(
        `Delete the scheduled match ${row.m.team_a} vs ${row.m.team_b}? This cannot be undone.`,
      )
    )
      return;
    setDeletingMatch(row.m.id);
    try {
      const { error } = await supabase.rpc("delete_scheduled_match", { _match: row.m.id });
      if (error) {
        if (error.code === "PGRST202")
          throw new Error(
            "Apply the scheduled-match deletion database migration before deleting fixtures.",
          );
        throw error;
      }
      toast.success("Scheduled match deleted");
      await reload();
      await qc.invalidateQueries({ queryKey: ["my-matches"] });
    } catch (error) {
      toast.error(
        error && typeof error === "object" && "message" in error
          ? String(error.message)
          : "Could not delete match.",
      );
    } finally {
      setDeletingMatch(null);
    }
  }
  const changeTab = (value: string) => {
    setEditingMatch(null);
    setTab(value as Tab);
    setEditor(null);
    setSelectedTeam(null);
  };
  const openEditor = (kind: "team" | "fixture" | "group", id?: string) => {
    setEditingMatch(null);
    setTab(kind === "team" ? "teams" : kind === "fixture" ? "matches" : "points");
    setSelectedTeam(null);
    setEditor(id ? { kind, id } : { kind });
  };
  const teamAction = canManage ? (
    <Button onClick={() => openEditor("team")}>
      <Plus />
      Add team
    </Button>
  ) : undefined;
  const fixtureAction = canManage ? (
    <Button onClick={() => openEditor("fixture")}>
      <Plus />
      Start / schedule match
    </Button>
  ) : undefined;
  const groupAction = canManage ? (
    <Button onClick={() => openEditor("group")}>
      <Plus />
      Create new group
    </Button>
  ) : undefined;

  async function remove(kind: "team" | "group", id: string) {
    if (!canManage || deleting) return;
    if (
      kind === "team" &&
      query.data?.matches.some((m) => m.team_a_id === id || m.team_b_id === id)
    ) {
      toast.error(
        "This team has fixtures. Keep it in the tournament to preserve its match history.",
      );
      return;
    }
    if (
      !window.confirm(
        kind === "team"
          ? "Remove this team from the tournament?"
          : "Delete this group? Teams and matches will be kept.",
      )
    )
      return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from(kind === "team" ? "tournament_teams" : "tournament_groups")
        .delete()
        .eq("id", id)
        .eq("tournament_id", tournamentId)
        .select("id")
        .single();
      if (error) throw error;
      setSelectedTeam(null);
      await reload();
    } catch (e) {
      toast.error(
        e && typeof e === "object" && "message" in e ? String(e.message) : "Could not remove item.",
      );
    } finally {
      setDeleting(false);
    }
  }

  if (query.isLoading)
    return (
      <div className="tournament-page min-h-screen p-10 text-center" role="status">
        Loading tournament…
      </div>
    );
  if (!query.data?.tournament)
    return (
      <div className="tournament-page min-h-screen p-10 text-center">
        <h1 className="text-xl font-bold">
          {query.error ? "Could not load tournament" : "Tournament not found"}
        </h1>
        <p className="mt-3 text-muted-foreground">{query.error?.message}</p>
        <Button className="mt-5" onClick={() => query.refetch()}>
          Try again
        </Button>
        <Link to="/" className="ml-4 underline">
          Go home
        </Link>
      </div>
    );
  const { tournament: t, teams, groups, matches } = query.data;
  const selected = teams.find((team) => team.id === selectedTeam);
  const teamList = (home = false) => (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {(home ? teams.slice(0, 6) : teams).map((team) => (
        <button
          key={team.id}
          type="button"
          onClick={() => {
            setTab("teams");
            setSelectedTeam(team.id);
            setEditor(null);
          }}
          className="flex min-h-24 items-center gap-3 rounded-xl border border-border bg-white p-4 text-left transition hover:border-teal-400 hover:shadow-sm"
        >
          <TeamLogo team={team} />
          <span className="min-w-0 flex-1">
            <strong className="block break-words text-sm">{team.name}</strong>
            <span className="mt-1 block text-xs text-muted-foreground">
              {team.players.length} players{team.captain ? ` · Captain: ${team.captain}` : ""}
            </span>
          </span>
          <ChevronRight size={16} className="shrink-0 text-slate-400" />
        </button>
      ))}
    </div>
  );
  const renderMatch = (row: Summary["matches"][number]) => (
    <MatchCard
      key={row.m.id}
      row={row}
      teams={teams}
      canScore={management && !!user && (permissions?.scoreIds.includes(row.m.id) ?? false)}
      canDelete={canManage && !playoffNode(row.m) && !query.data?.deliveries.some((d) => d.match_id === row.m.id)}
      deleting={deletingMatch !== null}
      onDelete={() => void deleteScheduledMatch(row)}
      onEdit={() => {
        setTab("matches");
        setEditor(null);
        setEditingMatch(row.m);
      }}
    />
  );
  const orderedMatches = [...summary.matches].sort(
    (a, b) =>
      Date.parse(a.m.created_at) - Date.parse(b.m.created_at) || a.m.id.localeCompare(b.m.id),
  );
  const honours = tournamentHonours(summary.matches);
  const matchBlocks = new Map<string, { label: string; rows: Summary["matches"] }>(
    groups.map((group) => [group.id, { label: group.name, rows: [] }]),
  );
  for (const row of orderedMatches) {
    const rules = row.m.rules;
    const stage =
      rules && typeof rules === "object" && !Array.isArray(rules) ? rules["tournamentStage"] : null;
    const metadata = stage && typeof stage === "object" && !Array.isArray(stage) ? stage : null;
    const isGroup = metadata?.["kind"] === "group";
    const key =
      isGroup && typeof metadata?.["groupId"] === "string"
        ? metadata["groupId"]
        : isGroup
          ? "unassigned-group"
          : "other-matches";
    if (!matchBlocks.has(key)) {
      matchBlocks.set(key, {
        label: isGroup
          ? typeof metadata?.["title"] === "string"
            ? metadata["title"]
            : "Unassigned group"
          : "Other Matches",
        rows: [],
      });
    }
    matchBlocks.get(key)!.rows.push(row);
  }
  const showGroupBlocks = [...matchBlocks.keys()].some(
    (key) => key !== "other-matches" && matchBlocks.get(key)!.rows.length > 0,
  );
  const recentMatches = recentTournamentMatches(summary.matches);
  return (
    <div className="tournament-page min-h-screen bg-white text-slate-900">
      <div className="mx-auto max-w-5xl border-x border-slate-100">
        {restricted && <div role="status" className="border-b border-border bg-muted p-4 text-sm text-foreground">This tournament is {query.data?.tournament?.platform_archived ? 'archived' : 'disabled'} and read-only. Scoring and changes are paused by platform administration. Existing results are preserved.</div>}
        <header className="relative flex h-20 items-center justify-center border-b border-slate-100 px-16">
          <Link
            to={management ? "/dashboard" : "/"}
            aria-label="Back"
            className="absolute left-4 rounded-full p-2 hover:bg-slate-50"
          >
            <ArrowLeft size={24} />
          </Link>
          <h1 className="truncate text-xl font-bold tracking-tight">Tournament</h1>
        </header>
        <Tabs value={tab} onValueChange={changeTab}>
          <div className="sticky top-0 z-10 overflow-x-auto border-b border-slate-100 bg-white/95 px-4 backdrop-blur sm:px-8">
            <TabsList className="flex h-16 w-full min-w-[490px] justify-between gap-4 rounded-none bg-transparent p-0">
              {tabs.filter(id=>id!=="playoffs"||showPlayoffs).map((id) => (
                <TabsTrigger
                  key={id}
                  value={id}
                  className="h-full flex-1 rounded-none border-b-2 border-transparent px-1 text-xs font-medium uppercase tracking-wide text-slate-500 shadow-none data-[state=active]:border-slate-900 data-[state=active]:bg-transparent data-[state=active]:text-slate-900 data-[state=active]:shadow-none sm:text-sm"
                >
                  {id}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {query.isError && (
            <p role="alert" className="mx-5 mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              Updates are temporarily unavailable. Showing the last loaded data.
            </p>
          )}
          {management && query.data.schemaPending && (
            <p role="alert" className="mx-5 mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              Tournament upgrades are awaiting the database migration. Existing scores remain
              available.
            </p>
          )}
          <TabsContent value="home" className="m-0">
            <div
              className="flex h-52 items-center justify-center border-b border-slate-100 bg-gradient-to-br from-slate-50 via-white to-teal-50/40 p-6 sm:h-72"
              style={{ borderTop: `3px solid ${t.accent_color}` }}
            >
              {t.logo_url ? (
                <img
                  src={t.logo_url}
                  alt={`${t.name} logo`}
                  className="h-full max-h-full w-full max-w-lg object-contain"
                />
              ) : (
                <div className="text-center">
                  <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-white shadow-sm">
                    <Trophy
                      className="h-12 w-12"
                      style={{ color: t.primary_color }}
                      strokeWidth={1.3}
                    />
                  </div>
                  <p className="mt-4 text-xs font-semibold uppercase tracking-[.25em] text-slate-400">
                    {t.short_name || "Cricket tournament"}
                  </p>
                </div>
              )}
            </div>
            <section className="tournament-section flex flex-wrap items-start justify-between gap-5">
              <div className="min-w-0 flex-1">
                <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{t.name}</h2>
                {t.location && (
                  <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin size={15} />
                    {t.location}
                  </p>
                )}
                {(t.start_date || t.end_date) && (
                  <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                    <CalendarDays size={15} />
                    {t.start_date ?? ""}
                    {t.end_date ? `${t.start_date ? " – " : "Ends "}${t.end_date}` : ""}
                  </p>
                )}
                <p className="mt-2 break-all text-xs text-muted-foreground">
                  Tournament ID: {t.id}
                </p>
                <p className="mt-3 text-xs font-medium uppercase tracking-wide text-teal-700">
                  {t.competition_format ?? "league"} · {t.overs} overs · {t.players_per_team} a side ·{" "}
                  {maxWickets({
                    overs: t.overs,
                    ballsPerOver: t.balls_per_over,
                    playersPerTeam: t.players_per_team,
                    rules: normalizeRules(t.rules),
                  })} wickets
                </p>
              </div>
              <div className="flex gap-5">
                <ShareTournament tournament={t} />
                {canManage && (
                  <Link
                    className="tournament-icon-action"
                    to="/tournaments/$tournamentId/edit"
                    params={{ tournamentId: t.id }}
                  >
                    <span>
                      <Pencil size={20} />
                    </span>
                    Edit
                  </Link>
                )}
              </div>
              {t.description && (
                <p className="w-full whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {t.description}
                </p>
              )}
            </section>
            {canManage && (
              <div className="grid grid-cols-2 gap-px bg-white py-3">
                <Button
                  className="h-auto min-h-16 whitespace-normal rounded-none px-3 text-xs font-semibold uppercase tracking-wide sm:text-sm"
                  onClick={() => openEditor("fixture")}
                >
                  Start / schedule match
                </Button>
                <Button
                  className="h-auto min-h-16 whitespace-normal rounded-none px-3 text-xs font-semibold uppercase tracking-wide sm:text-sm"
                  onClick={() => openEditor("group")}
                >
                  Create group
                </Button>
              </div>
            )}
            {honours && !!user && (permissions?.owner || !!permissions?.scoreIds.length) && <HonoursControl id={t.id}/>}
            {honours ? (
              <TournamentHonours awardsAllowed={allows("awards")} honours={honours} teams={teams} summary={summary} />
            ) : (
              <section className="tournament-section">
                <div className="mb-5 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-muted-foreground">Teams</h3>
                  {teams.length > 0 && (
                    <button
                      onClick={() => changeTab("teams")}
                      className="text-xs font-semibold text-teal-700"
                    >
                      View all ({teams.length})
                    </button>
                  )}
                </div>
                {teams.length ? (
                  teamList(true)
                ) : (
                  <div className="flex min-h-36 flex-col items-center justify-center gap-5 py-6 text-center">
                    <p className="text-muted-foreground">
                      {canManage ? "Add teams to the tournament to start a match." : "No Teams"}
                    </p>
                    {teamAction}
                  </div>
                )}
              </section>
            )}
            <section className="tournament-section">
              <h3 className="text-sm font-semibold text-muted-foreground">Top Players</h3>
              <div className="grid grid-cols-2">
                {summary.leaders.slice(0, 2).map((stat) => (
                  <StatCard key={stat.label} stat={stat} compact />
                ))}
              </div>
            </section>
            <section className="tournament-section">
              <h3 className="text-sm font-semibold text-muted-foreground">Tournament Boundaries</h3>
              <div className="grid grid-cols-2 py-7 text-center">
                {[
                  ["Sixes", summary.sixes],
                  ["Fours", summary.fours],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-sm text-muted-foreground">{label}</p>
                    <p className="mt-4 text-5xl font-semibold tabular-nums">{value}</p>
                  </div>
                ))}
              </div>
            </section>
            {summary.matches.some(row => row.m.status === "scheduled") && <RecentMatches title="Upcoming Matches" rows={summary.matches.filter(row => row.m.status === "scheduled").sort((a,b) => a.m.created_at.localeCompare(b.m.created_at))} teams={teams} />}
            <RecentMatches rows={recentMatches} teams={teams} />
          </TabsContent>
          <TabsContent value="teams" className="m-0 p-5 sm:p-8">
            {editor?.kind === "team" && canManage && user ? (
              <TeamEditor
                key={editor.id ?? "new"}
                tournamentId={t.id}
                userId={user.id}
                team={teams.find((team) => team.id === editor.id)}
                onDone={reload}
                onCancel={() => setEditor(null)}
              />
            ) : selected ? (
              <section className="space-y-7">
                <Button variant="ghost" onClick={() => setSelectedTeam(null)}>
                  <ArrowLeft />
                  Back to teams
                </Button>
                <div className="flex flex-wrap items-center gap-4">
                  <TeamLogo team={selected} size="h-20 w-20" />
                  <div className="flex-1">
                    <h2 className="text-2xl font-bold">{selected.name}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {selected.players.length} registered players
                      {selected.captain ? ` · Captain: ${selected.captain}` : ""}
                    </p>
                  </div>
                  {canManage && (
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => openEditor("team", selected.id)}>
                        <Pencil />
                        Edit team
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={deleting}
                        onClick={() => remove("team", selected.id)}
                      >
                        Remove
                      </Button>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3 rounded-xl bg-slate-50 p-5 text-center">
                  {[
                    [
                      "Played",
                      summary.matches.filter(
                        (r) =>
                          (r.outcome || r.noResult) &&
                          [r.m.team_a_id, r.m.team_b_id].includes(selected.id),
                      ).length,
                    ],
                    [
                      "Wins",
                      summary.matches.filter(
                        (r) =>
                          r.outcome &&
                          ((r.outcome.winner === "A" && r.m.team_a_id === selected.id) ||
                            (r.outcome.winner === "B" && r.m.team_b_id === selected.id)),
                      ).length,
                    ],
                    [
                      "Runs",
                      summary.players
                        .filter((p) => p.teamId === selected.id)
                        .reduce((sum, p) => sum + p.runs, 0),
                    ],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <strong className="text-2xl tabular-nums">{value}</strong>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {label === "Runs" ? "Batting runs" : label}
                      </p>
                    </div>
                  ))}
                </div>
                <section>
                  <h3 className="mb-4 font-semibold">Squad</h3>
                  {selected.players.length ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {selected.players.map((p, i) => (
                        <div
                          key={`${p}-${i}`}
                          className="flex items-center gap-3 rounded-lg border p-3"
                        >
                          <UserRound className="text-slate-400" size={20} />
                          <span className="text-sm">{p}</span>
                          {selected.captain === p && (
                            <span className="ml-auto rounded bg-teal-50 px-2 py-1 text-xs text-teal-700">
                              Captain
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No players registered yet.</p>
                  )}
                </section>
                <section>
                  <h3 className="mb-4 font-semibold">Match history</h3>
                  <div className="space-y-3">
                    {orderedMatches
                      .filter((r) => [r.m.team_a_id, r.m.team_b_id].includes(selected.id))
                      .map(renderMatch)}
                  </div>
                  {!orderedMatches.some((r) =>
                    [r.m.team_a_id, r.m.team_b_id].includes(selected.id),
                  ) && (
                    <p className="text-sm text-muted-foreground">No fixtures for this team yet.</p>
                  )}
                </section>
              </section>
            ) : teams.length ? (
              <>
                <div className="mb-6 flex items-center justify-between gap-3">
                  <h2 className="text-xl font-bold">Teams ({teams.length})</h2>
                  {teamAction}
                </div>
                {teamList()}
              </>
            ) : (
              <CricketEmpty
                title="No Teams"
                text={
                  canManage
                    ? "Create a team or bring a squad from your existing tournaments."
                    : "Participating teams will appear here once announced."
                }
                action={teamAction}
              />
            )}
          </TabsContent>
          <TabsContent value="matches" className="m-0 p-5 sm:p-8">
            {canManage && allows("fixtures") && (
              <div className="mb-6 flex flex-wrap items-center gap-3">
                <Button
                  variant="outline"
                  disabled={
                    !groups.some(
                      (g) =>
                        g.team_ids.filter((id) => teams.some((team) => team.id === id)).length >= 2,
                    )
                  }
                  onClick={() => {
                    setGeneratorOpen(true);
                    setEditor(null);
                    setEditingMatch(null);
                  }}
                >
                  Generate Fixtures
                </Button>
                {!groups.some(
                  (g) =>
                    g.team_ids.filter((id) => teams.some((team) => team.id === id)).length >= 2,
                ) && (
                  <p className="text-sm text-muted-foreground">
                    Create a group and assign at least two teams to enable the generator.
                  </p>
                )}
              </div>
            )}
            {generatorOpen && allows("fixtures") && canManage && (
              <SmartFixtureGenerator
                tournament={t}
                teams={teams}
                groups={groups}
                matches={matches}
                onDone={reload}
                onCancel={() => setGeneratorOpen(false)}
              />
            )}
            {editingMatch && canManage && (
              <div className="mb-8">
                <ScheduledMatchEditor
                  key={editingMatch.id}
                  match={editingMatch}
                  onCancel={() => setEditingMatch(null)}
                  onDone={async () => {
                    await reload();
                    setEditingMatch(null);
                  }}
                />
              </div>
            )}
            {editor?.kind === "fixture" && canManage && user && (
              <div className="mb-8">
                <FixtureEditor
                  tournament={t}
                  groups={groups}
                  teams={teams}
                  userId={user.id}
                  onDone={reload}
                  onCancel={() => setEditor(null)}
                />
              </div>
            )}
            {!orderedMatches.length && editor?.kind !== "fixture" ? (
              <CricketEmpty
                title="No Matches"
                text={
                  canManage
                    ? "Start a match or create a fixture in this tournament."
                    : "Match schedules and live scores will appear here."
                }
                action={fixtureAction}
              />
            ) : (
              <>
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-xl font-bold">Matches</h2>
                  {editor?.kind !== "fixture" && fixtureAction}
                </div>
                {[...matchBlocks.entries()]
                  .filter(([, block]) => block.rows.length > 0)
                  .map(([key, block]) => (
                    <section
                      key={key}
                      aria-label={block.label}
                      className={
                        showGroupBlocks
                          ? "mb-8 overflow-hidden rounded-2xl border border-border bg-slate-50/40"
                          : ""
                      }
                    >
                      {showGroupBlocks && (
                        <header className="flex items-center justify-between gap-3 border-b border-border bg-teal-50/70 px-4 py-4 sm:px-5">
                          <h3 className="text-base font-bold tracking-tight text-teal-900">
                            {block.label}
                          </h3>
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-teal-800">
                            {block.rows.length} match{block.rows.length === 1 ? "" : "es"}
                          </span>
                        </header>
                      )}
                      <div className={showGroupBlocks ? "p-4 sm:p-5" : ""}>
                        {[
                          ["LIVE", ["live", "paused", "innings_break"]],
                          ["UPCOMING", ["scheduled"]],
                          ["COMPLETED", ["completed", "abandoned", "cancelled"]],
                        ].map(([label, statuses]) => {
                          const rows = block.rows.filter((r) =>
                            (statuses as string[]).includes(r.m.status),
                          );
                          if (!rows.length) return null;
                          return (
                            <section key={String(label)} className="mb-6 last:mb-0">
                              <h4 className="mb-4 flex items-center gap-2 text-xs font-bold tracking-widest text-muted-foreground">
                                {label === "LIVE" && (
                                  <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                                )}
                                {label}
                              </h4>
                              <div className="grid gap-4 md:grid-cols-2">
                                {rows.map(renderMatch)}
                              </div>
                            </section>
                          );
                        })}
                      </div>
                    </section>
                  ))}
              </>
            )}
          </TabsContent>
          <TabsContent value="playoffs" className="m-0 p-5 sm:p-8">
            {showPlayoffs && <Playoffs query={playoffs} canManage={!!canManage} />}
          </TabsContent>
          <TabsContent value="points" className="m-0 p-5 sm:p-8">
            {editor?.kind === "group" && canManage && (
              <div className="mb-8">
                <GroupEditor
                  key={editor.id ?? "new"}
                  tournamentId={t.id}
                  teams={teams}
                  groups={groups}
                  group={groups.find((g) => g.id === editor.id)}
                  onDone={reload}
                  onCancel={() => setEditor(null)}
                />
              </div>
            )}
            {t.competition_format === "knockout" ? (
              <>
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-xl font-bold">Knockout progression</h2>
                  {groupAction}
                </div>
                <p className="mb-5 text-sm text-muted-foreground">
                  Follow each fixture and its winner. Schedule the next round from Matches.
                </p>
                {orderedMatches.length ? (
                  <div className="grid gap-4 md:grid-cols-2">{orderedMatches.map(renderMatch)}</div>
                ) : (
                  <CricketEmpty
                    title="No knockout fixtures"
                    text="The draw will appear when fixtures are scheduled."
                    action={fixtureAction}
                  />
                )}
              </>
            ) : t.competition_format === "groups" ? (
              groups.length ? (
                <>
                  <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-xl font-bold">Group standings</h2>
                    {editor?.kind !== "group" && groupAction}
                  </div>
                  {groups.map((g) => (
                    <section key={g.id} className="mb-8">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <h3 className="font-semibold uppercase tracking-wide">{g.name}</h3>
                        {canManage && (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openEditor("group", g.id)}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={deleting}
                              onClick={() => remove("group", g.id)}
                            >
                              Remove
                            </Button>
                          </div>
                        )}
                      </div>
                      <PointsTable
                        groupId={g.id}
                        teams={teams.filter((team) => g.team_ids.includes(team.id))}
                        summary={summary}
                        tournament={t}
                      />
                    </section>
                  ))}
                </>
              ) : (
                editor?.kind !== "group" && (
                  <CricketEmpty
                    title="No Groups"
                    text="Create groups and add teams to generate the points table."
                    action={groupAction}
                  />
                )
              )
            ) : (
              <>
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-xl font-bold">Points table</h2>
                  {editor?.kind !== "group" && groupAction}
                </div>
                <PointsTable teams={teams} summary={summary} tournament={t} />
              </>
            )}
            <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
              P Played · W Won · L Lost · T Tied · NR No result · PTS Points · NRR Net run rate.
              Points: win {t.points_win}, tie {t.points_tie}, loss {t.points_loss}, no result{" "}
              {t.points_no_result ?? 1}. Standings update from completed matches.
            </p>
          </TabsContent>
          <TabsContent value="statistics" className="m-0 p-5 sm:p-8">
            <TournamentStatistics awardsAllowed={allows("awards")}
              summary={summary}
              renderCard={(stat) => <StatCard stat={stat} />}
            />
          </TabsContent>
        </Tabs>
        <footer className="border-t border-border px-5 py-5 text-center text-xs text-muted-foreground">
          Powered by Crease · Live cricket scoring
        </footer>
      </div>
    </div>
  );
}
