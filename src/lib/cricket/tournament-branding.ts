import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Tournament identity is live data, not the name copied into a fixture at creation. */
export function useTournamentBranding(id?: string | null) {
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ["tournament-branding", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tournaments")
        .select("name,short_name,logo_url")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });
  useEffect(() => {
    if (!id) return;
    const refresh = () => {
      for (const key of [
        "tournament-branding",
        "tournament",
        "playoffs",
        "match-tournament",
        "scoring-tournament-info",
      ])
        void cache.invalidateQueries({ queryKey: [key, id] });
    };
    const channel = supabase
      .channel(`branding-${id}-${Math.random()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tournaments", filter: `id=eq.${id}` },
        refresh,
      )
      .subscribe();
    window.addEventListener("online", refresh);
    return () => {
      window.removeEventListener("online", refresh);
      void supabase.removeChannel(channel);
    };
  }, [id, cache]);
  return query;
}
