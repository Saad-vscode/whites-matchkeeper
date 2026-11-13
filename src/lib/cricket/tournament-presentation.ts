import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { matchStageTitle } from "./match-stage";
import type { MatchRow } from "./match";
export const isFinal = (m: MatchRow) =>
  matchStageTitle(m.rules)?.toLowerCase() === "final" ||
  (m.rules &&
    typeof m.rules === "object" &&
    !Array.isArray(m.rules) &&
    m.rules["playoffNode"] === "final");
export function useTournamentPresentation(id?: string | null) {
  return useQuery({
    queryKey: ["tournament-presentation", id],
    enabled: !!id,
    refetchInterval: 2000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("read_tournament_presentation", { _t: id! });
      if (error) throw error;
      return data as { playing: boolean; seconds: number; updated_at?: string };
    },
  });
}
