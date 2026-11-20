import { useFeatureAccess } from "@/lib/feature-access";
import { useState } from "react";
import { Play, Square, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTournamentPresentation } from "@/lib/cricket/tournament-presentation";
import { usePresentation } from "@/lib/presentation-settings";
import { Button } from "@/components/ui/button";
export function HonoursControl({ id }: { id: string }) {
  const { allows } = useFeatureAccess({ tournament: id });
  const query = useTournamentPresentation(id),
    settings = usePresentation();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const change = async () => {
    setBusy(true);
    setError("");
    try {
      const { error } = await supabase.rpc("set_tournament_presentation", {
        _t: id,
        _playing: !query.data?.playing,
        _seconds: settings.honoursSeconds,
      });
      if (error) throw error;
      await query.refetch();
    } catch {
      setError(
        "Could not update the TV presentation. Check your connection and apply migration 0013 if needed.",
      );
    } finally {
      setBusy(false);
    }
  };
  if (!allows("honours") || !allows("tv")) return null;
  return (
    <section className="m-5 rounded-xl border border-border bg-primary/5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2 font-bold">
            <Trophy size={20} className="text-primary" />
            Tournament honours
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {query.data?.playing
              ? "TV presentation enabled · Repeats until stopped"
              : "Champions, runners-up and tournament awards on TV"}
          </p>
        </div>
        <Button disabled={busy || query.isLoading || !!query.error} onClick={() => void change()}>
          {query.data?.playing ? <Square size={16} /> : <Play size={16} />}{" "}
          {query.data?.playing ? "Stop presentation" : "Start tournament honours"}
        </Button>
      </div>
      {(error || query.error) && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error || "Apply migration 0013_tournament_presentation.sql to enable TV controls."}
        </p>
      )}
    </section>
  );
}
