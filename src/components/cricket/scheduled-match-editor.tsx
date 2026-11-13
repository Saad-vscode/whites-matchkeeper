import { useState } from "react";
import type { Tables } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "./tournament-actions";

export function ScheduledMatchEditor({
  match,
  onDone,
  onCancel,
}: {
  match: Tables<"matches">;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(match.match_date ?? "");
  const [time, setTime] = useState(match.scheduled_time ?? "");
  const [venue, setVenue] = useState(match.venue ?? "");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="tournament-editor space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        try {
          const { error } = await supabase.rpc("edit_scheduled_match", {
            _match: match.id,
            _expected: match.score_revision,
            _date: date || null,
            _time: time || null,
            _venue: venue.trim() || null,
          });
          if (error)
            throw new Error(
              error.code === "PGRST202"
                ? "Apply the scheduled-match editing database migration before saving."
                : error.message,
            );
          toast.success("Scheduled match updated");
          await onDone();
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Could not update match.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3 className="text-xl font-bold">Edit scheduled match</h3>
      <p className="text-sm text-muted-foreground">
        {match.team_a} vs {match.team_b}
      </p>
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
        <Field label="Date (optional)">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Time at venue (optional)">
          <Input type="time" step="1" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field label="Venue (optional)">
          <Input value={venue} onChange={(e) => setVenue(e.target.value)} />
        </Field>
      </fieldset>
      <div className="flex gap-3">
        <Button disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
