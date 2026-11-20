import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  RefreshCw,
  Search,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TournamentStatistics } from "@/components/cricket/tournament-statistics";
import { tournamentSummary } from "@/lib/cricket/tournament-summary";
import { battingSide, teamName } from "@/lib/cricket/match";
import { formatOvers } from "@/lib/cricket/engine";
import { tournamentHonours } from "@/lib/cricket/tournament-home";
import { calculateMatchAward } from "@/lib/cricket/match-award";
import { matchStageTitle } from "@/lib/cricket/match-stage";
import { standings, matchOutcome } from "@/lib/cricket/tournament";
import { countsForPoints } from "@/lib/cricket/match-stage";
import type { PlatformRole } from "@/lib/platform-admin";
import {
  getTournamentDirectory,
  inspectTournament,
  manageTournament,
  transferCandidates,
  tournamentActions,
  tournamentActionLabels,
  type ManagedTournament,
  type TournamentAction,
  type TournamentInspection,
} from "@/lib/platform-tournaments";

const selectClass =
  "h-10 min-w-0 rounded-lg border border-input bg-background px-3 text-sm text-foreground";
const date = (value: string) => new Date(value).toLocaleDateString();
const message = (error: unknown) =>
  error && typeof error === "object" && "message" in error
    ? String(error.message)
    : "Unable to complete this request.";
