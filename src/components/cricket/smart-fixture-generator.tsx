import { useEffect, useRef, useState } from "react";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loadFixtureContext, saveGeneratedFixtures } from "@/lib/cricket/fixture-generator-api";
import type {
  FixtureContext,
  ScheduleMode,
  generateFixtures,
} from "@/lib/cricket/fixture-generator";
import { Shuffle, Sparkles } from "lucide-react";
import { toast } from "sonner";
type Result = ReturnType<typeof generateFixtures>;
type Preview = { context: FixtureContext; result: Result; mode: ScheduleMode; requestId: string };
export function SmartFixtureGenerator({
  tournament,
  teams,
  groups,
  matches,
  onDone,
  onCancel,
}: {
  tournament: Tables<"tournaments">;
  teams: Tables<"tournament_teams">[];
  groups: Tables<"tournament_groups">[];
  matches: Tables<"matches">[];
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const [groupId, setGroupId] = useState("");
  const [mode, setMode] = useState<ScheduleMode>("round_robin");
  const [target, setTarget] = useState("1");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const worker = useRef<Worker | null>(null);
  const sequence = useRef(0);
  const saveLock = useRef(false);
  const snapshot = JSON.stringify([
    tournament,
    teams,
    groups,
    matches.map((m) => [m.id, m.updated_at, m.rules, m.team_a_id, m.team_b_id, m.status]),
  ]);
  const previous = useRef(snapshot);
  useEffect(() => {
    if (previous.current !== snapshot) {
      previous.current = snapshot;
      sequence.current++;
      worker.current?.terminate();
      setBusy(false);
      setPreview(null);
      if (!saveLock.current)
        setError("Tournament data changed. Generate a fresh preview before confirming.");
    }
  }, [snapshot]);
  useEffect(
    () => () => {
      sequence.current++;
      worker.current?.terminate();
    },
    [],
  );
  const reset = () => {
    sequence.current++;
    worker.current?.terminate();
    setBusy(false);
    setPreview(null);
    setError("");
  };
  const group = groups.find((g) => g.id === groupId);
  const validTeams = group?.team_ids.filter((id) => teams.some((t) => t.id === id)) ?? [];
  const eligible = validTeams.filter(
    (id) => (teams.find((t) => t.id === id)?.players.length ?? 0) >= tournament.players_per_team,
  ).length;
  const existingCount = matches.filter(
    (m) =>
      m.status !== "cancelled" &&
      (m.rules as { tournamentStage?: { kind?: string; groupId?: string } })?.tournamentStage
        ?.kind === "group" &&
      (m.rules as { tournamentStage?: { groupId?: string } })?.tournamentStage?.groupId === groupId,
  ).length;
  async function generate() {
    if (busy || saveLock.current) return;
    const turn = ++sequence.current;
    setBusy(true);
    setError("");
    setPreview(null);
    try {
      const context = await loadFixtureContext(tournament.id, groupId);
      if (turn !== sequence.current) return;
      const w = new Worker(
        new URL("../../lib/cricket/fixture-generator.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.current = w;
      w.onmessage = (event: MessageEvent<{ result?: Result; error?: string }>) => {
        w.terminate();
        if (turn !== sequence.current) return;
        setBusy(false);
        if (event.data.error) setError(event.data.error);
        else if (event.data.result)
          setPreview({ context, result: event.data.result, mode, requestId: crypto.randomUUID() });
      };
      w.onerror = () => {
        w.terminate();
        if (turn === sequence.current) {
          setBusy(false);
          setError("Unable to run the generator. Reload the page and try again.");
        }
      };
      w.postMessage({ context, mode, target: Number(target) });
    } catch (e) {
      if (turn === sequence.current) {
        setError(e instanceof Error ? e.message : "Unable to generate fixtures.");
        setBusy(false);
      }
    }
  }
  async function confirm() {
    if (!preview || saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    setError("");
    try {
      const ids = await saveGeneratedFixtures(
        preview.context,
        preview.mode,
        preview.result.target,
        preview.result.pairs,
        preview.requestId,
      );
      setPreview(null);
      toast.success(`${ids.length} fixtures created`);
      await onDone();
      onCancel();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save. Retry this preview safely.");
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }
  const name = (id: string) =>
    preview?.context.teams.find((t) => t.id === id)?.name ??
    teams.find((t) => t.id === id)?.name ??
    "Missing team";
  return (
    <section className="tournament-editor mb-8 space-y-5" aria-label="Smart Fixture Generator">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-xl font-bold">
            <Sparkles size={20} className="text-teal-600" />
            Smart Fixture Generator
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Complete one group’s schedule while preserving every existing fixture.
          </p>
        </div>
        <Button
          variant="ghost"
          disabled={saving}
          onClick={() => {
            reset();
            onCancel();
          }}
        >
          Cancel
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="generator-group">Group</Label>
          <select
            id="generator-group"
            value={groupId}
            disabled={saving}
            onChange={(e) => {
              reset();
              setGroupId(e.target.value);
            }}
            className="h-11 w-full rounded-lg border border-input bg-white px-3 text-sm"
          >
            <option value="">Select group</option>
            {groups.map((g) => (
              <option
                key={g.id}
                value={g.id}
                disabled={g.team_ids.filter((id) => teams.some((t) => t.id === id)).length < 2}
              >
                {g.name} · {g.team_ids.length} teams
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="generator-mode">Scheduling mode</Label>
          <select
            id="generator-mode"
            value={mode}
            disabled={saving}
            onChange={(e) => {
              reset();
              setMode(e.target.value as ScheduleMode);
            }}
            className="h-11 w-full rounded-lg border border-input bg-white px-3 text-sm"
          >
            <option value="round_robin">Round Robin</option>
            <option value="equal">Equal Match Distribution</option>
          </select>
        </div>
        {mode === "equal" && (
          <div className="space-y-2">
            <Label htmlFor="generator-target">Matches per team</Label>
            <Input
              id="generator-target"
              type="number"
              min={1}
              max={Math.max(1, validTeams.length - 1)}
              step={1}
              value={target}
              disabled={saving}
              onChange={(e) => {
                reset();
                setTarget(e.target.value);
              }}
            />
          </div>
        )}
      </div>
      {group && (
        <p className="rounded-xl bg-teal-50/60 p-4 text-sm">
          {group.name} · {validTeams.length} teams · {eligible} eligible squads · {existingCount}{" "}
          existing fixtures
          {mode === "round_robin"
            ? ` · ${Math.max(0, validTeams.length - 1)} matches per team`
            : ""}
        </p>
      )}
      {group && eligible !== group.team_ids.length && (
        <p className="text-sm text-muted-foreground">
          Every group team needs at least {tournament.players_per_team} registered players, just as
          for a manual fixture.
        </p>
      )}
      {error && (
        <div role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          <strong className="block mb-1">Cannot Generate Fixtures</strong>
          {error}
        </div>
      )}
      {!preview && (
        <Button
          disabled={
            !group || validTeams.length < 2 || eligible !== group.team_ids.length || busy || saving
          }
          onClick={() => void generate()}
        >
          {busy ? "Validating and generating…" : "Generate preview"}
        </Button>
      )}
      {preview && (
        <>
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-border p-4 text-sm sm:grid-cols-4">
            {[
              ["Matches per team", preview.result.target],
              ["Total required", preview.result.total],
              ["Existing", preview.result.existing.length],
              ["New fixtures", preview.result.pairs.length],
            ].map(([label, value]) => (
              <div key={label}>
                <span className="text-muted-foreground">{label}</span>
                <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
              </div>
            ))}
          </div>
          <div
            className="max-h-96 space-y-2 overflow-y-auto rounded-xl border border-border p-3"
            aria-label="Fixture preview"
          >
            {preview.result.existing.map((m, i) => (
              <div
                key={m.id}
                className="flex flex-wrap justify-between gap-2 rounded-lg bg-muted/60 p-3 text-sm"
              >
                <span>
                  {i + 1}. {name(m.team_a_id ?? "")} vs {name(m.team_b_id ?? "")}
                </span>
                <span className="text-xs text-muted-foreground">Existing · {m.status}</span>
              </div>
            ))}
            {preview.result.pairs.map(([a, b], i) => (
              <div
                key={[a, b].sort().join(":")}
                className="flex flex-wrap justify-between gap-2 rounded-lg bg-teal-50 p-3 text-sm"
              >
                <span>
                  {preview.result.existing.length + i + 1}. {name(a)} vs {name(b)}
                </span>
                <span className="text-xs font-semibold text-teal-700">New</span>
              </div>
            ))}
          </div>
          {!preview.result.pairs.length ? (
            <p role="status" className="text-sm font-semibold text-teal-700">
              This group’s schedule is complete. No new matches are needed.
            </p>
          ) : (
            <div className="flex flex-wrap gap-3">
              <Button disabled={saving} onClick={() => void confirm()}>
                {saving ? "Creating matches…" : "Confirm & Create Matches"}
              </Button>
              <Button variant="outline" disabled={saving} onClick={() => void generate()}>
                <Shuffle size={16} />
                Regenerate / Shuffle
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            New matches have no date, time, venue, scorer, or score assigned. Nothing is saved until
            confirmation.
          </p>
        </>
      )}
    </section>
  );
}
