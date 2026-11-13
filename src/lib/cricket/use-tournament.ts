import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { TournamentDelivery } from "./tournament-summary";

// Supabase defaults to 1,000 rows. Paginate every collection, especially deliveries.
export async function allRows<T>(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await fetchPage(offset, offset + 499);
    if (result.error) throw new Error(result.error.message);
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < 500) return rows;
  }
}

export function useTournament(tournamentId: string) {
  const qc = useQueryClient();
  const queryKey = ["tournament", tournamentId];
  const query = useQuery({
    queryKey,
    refetchInterval: 15000,
    queryFn: async () => {
      const [t, teams, matches] = await Promise.all([
        supabase.from("tournaments").select("*").eq("id", tournamentId).maybeSingle(),
        allRows<Tables<"tournament_teams">>((from, to) =>
          supabase
            .from("tournament_teams")
            .select("*")
            .eq("tournament_id", tournamentId)
            .order("id")
            .range(from, to),
        ),
        allRows<Tables<"matches">>((from, to) =>
          supabase
            .from("matches")
            .select("*")
            .eq("tournament_id", tournamentId)
            .order("id")
            .range(from, to),
        ),
      ]);
      if (t.error) throw t.error;
      // Older deployments have neither this column nor the groups table.
      // Keep public pages usable without repeatedly requesting a missing table.
      const hasGroupsSchema = !!t.data && "competition_format" in t.data;
      const groupsResult = hasGroupsSchema
        ? await supabase
            .from("tournament_groups")
            .select("*")
            .eq("tournament_id", tournamentId)
            .order("name")
        : { data: [], error: null };
      const schemaPending =
        !hasGroupsSchema ||
        groupsResult.error?.code === "PGRST205" ||
        groupsResult.error?.code === "42P01";
      if (groupsResult.error && !schemaPending) throw groupsResult.error;
      const deliveries: TournamentDelivery[] = [];
      for (let i = 0; i < matches.length; i += 50) {
        const ids = matches.slice(i, i + 50).map((m) => m.id);
        const rows = await allRows<Tables<"deliveries">>((from, to) =>
          supabase
            .from("deliveries")
            .select("*")
            .in("match_id", ids)
            .order("match_id")
            .order("innings")
            .order("seq")
            .range(from, to),
        );
        deliveries.push(...(rows as unknown as TournamentDelivery[]));
      }
      return {
        tournament: t.data,
        teams,
        matches,
        groups: groupsResult.data ?? [],
        deliveries,
        schemaPending,
      };
    },
  });
  const matchIds = (query.data?.matches ?? [])
    .map((m) => m.id)
    .sort()
    .join(",");
  const groupsAvailable = query.data?.schemaPending === false;
  useEffect(() => {
    const ids = new Set(matchIds.split(","));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void qc.invalidateQueries({ queryKey: ["tournament", tournamentId] });
      }, 150);
    };
    const channel = supabase
      .channel(`tournament-${tournamentId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tournaments", filter: `id=eq.${tournamentId}` },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tournament_teams",
          filter: `tournament_id=eq.${tournamentId}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "matches",
          filter: `tournament_id=eq.${tournamentId}`,
        },
        refresh,
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries" }, (payload) => {
        // DELETE events can contain only a primary key under RLS. Refetch to
        // include undos; do not increment cached totals from event payloads.
        if (
          payload.eventType === "DELETE" ||
          ("match_id" in payload.new && ids.has(String(payload.new["match_id"])))
        )
          refresh();
      });
    if (groupsAvailable) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tournament_groups",
          filter: `tournament_id=eq.${tournamentId}`,
        },
        refresh,
      );
    }
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") refresh();
    });
    window.addEventListener("online", refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("online", refresh);
      void supabase.removeChannel(channel);
    };
  }, [tournamentId, matchIds, qc, groupsAvailable]);
  return query;
}