function useDebounced(value: string) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), 300);
    return () => clearTimeout(timer);
  }, [value]);
  return debounced;
}
function StateLabels({ t }: { t: ManagedTournament }) {
  return (
    <div className="flex flex-wrap gap-1.5 text-xs">
      <span className="rounded-full bg-primary/10 px-2 py-1 font-semibold capitalize text-primary">
        {t.platform_deleted_at ? "Deleted · recoverable" : t.lifecycle}
      </span>
      <span className="rounded-full bg-muted px-2 py-1">
        {t.platform_hidden ? "Hidden" : "Visible"}
      </span>
      {t.platform_disabled && (
        <span className="rounded-full bg-destructive/10 px-2 py-1 text-destructive">Disabled</span>
      )}
    </div>
  );
}
function TournamentIdentity({ t }: { t: ManagedTournament }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-muted">
        {t.logo_url ? (
          <img
            src={t.logo_url}
            alt=""
            referrerPolicy="no-referrer"
            className="h-full w-full object-contain"
          />
        ) : (
          <Trophy size={20} className="text-primary" />
        )}
      </span>
      <span className="min-w-0">
        <span className="block break-words font-semibold">{t.name}</span>
        <span className="text-xs text-muted-foreground">Created {date(t.created_at)}</span>
      </span>
    </div>
  );
}
export function PlatformTournaments({
  actorId,
  actorRole,
}: {
  actorId: string;
  actorRole: PlatformRole;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [organizer, setOrganizer] = useState("");
  const [status, setStatus] = useState("all");
  const [visibility, setVisibility] = useState("all");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(0);
  const [inspecting, setInspecting] = useState<ManagedTournament | null>(null);
  const [selection, setSelection] = useState<{
    t: ManagedTournament;
    action: TournamentAction;
  } | null>(null);
  const filters = {
    search: useDebounced(search),
    organizer: useDebounced(organizer),
    status,
    visibility,
    sort,
    page,
  };
  const query = useQuery({
    queryKey: ["platform-tournaments", actorId, filters],
    queryFn: () => getTournamentDirectory(filters),
    retry: false,
    gcTime: 0,
    refetchInterval: 30000,
  });
  const data = query.isError ? undefined : query.data;
  function actions(t: ManagedTournament) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${t.name}`}>
            <MoreHorizontal size={18} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setInspecting(t)}>View tournament</DropdownMenuItem>
          {tournamentActions(actorRole, t).map((action) => (
            <DropdownMenuItem
              key={action}
              onClick={() => setSelection({ t, action })}
              className={action === "delete" ? "text-destructive" : ""}
            >
              {tournamentActionLabels[action]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
  if (inspecting)
    return (
      <>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Button variant="outline" onClick={() => setInspecting(null)}>
            <ArrowLeft size={16} /> Tournament directory
          </Button>
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck size={16} /> Read-only inspection
          </span>
        </div>
        <TournamentInspector tournament={inspecting} actorId={actorId} />
      </>
    );
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        {(
          ["total", "active", "completed", "upcoming", "hidden", "disabled", "archived"] as const
        ).map((key) => (
          <div key={key} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-medium capitalize text-muted-foreground">
              {key === "total" ? "Total tournaments" : key}
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums">
              {data ? data.summary[key].toLocaleString() : "—"}
            </p>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Lifecycle, visibility and restrictions are independent. Deleted tournaments are retained in
        the recoverable directory. Completion follows an identified final.
      </p>
      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-2 xl:grid-cols-3">
          <label className="relative">
            <Search size={16} className="absolute left-3 top-3 text-muted-foreground" />
            <Input
              aria-label="Search tournaments"
              className="pl-9"
              placeholder="Tournament, organizer or email"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
            />
          </label>
          <Input
            aria-label="Filter by organizer"
            placeholder="Filter organizer name or email"
            value={organizer}
            onChange={(e) => {
              setOrganizer(e.target.value);
              setPage(0);
            }}
          />
          <select
            aria-label="Tournament status"
            className={selectClass}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
          >
            {["all", "upcoming", "active", "completed", "archived", "disabled", "deleted"].map(
              (x) => (
                <option key={x} value={x}>
                  {x === "all"
                    ? "All statuses"
                    : x === "deleted"
                      ? "Deleted · recoverable"
                      : x[0]!.toUpperCase() + x.slice(1)}
                </option>
              ),
            )}
          </select>
          <select
            aria-label="Public visibility"
            className={selectClass}
            value={visibility}
            onChange={(e) => {
              setVisibility(e.target.value);
              setPage(0);
            }}
          >
            <option value="all">All visibility</option>
            <option value="visible">Visible</option>
            <option value="hidden">Hidden</option>
          </select>
          <select
            aria-label="Sort tournaments"
            className={selectClass}
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(0);
            }}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name">Name A–Z</option>
          </select>
          <Button
            variant="outline"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw size={16} /> Refresh directory
          </Button>
        </div>
        {query.isPending && (
          <p role="status" className="p-6">
            Loading tournaments…
          </p>
        )}
        {query.isError && (
          <p role="alert" className="p-6 text-destructive">
            {message(query.error)} Use Refresh directory to retry.
          </p>
        )}
        {data && !data.rows.length && (
          <p className="p-10 text-center text-muted-foreground">
            No tournaments match these filters.
          </p>
        )}
        {!!data?.rows.length && (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    {[
                      "Tournament",
                      "Organizer",
                      "Teams / matches",
                      "Status / visibility",
                      "Actions",
                    ].map((h) => (
                      <th key={h} className="p-4 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((t) => (
                    <tr key={t.id} className="border-t border-border">
                      <td className="max-w-xs p-4">
                        <button
                          className="text-left hover:text-primary"
                          onClick={() => setInspecting(t)}
                        >
                          <TournamentIdentity t={t} />
                        </button>
                      </td>
                      <td className="max-w-52 break-words p-4">
                        <p>{t.organizer}</p>
                        <p className="break-all text-xs text-muted-foreground">
                          {t.email ?? "Email unavailable"}
                        </p>
                      </td>
                      <td className="p-4 tabular-nums">
                        {t.teams} teams
                        <br />
                        <span className="text-muted-foreground">{t.matches} matches</span>
                      </td>
                      <td className="p-4">
                        <StateLabels t={t} />
                        {t.live_matches > 0 && (
                          <p className="mt-2 text-xs text-primary">{t.live_matches} ongoing</p>
                        )}
                      </td>
                      <td className="p-4">{actions(t)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y divide-border lg:hidden">
              {data.rows.map((t) => (
                <article key={t.id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <button className="min-w-0 text-left" onClick={() => setInspecting(t)}>
                      <TournamentIdentity t={t} />
                    </button>
                    {actions(t)}
                  </div>
                  <p className="break-all text-sm">
                    {t.organizer}
                    <span className="block text-xs text-muted-foreground">{t.email}</span>
                  </p>
                  <StateLabels t={t} />
                  <p className="text-xs text-muted-foreground">
                    {t.teams} teams · {t.matches} matches · {t.live_matches} ongoing
                  </p>
                </article>
              ))}
            </div>
          </>
        )}
        <div className="flex items-center justify-between gap-2 border-t border-border p-4">
          <p className="text-xs text-muted-foreground">
            {data?.total ?? 0} tournaments · Page {page + 1}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="Previous tournaments"
              disabled={!page || query.isFetching}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft size={17} />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Next tournaments"
              disabled={!data || (page + 1) * 20 >= data.total || query.isFetching}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight size={17} />
            </Button>
          </div>
        </div>
      </section>
      {selection && (
        <TournamentActionDialog
          key={`${selection.t.id}:${selection.action}`}
          {...selection}
          onClose={() => setSelection(null)}
          onSaved={() => {
            setSelection(null);
            void qc.invalidateQueries({ queryKey: ["platform-tournaments"] });
            void qc.invalidateQueries({ queryKey: ["platform-overview"] });
            void qc.invalidateQueries({ queryKey: ["tournament"] });
          }}
        />
      )}
    </div>
  );
}

function TournamentActionDialog({
  t,
  action,
  onClose,
  onSaved,
}: {
  t: ManagedTournament;
  action: TournamentAction;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(t.name);
  const [shortName, setShortName] = useState(t.short_name ?? "");
  const [location, setLocation] = useState(t.location ?? "");
  const [description, setDescription] = useState(t.description ?? "");
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [search, setSearch] = useState("");
  const [owner, setOwner] = useState("");
  const debounced = useDebounced(search);
  const candidates = useQuery({
    queryKey: ["platform-transfer-candidates", debounced],
    queryFn: () => transferCandidates(debounced),
    enabled: action === "transfer",
    retry: false,
    gcTime: 0,
  });
  const mutation = useMutation({
    mutationFn: () =>
      manageTournament(
        t.id,
        action,
        { name, short_name: shortName, location, description, owner_id: owner },
        reason,
        confirmation,
      ),
    onSuccess: () => {
      toast.success("Tournament updated");
      onSaved();
    },
  });
  const needsReason = ["disable", "archive", "delete", "transfer"].includes(action);
  const needsName = ["delete", "transfer"].includes(action);
  const explanations: Record<TournamentAction, string> = {
    edit: "Update presentation information. Match formats, results, branding and scoring rules remain unchanged.",
    hide: "Remove this tournament from public discovery and revoke public tournament, spectator and TV access. Authorized organizers and scorers can continue.",
    unhide: "Restore public access. Other restrictions remain unchanged.",
    disable:
      "Stop scoring, offline synchronization and tournament changes. Public visibility remains unchanged.",
    enable: "Remove the disabled restriction. An archived tournament remains read-only.",
    archive: "Retain this tournament as read-only history and exclude it from active discovery.",
    restore: "Remove the archive restriction. Visibility and disabled status remain unchanged.",
    transfer:
      "Transfer the tournament and its matches to an active, verified account. Keep existing scorer assignments and all historical records.",
    delete:
      "Recoverable deletion only. Shared pages become unavailable and all changes stop. Teams, players, deliveries, results, settings and media are retained. Recovery has no automatic expiry; no permanent deletion is offered.",
    recover:
      "Recover the tournament with its previous visibility, disabled and archive settings intact.",
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{tournamentActionLabels[action]}</DialogTitle>
          <DialogDescription>{explanations[action]}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <p className="font-semibold">{t.name}</p>
            <p className="break-all text-sm text-muted-foreground">
              {t.organizer} · {t.email}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {t.teams} teams · {t.players} squad entries · {t.matches} matches
            </p>
          </div>
          {!!t.live_matches && (
            <p
              role="alert"
              className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
            >
              {t.live_matches} match(es) are live, paused or between innings. Disabling or archiving
              will interrupt scoring. Confirm only after informing the scorers.
            </p>
          )}
          {action === "edit" && (
            <>
              <Label htmlFor="t-name">Tournament name</Label>
              <Input
                id="t-name"
                required
                maxLength={150}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Label htmlFor="t-short">Short name</Label>
              <Input
                id="t-short"
                maxLength={30}
                value={shortName}
                onChange={(e) => setShortName(e.target.value)}
              />
              <Label htmlFor="t-location">Location</Label>
              <Input
                id="t-location"
                maxLength={200}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
              <Label htmlFor="t-description">Description</Label>
              <textarea
                id="t-description"
                className="min-h-20 w-full rounded-lg border border-input bg-background p-3 text-sm"
                maxLength={2000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </>
          )}
          {action === "transfer" && (
            <>
              <Label htmlFor="owner-search">Find new organizer</Label>
              <Input
                id="owner-search"
                placeholder="Search name or email"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {candidates.isPending && <p role="status">Finding eligible accounts…</p>}
              {candidates.isError && <p role="alert">{message(candidates.error)}</p>}
              <select
                aria-label="New organizer"
                required
                className={`${selectClass} w-full`}
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
              >
                <option value="">Select an active, verified account</option>
                {!candidates.isError &&
                  candidates.data
                    ?.filter((u) => u.id !== t.created_by)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name || u.email} ({u.email})
                      </option>
                    ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Up to 20 eligible accounts. Refine your search if needed.
              </p>
            </>
          )}
          {action !== "edit" && (
            <>
              <Label htmlFor="t-reason">Reason {needsReason ? "(required)" : "(optional)"}</Label>
              <Input
                id="t-reason"
                required={needsReason}
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </>
          )}
          {needsName && (
            <>
              <Label htmlFor="t-confirm">Type “{t.name}” to confirm</Label>
              <Input
                id="t-confirm"
                required
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                autoComplete="off"
              />
            </>
          )}
          {mutation.isError && (
            <p role="alert" className="text-sm text-destructive">
              {message(mutation.error)}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={mutation.isPending} onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={action === "delete" ? "destructive" : "default"}
              disabled={
                mutation.isPending ||
                (needsName && confirmation !== t.name) ||
                (needsReason && !reason.trim()) ||
                (action === "transfer" && (!owner || candidates.isError))
              }
            >
              {mutation.isPending ? "Saving…" : "Confirm"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TournamentInspector({
  tournament,
  actorId,
}: {
  tournament: ManagedTournament;
  actorId: string;
}) {
  const [tab, setTab] = useState("overview");
  const query = useQuery({
    queryKey: ["platform-tournament-inspection", actorId, tournament.id],
    queryFn: () => inspectTournament(tournament.id),
    retry: false,
    gcTime: 0,
    refetchInterval: 15000,
  });
  if (query.isPending) return <p role="status">Loading tournament inspection…</p>;
  if (query.isError)
    return (
      <div role="alert">
        <p>{message(query.error)}</p>
        <Button variant="outline" onClick={() => void query.refetch()}>
          Retry
        </Button>
      </div>
    );
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-card p-5">
        <TournamentIdentity t={{ ...tournament, ...query.data.tournament }} />
        <p className="mt-3 break-all text-sm text-muted-foreground">
          Organizer: {tournament.organizer} ({tournament.email})
        </p>
      </div>
      <nav aria-label="Tournament inspection" className="flex gap-2 overflow-x-auto pb-2">
        {[
          "overview",
          "teams",
          "fixtures",
          "points",
          "statistics",
          "honors",
          "settings",
          "history",
        ].map((x) => (
          <Button
            variant={tab === x ? "default" : "outline"}
            key={x}
            onClick={() => setTab(x)}
            className="capitalize"
          >
            {x}
          </Button>
        ))}
      </nav>
      <InspectionContents data={query.data} tab={tab} />
    </div>
  );
}
function InspectionContents({ data, tab }: { data: TournamentInspection; tab: string }) {
  const summary = useMemo(
    () => tournamentSummary(data.matches, data.deliveries, data.teams),
    [data],
  );
  const t = data.tournament;
  const honours = tournamentHonours(summary.matches);
  if (tab === "statistics")
    return (
      <TournamentStatistics
        summary={summary}
        renderCard={(stat) => (
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">{stat.label}</p>
            <p className="my-3 text-3xl font-bold text-primary">{stat.value}</p>
            <p className="text-sm">
              {stat.player
                ? `${stat.player.name} (${stat.player.team})`
                : "No recorded performance"}
            </p>
          </div>
        )}
      />
    );
  if (tab === "teams")
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {data.teams.map((team) => (
          <section key={team.id} className="rounded-xl border border-border bg-card p-5">
            <h3 className="font-semibold">{team.name}</h3>
            <p className="my-2 text-xs text-muted-foreground">
              Captain: {team.captain || "Not assigned"}
            </p>
            <p className="break-words text-sm">{team.players.join(", ") || "No players yet"}</p>
          </section>
        ))}
      </div>
    );
  if (tab === "fixtures")
    return (
      <div className="space-y-3">
        {summary.matches.length ? (
          summary.matches.map((row) => (
            <article key={row.m.id} className="rounded-xl border border-border bg-card p-4">
              <p className="font-semibold">
                {row.m.team_a} vs {row.m.team_b}
              </p>
              {row.m.toss_winner && <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm tabular-nums">{([1,2] as const).map(innings => {
                const score = innings === 1 ? row.derived.first : row.derived.second;
                return <span key={innings}>{teamName(row.m,battingSide(row.m,innings))}: <strong>{score.runs}/{score.wickets}</strong> ({formatOvers(score.legalBalls,row.m.balls_per_over)} overs)</span>;
              })}</div>}
              <p className="mt-1 text-sm text-muted-foreground">
                {row.m.status} · {row.m.match_date || "Date to be confirmed"}
              </p>
              <p className="mt-2 text-sm">
                {row.outcome
                  ? row.outcome.winner === "tie"
                    ? "Match tied"
                    : (row.outcome.winner === "A" ? row.m.team_a : row.m.team_b) + " won"
                  : row.noResult
                    ? "No result"
                    : "Result not yet available"}
              </p>
            </article>
          ))
        ) : (
          <p>No fixtures yet.</p>
        )}
      </div>
    );
  if (tab === "points") {
    const results = data.matches
      .filter((m) => countsForPoints(m.rules))
      .map((m) => ({
        teamA: m.team_a_id,
        teamB: m.team_b_id,
        outcome:
          m.status === "completed"
            ? matchOutcome(
                m,
                data.deliveries.filter((d) => d.match_id === m.id),
              )
            : null,
        noResult: m.status === "abandoned",
      }));
    const groups = data.groups.length
      ? data.groups
      : [{ id: "all", name: "All teams", team_ids: data.teams.map((x) => x.id) }];
    return (
      <div className="space-y-5">
        {groups.map((group) => (
          <section
            key={group.id}
            className="overflow-x-auto rounded-xl border border-border bg-card p-4"
          >
            <h3 className="mb-3 font-semibold">{group.name}</h3>
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  {["Team", "Played", "Won", "Points", "NRR"].map((x) => (
                    <th key={x} className="p-2">
                      {x}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {standings(
                  data.teams.filter((x) => group.team_ids.includes(x.id)),
                  results,
                  {
                    win: t.points_win,
                    tie: t.points_tie,
                    loss: t.points_loss,
                    noResult: t.points_no_result,
                  },
                  t.balls_per_over,
                  t.ranking_rule,
                ).map((x) => (
                  <tr key={x.teamId} className="border-t border-border">
                    <td className="p-2">{x.name}</td>
                    <td>{x.played}</td>
                    <td>{x.won}</td>
                    <td>{x.points}</td>
                    <td>{x.nrr.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    );
  }
  if (tab === "honors")
    return (
      <section className="rounded-2xl border border-border bg-card p-6">
        <h3 className="text-xl font-semibold">Tournament honors</h3>
        <p className="mt-4">Champions: {honours?.champion.name ?? "Not determined"}</p>
        <p>Runner-up: {honours?.runnerUp.name ?? "Not determined"}</p>
        <p className="mt-4">
          Player of the tournament:{" "}
          {honours
            ? summary.seriesPlayers.map((p) => `${p.name} (${p.team})`).join(" & ") ||
              "Not determined"
            : "Tournament in progress"}
        </p>
        <h4 className="mt-6 font-semibold">Published Man of the Match awards</h4>
        {data.matches
          .filter((m) => data.published_awards?.includes(m.id))
          .map((m) => {
            const award = calculateMatchAward(
              m,
              data.deliveries.filter((d) => d.match_id === m.id),
            );
            return (
              <p key={m.id} className="mt-3 text-sm">
                <span className="font-medium">
                  {matchStageTitle(m.rules) || `${m.team_a} vs ${m.team_b}`}
                </span>
                :{" "}
                {award.uncreditedFielding
                  ? "Fielding attribution requires review"
                  : award.winners.map((p) => `${p.name} (${p.team})`).join(" & ") ||
                    "Not determined"}
              </p>
            );
          })}
        {!data.published_awards?.length && (
          <p className="mt-2 text-sm text-muted-foreground">No current match awards published.</p>
        )}
      </section>
    );
  if (tab === "history")
    return (
      <section className="space-y-3">
        <p className="text-xs text-muted-foreground">Latest 50 administrative actions</p>
        {data.history.length ? (
          data.history.map((h, i) => (
            <article key={i} className="rounded-xl border border-border bg-card p-4">
              <p className="font-semibold capitalize">{h.action.replaceAll("_", " ")}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(h.created_at).toLocaleString()} · Administrator {h.actor_id}
              </p>
              {h.reason && <p className="mt-2 text-sm">{h.reason}</p>}
              <details className="mt-2 text-xs">
                <summary>Previous and updated values</summary>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all">
                  {JSON.stringify(h.changes, null, 2)}
                </pre>
              </details>
            </article>
          ))
        ) : (
          <p>No administrative changes recorded.</p>
        )}
      </section>
    );
  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <h3 className="text-xl font-semibold">
        {tab === "settings" ? "Rules, branding and settings" : t.name}
      </h3>
      <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
        {t.description || "No description provided."}
      </p>
      <dl className="mt-5 grid gap-4 sm:grid-cols-2">
        {Object.entries({
          Location: t.location || "Not set",
          Format: t.competition_format,
          Dates: `${t.start_date || "Not set"} — ${t.end_date || "Not set"}`,
          Overs: t.overs,
          "Balls per over": t.balls_per_over,
          "Players per team": t.players_per_team,
          "Short name": t.short_name || "Not set",
          "Ranking rule": t.ranking_rule,
        }).map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="mt-1 break-words text-sm font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      {tab === "settings" && (
        <>
          <p className="mt-5 text-sm">
            Brand colors: {t.primary_color} / {t.accent_color}
          </p>
          <h4 className="mt-4 font-semibold">Scoring rules</h4>
          <pre className="mt-2 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-4 text-xs">
            {JSON.stringify(t.rules, null, 2)}
          </pre>
          <details className="mt-4">
            <summary className="text-sm">Playoff configuration</summary>
            <pre className="mt-2 overflow-auto whitespace-pre-wrap break-all text-xs">
              {JSON.stringify(data.playoff, null, 2)}
            </pre>
          </details>
        </>
      )}
    </section>
  );
}
