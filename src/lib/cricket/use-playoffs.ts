import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resolveDraw, type PlayoffContext } from "./playoffs";

export function playoffError(error: { message: string; code?: string }) {
  return new Error(
    ["PGRST202", "42883", "42P01"].includes(error.code ?? "")
      ? "Playoffs needs database migration 0012_tournament_playoffs.sql. Apply it, then refresh."
      : error.message,
  );
}
export async function loadPlayoffs(id: string): Promise<PlayoffContext> {
  const { data, error } = await supabase.rpc("playoff_context", { _t: id });
  if (error) throw playoffError(error);
  return data as unknown as PlayoffContext;
}
export async function syncPlayoffs(ctx: PlayoffContext) {
  if (!ctx.playoff?.approved) return 0;
  const states = resolveDraw(ctx.playoff.draw, ctx.matches, ctx.deliveries);
  const needed = states.some((s) => s.status === "ready" || s.status === "conflict");
  if (!needed) return 0;
  const winners = Object.fromEntries(
    states.filter((s) => s.winner && s.match).map((s) => [s.node.id, s.winner]),
  );
  const { data, error } = await supabase.rpc("sync_playoff_fixtures", {
    _t: ctx.tournament.id,
    _token: ctx.token,
    _winners: winners,
  });
  if (error) throw playoffError(error);
  return data ?? 0;
}
export function usePlayoffs(id: string | undefined, enabled = true, canSync = false) {
  const qc = useQueryClient();
  const [syncError, setSyncError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const attempted = useRef<string | null>(null);
  const query = useQuery({
    queryKey: ["playoffs", id],
    enabled: !!id && enabled,
    queryFn: () => loadPlayoffs(id!),
    refetchInterval: 15000,
    retry: false,
  });
  useEffect(() => {
    if (!id || !enabled) return;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void qc.invalidateQueries({ queryKey: ["playoffs", id] }), 300);
    };
    const ch = supabase
      .channel(`playoffs-${id}-${Math.random()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tournaments", filter: `id=eq.${id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "tournament_teams", filter: `tournament_id=eq.${id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "tournament_groups", filter: `tournament_id=eq.${id}` }, refresh)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tournament_playoffs",
          filter: `tournament_id=eq.${id}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches", filter: `tournament_id=eq.${id}` },
        refresh,
      )
      .subscribe();
    window.addEventListener("online", refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("online", refresh);
      void supabase.removeChannel(ch);
    };
  }, [id, enabled, qc]);
  useEffect(() => {
    const ctx = query.data;
    if (!canSync || !ctx || attempted.current === ctx.token) return;
    attempted.current = ctx.token;
    setSyncError(null);
    let active = true;
    void syncPlayoffs(ctx)
      .then((count) => {
        if (count) {
          void qc.invalidateQueries({ queryKey: ["playoffs", id] });
          void qc.invalidateQueries({ queryKey: ["tournament", id] });
        }
      })
      .catch((e) => {
        if (!active) return;
        if (e.message.includes("PLAYOFF_STALE")) {
          attempted.current = null;
          void qc.invalidateQueries({ queryKey: ["playoffs", id] });
        } else setSyncError(e.message);
      });
    return () => {
      active = false;
    };
  }, [query.data, canSync, id, qc, retry]);
  return {
    ...query,
    data: query.isError ? undefined : query.data,
    syncError,
    retrySync: () => {
      attempted.current = null;
      setRetry((n) => n + 1);
      void query.refetch();
    },
  };
}
