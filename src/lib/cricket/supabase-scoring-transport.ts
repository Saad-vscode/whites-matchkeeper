import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { ScoreSnapshot } from "./offline";
import type { ScoringTransport } from "./scoring-transport";

/** The existing authenticated client remains the only production adapter. */
export const supabaseScoringTransport: ScoringTransport = {
  async readSnapshot(matchId) {
    const { data, error } = await supabase.rpc("scoring_snapshot", { _match: matchId });
    if (error) return { data: null, error };
    // The RPC's JSON shape is unchanged; keep the existing snapshot assertion here.
    return { data: data as unknown as ScoreSnapshot, error: null };
  },
  async applyOperation(matchId, expectedRevision, operation) {
    const { data, error } = await supabase.rpc("apply_score_operation", {
      _match: matchId, _id: operation.id, _expected: expectedRevision,
      _kind: operation.kind, _delivery: (operation.delivery ?? {}) as unknown as Json,
      _patch: operation.patch as Json, _reason: operation.reason,
    });
    if (error) return { data: null, error };
    return { data: data as unknown as ScoreSnapshot, error: null };
  },
};
