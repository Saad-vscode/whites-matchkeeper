import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { allRows } from "@/lib/cricket/use-tournament";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X } from "lucide-react";
import { playerRows, validatePlayerRows } from "@/lib/cricket/team-players";
import { LogoUpload } from "./logo-upload";
import { otherMatchTypes } from "@/lib/cricket/match-stage";

const selectClass = "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm";
const errorText = (e: unknown) =>
  e && typeof e === "object" && "message" in e
    ? String(e.message)
    : "Could not save. Please try again.";
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2 text-sm font-medium">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function TeamEditor({
  tournamentId,
  userId,
  team,
  onDone,
  onCancel,
}: {
  tournamentId: string;
  userId: string;
  team?: Tables<"tournament_teams"> | undefined;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: team?.name ?? "",
    short: team?.short_name ?? "",
    color: team?.color ?? "#009688",
    players: playerRows(team),
    logo: team?.logo_url ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [playerError, setPlayerError] = useState("");
  const { data: existing = [] } = useQuery({
    queryKey: ["reusable-teams", userId, tournamentId],
    enabled: !team,
    queryFn: async () => {
      const tournaments = await allRows<Tables<"tournaments">>((from, to) =>
        supabase
          .from("tournaments")
          .select("*")
          .eq("created_by", userId)
          .neq("id", tournamentId)
          .order("id")
          .range(from, to),
      );
      const output: Tables<"tournament_teams">[] = [];
      for (let i = 0; i < tournaments.length; i += 50)
        output.push(
          ...(await allRows<Tables<"tournament_teams">>((from, to) =>
            supabase
              .from("tournament_teams")
              .select("*")
              .in(
                "tournament_id",
                tournaments.slice(i, i + 50).map((t) => t.id),
              )
              .order("id")
              .range(from, to),
          )),
        );
      return output;
    },
  });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || processing) return;
    if (!form.name.trim()) return;
    const squad = validatePlayerRows(form.players);
    if (squad.error !== undefined) {
      setPlayerError(squad.error);
      return;
    }
    setPlayerError("");
    setBusy(true);
    try {
      const values = {
        name: form.name.trim(),
        short_name: form.short.trim() || null,
        color: form.color,
        players: squad.players,
        captain: squad.captain,
        vice_captain: squad.vice_captain,
        logo_url: form.logo || null,
      };
      const q = team
        ? supabase
            .from("tournament_teams")
            .update(values)
            .eq("id", team.id)
            .eq("tournament_id", tournamentId)
        : supabase.from("tournament_teams").insert({ ...values, tournament_id: tournamentId });
      const { error } = await q.select("id").single();
      if (error) {
        if (error.code === "PGRST204")
          throw new Error(
            "Team leadership requires the database update. Your entries are still here; apply the team migrations and save again.",
          );
        throw error;
      }
      toast.success(team ? "Team updated" : "Team added");
      await onDone();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="tournament-editor space-y-5">
      <h3 className="text-xl font-bold">{team ? "Edit team & squad" : "Add team"}</h3>
      <fieldset disabled={busy} className="space-y-4">
        {!team && existing.length > 0 && (
          <Field label="Use a team from another tournament">
            <select
              className={selectClass}
              defaultValue=""
              onChange={(e) => {
                const t = existing.find((t) => t.id === e.target.value);
                if (t)
                  setForm({
                    name: t.name,
                    short: t.short_name ?? "",
                    color: t.color,
                    players: playerRows(t),
                    logo: t.logo_url ?? "",
                  });
              }}
            >
              <option value="">Create a new team</option>
              {existing.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Copies the squad into this tournament. You can adjust it before saving.
            </p>
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Team name">
            <Input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Short name">
            <Input
              value={form.short}
              onChange={(e) => setForm({ ...form, short: e.target.value })}
            />
          </Field>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Team logo</p>
          <LogoUpload
            value={form.logo}
            onChange={(logo) => setForm((f) => ({ ...f, logo }))}
            disabled={busy}
            onProcessingChange={setProcessing}
            label="team logo"
          />
        </div>
        <Field label="Team colour">
          <Input
            type="color"
            value={form.color}
            onChange={(e) => setForm({ ...form, color: e.target.value })}
          />
        </Field>
        <section className="space-y-3" aria-label="Players">
          <h4 className="text-sm font-semibold">Players</h4>
          {form.players.map((name, index) => {
            const role = index === 0 ? "Captain" : index === 1 ? "Vice-Captain" : "Player";
            return (
              <div
                key={index}
                className={`flex items-center gap-2 rounded-xl border p-3 ${index < 2 ? "border-primary/20 bg-primary/5" : "border-border"}`}
              >
                <span className="w-5 shrink-0 text-center text-sm text-muted-foreground">
                  {index + 1}
                </span>
                <label className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                  <span className="text-xs font-semibold sm:w-24 sm:shrink-0">{role}</span>
                  <Input
                    className="rounded-lg"
                    aria-label={`${role} name${index > 1 ? ` ${index + 1}` : ""}`}
                    value={name}
                    placeholder={`Enter ${role.toLowerCase()} name`}
                    onChange={(e) => {
                      setForm((f) => ({
                        ...f,
                        players: f.players.map((p, i) => (i === index ? e.target.value : p)),
                      }));
                      setPlayerError("");
                    }}
                  />
                </label>
                {index > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove player ${index + 1}`}
                    onClick={() => {
                      setForm((f) => ({ ...f, players: f.players.filter((_, i) => i !== index) }));
                      setPlayerError("");
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                ) : (
                  <span className="w-9 shrink-0" />
                )}
              </div>
            );
          })}
          {playerError && (
            <p role="alert" className="text-sm text-destructive">
              {playerError}
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => setForm((f) => ({ ...f, players: [...f.players, ""] }))}
          >
            <Plus className="h-4 w-4" />
            Add Player
          </Button>
        </section>
        {team && (
          <p className="text-sm text-muted-foreground">
            Squad changes apply to new fixtures. Existing scorecards retain their registered player
            names.
          </p>
        )}
      </fieldset>
      <div className="flex gap-3">
        <Button disabled={busy || processing}>{busy ? "Saving…" : "Save team"}</Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy || processing}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function FixtureEditor({
  tournament,
  teams,
  groups,
  userId,
  onDone,
  onCancel,
}: {
  tournament: Tables<"tournaments">;
  teams: Tables<"tournament_teams">[];
  groups: Tables<"tournament_groups">[];
  userId: string;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const navigate = useNavigate();
  const [kind, setKind] = useState<"group" | "other" | null>(null);
  const [groupId, setGroupId] = useState("");
  const [otherType, setOtherType] = useState("");
  const [choosingType, setChoosingType] = useState(true);
  const group = groups.find((g) => g.id === groupId);
  const eligibleTeams =
    kind === "group" ? teams.filter((t) => group?.team_ids.includes(t.id)) : teams;
  const [form, setForm] = useState({
    a: "",
    b: "",
    date: "",
    time: "",
    venue: tournament.location ?? "",
    scorer: "",
  });
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    if (
      !kind ||
      (kind === "group" ? !group : !otherMatchTypes.some((type) => type === otherType))
    ) {
      toast.error("Choose a match type and, for group stage, a group.");
      setChoosingType(true);
      return;
    }
    const start = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("data-start") === "true";
    const a = eligibleTeams.find((t) => t.id === form.a),
      b = eligibleTeams.find((t) => t.id === form.b);
    if (!a || !b || a.id === b.id) {
      toast.error("Choose two different teams.");
      return;
    }
    if (
      a.players.length < tournament.players_per_team ||
      b.players.length < tournament.players_per_team
    ) {
      toast.error(
        `Register at least ${tournament.players_per_team} players for each team before scheduling.`,
      );
      return;
    }
    const fill = (t: Tables<"tournament_teams">) => t.players.slice(0, tournament.players_per_team);
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("matches")
        .insert({
          created_by: userId,
          tournament_id: tournament.id,
          team_a_id: a.id,
          team_b_id: b.id,
          name: tournament.short_name || tournament.name,
          team_a: a.name,
          team_b: b.name,
          team_a_players: fill(a),
          team_b_players: fill(b),
          players_per_team: tournament.players_per_team,
          overs: tournament.overs,
          balls_per_over: tournament.balls_per_over,
          rules: {
            ...(tournament.rules &&
            typeof tournament.rules === "object" &&
            !Array.isArray(tournament.rules)
              ? tournament.rules
              : {}),
            tournamentStage:
              kind === "group" ? { kind, groupId, title: group!.name } : { kind, title: otherType },
          },
          match_date: form.date || null,
          scheduled_time: form.time || null,
          venue: form.venue.trim() || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      if (form.scorer.trim()) {
        const assigned = await supabase.rpc("assign_scorer", {
          _match: data.id,
          _email: form.scorer.trim(),
        });
        if (assigned.error)
          toast.error(`Fixture created. Scorer assignment failed: ${assigned.error.message}`);
      }
      toast.success("Fixture created");
      await onDone();
      if (start) await navigate({ to: "/score/$matchId", params: { matchId: data.id } });
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  if (choosingType)
    return (
      <section className="tournament-editor space-y-5" aria-label="Select Match Type">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xl font-bold">Select Match Type</h3>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close match setup"
            onClick={onCancel}
          >
            <X />
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {(["group", "other"] as const).map((value) => (
            <Button
              key={value}
              type="button"
              variant={kind === value ? "default" : "outline"}
              className="h-24 rounded-2xl whitespace-normal"
              aria-pressed={kind === value}
              onClick={() => {
                setKind(value);
                setForm((f) => ({ ...f, a: "", b: "" }));
              }}
            >
              {value === "group" ? "Group Stage (Points Table)" : "Other Matches"}
            </Button>
          ))}
        </div>
        {kind === "group" && (
          <Field label="Which group?">
            <select
              className={selectClass}
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
            >
              <option value="">Select group</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            {!groups.length && (
              <p className="text-sm text-muted-foreground">
                Create a group and add teams in the Points tab first.
              </p>
            )}
            {group && eligibleTeams.length < 2 && (
              <p className="text-sm text-muted-foreground">
                Add at least two teams to this group first.
              </p>
            )}
          </Field>
        )}
        {kind === "other" && (
          <Field label="Match title / knockout round">
            <select
              className={selectClass}
              value={otherType}
              onChange={(e) => setOtherType(e.target.value)}
            >
              <option value="">Select match type</option>
              {otherMatchTypes.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
            <p className="text-sm text-muted-foreground">
              Other matches do not count toward the points table.
            </p>
          </Field>
        )}
        <Button
          disabled={!kind || (kind === "group" ? !group || eligibleTeams.length < 2 : !otherType)}
          onClick={() => {
            setForm((f) => ({ ...f, a: "", b: "" }));
            setChoosingType(false);
          }}
        >
          Continue
        </Button>
      </section>
    );
  return (
    <form onSubmit={submit} className="tournament-editor space-y-5">
      <h3 className="text-xl font-bold">Start / schedule match</h3>
      <div className="flex items-center justify-between gap-3 rounded-lg bg-primary/5 p-3">
        <p className="text-sm font-medium">
          {kind === "group" ? `Group Stage · ${group?.name ?? "Group unavailable"}` : otherType}
        </p>
        <Button type="button" variant="ghost" disabled={busy} onClick={() => setChoosingType(true)}>
          Change match type
        </Button>
      </div>
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
        <Field label="Home team">
          <select
            required
            className={selectClass}
            value={form.a}
            onChange={(e) => setForm({ ...form, a: e.target.value })}
          >
            <option value="">Choose team</option>
            {eligibleTeams.map((t) => (
              <option key={t.id} value={t.id} disabled={t.id === form.b}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Away team">
          <select
            required
            className={selectClass}
            value={form.b}
            onChange={(e) => setForm({ ...form, b: e.target.value })}
          >
            <option value="">Choose team</option>
            {eligibleTeams.map((t) => (
              <option key={t.id} value={t.id} disabled={t.id === form.a}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date (optional)">
          <Input
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
        </Field>
        <Field label="Time at venue (optional)">
          <Input
            type="time"
            value={form.time}
            onChange={(e) => setForm({ ...form, time: e.target.value })}
          />
        </Field>
        <Field label="Venue (optional)">
          <Input value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} />
        </Field>
        <Field label="Scorer email (optional)">
          <Input
            type="email"
            value={form.scorer}
            onChange={(e) => setForm({ ...form, scorer: e.target.value })}
          />
        </Field>
      </fieldset>
      {teams.length < 2 && (
        <p className="text-sm text-muted-foreground">
          Add at least two teams before creating a fixture.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Register at least {tournament.players_per_team} players per team in Teams before scheduling.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button disabled={busy || teams.length < 2}>{busy ? "Saving…" : "Create fixture"}</Button>
        <Button variant="outline" data-start="true" disabled={busy || teams.length < 2}>
          Create & start
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function GroupEditor({
  tournamentId,
  teams,
  groups,
  group,
  onDone,
  onCancel,
}: {
  tournamentId: string;
  teams: Tables<"tournament_teams">[];
  groups: Tables<"tournament_groups">[];
  group?: Tables<"tournament_groups"> | undefined;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(group?.name ?? "");
  const [selected, setSelected] = useState<string[]>(group?.team_ids ?? []);
  const [busy, setBusy] = useState(false);
  const assigned = new Set(groups.filter((g) => g.id !== group?.id).flatMap((g) => g.team_ids));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("save_tournament_group", {
        _t: tournamentId,
        _id: group?.id ?? null,
        _name: name.trim(),
        _teams: selected,
      });
      if (error) throw error;
      toast.success("Group saved");
      await onDone();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="tournament-editor space-y-5">
      <h3 className="text-xl font-bold">{group ? "Edit group" : "Create group"}</h3>
      <fieldset disabled={busy} className="space-y-4">
        <Field label="Group name">
          <Input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Group A"
          />
        </Field>
        <div className="grid gap-2 sm:grid-cols-2">
          {teams.map((t) => (
            <label
              key={t.id}
              className="flex min-h-11 items-center gap-3 rounded-lg border p-3 text-sm"
            >
              <input
                type="checkbox"
                className="h-4 w-4 accent-teal-600"
                checked={selected.includes(t.id)}
                disabled={assigned.has(t.id)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked ? [...selected, t.id] : selected.filter((id) => id !== t.id),
                  )
                }
              />
              <span>
                {t.name}
                {assigned.has(t.id) && (
                  <span className="block text-xs text-muted-foreground">
                    Already in another group
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
        {!teams.length && (
          <p className="text-sm text-muted-foreground">
            You can create a group now and add teams later.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Saving enables group-stage standings. Only matches between teams in the same group count
          in its table.
        </p>
      </fieldset>
      <div className="flex gap-3">
        <Button disabled={busy}>{busy ? "Saving…" : "Save group"}</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
