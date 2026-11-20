import { useFeatureAccess } from "@/lib/feature-access";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { calculateMatchAward } from "@/lib/cricket/match-award";
import type { MatchRow } from "@/lib/cricket/match";
import type { Delivery } from "@/lib/cricket/engine";

export function MatchAward({ match, deliveries, canPublish = false, blocked = false, tv = false }: {
  match: MatchRow; deliveries: Delivery[]; canPublish?: boolean; blocked?: boolean; tv?: boolean;
}) {
  const { allows } = useFeatureAccess({ match: match.id });
  const cache = useQueryClient();
  const key = ["match-award", match.id, match.score_revision];
  const publication = useQuery({
    queryKey: key,
    enabled: match.status === "completed",
    queryFn: async () => {
      const { data, error } = await supabase.rpc("read_match_award", { _match: match.id });
      if (error) throw error;
      return data;
    },
    refetchInterval: 5000,
    retry: false,
  });
  useEffect(() => {
    if (match.status !== "completed") return;
    const channel = supabase.channel("award-" + match.id + "-" + Math.random())
      .on("postgres_changes", { event: "*", schema: "public", table: "match_award_publications", filter: "match_id=eq." + match.id },
        () => { void cache.invalidateQueries({ queryKey: ["match-award", match.id] }); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [cache, match.id, match.status]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const published = !!publication.data && typeof publication.data === "object" && !Array.isArray(publication.data) &&
    publication.data["score_revision"] === match.score_revision && match.status === "completed";
  const award = useMemo(() => published ? calculateMatchAward(match, deliveries) : null, [published, match, deliveries]);
  if (match.status !== "completed" || !allows("awards")) return null;
  const publish = async () => {
    if (busy || blocked) return;
    setBusy(true); setError("");
    try {
      const result = calculateMatchAward(match, deliveries);
      if (!result.winners.length) throw new Error("No performance data is available for this match.");
      if (result.uncreditedFielding) throw new Error("Some dismissals lack fielding credits. Complete those records before publishing Man of the Match.");
      const { error: issue } = await supabase.rpc("publish_match_award", { _match: match.id, _expected: match.score_revision });
      if (issue) throw issue;
      await cache.invalidateQueries({ queryKey: ["match-award", match.id] });
    } catch (e) {
      const message = (e as { message?: string }).message ?? "Could not publish award.";
      setError(/function|schema cache|does not exist/i.test(message) ? "Apply migration 0011_match_award_publication in Lovable, then calculate again." : message);
    } finally { setBusy(false); }
  };
  if (!published && !canPublish) return null;
  return <section className={tv ? "tv-award" : "rounded-xl border border-border bg-card p-4"} aria-label="Man of the Match">
    {award && !award.uncreditedFielding && award.winners.length > 0 && <div>
      <p className="font-semibold text-primary">Man of the Match{award.winners.length > 1 ? " · Shared award" : ""}</p>
      <p className="text-xl font-bold">{award.winners.map(p => p.name + " (" + p.team + ")").join(" & ")}</p>
    </div>}
    {canPublish && <div className="mt-3 space-y-2">
      <Button disabled={busy || blocked} onClick={() => void publish()}>{busy ? "Calculating…" : published ? "Recalculate Man of the Match" : "Calculate & publish Man of the Match"}</Button>
      {blocked && <p className="text-sm text-muted-foreground">Sync pending scoring changes before calculating.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>}
  </section>;
}
