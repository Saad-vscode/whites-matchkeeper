import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import {
  computeInnings,
  matchResult,
  normalizeRules,
  type Delivery,
  type InningsState,
  type MatchConfig,
} from "./engine";

export type MatchRow = Tables<"matches">;

export interface LiveState {
  innings?: 1 | 2;
  striker?: string | null;
  nonStriker?: string | null;
  bowler?: string | null;
}

export const getLive = (m: MatchRow): LiveState => (m.live ?? {}) as LiveState;

export function configOf(m: MatchRow): MatchConfig {
  return {
    overs: m.overs,
    ballsPerOver: m.balls_per_over,
    playersPerTeam: m.players_per_team,
    rules: normalizeRules(m.rules),
  };
}

/** Which side ("A"|"B") bats in the given innings, based on the toss. */
export function battingSide(m: MatchRow, innings: 1 | 2): "A" | "B" | null {
  if (!m.toss_winner || !m.toss_decision) return null;
  const other = m.toss_winner === "A" ? "B" : "A";
  const first = m.toss_decision === "bat" ? m.toss_winner : other;
  return innings === 1 ? (first as "A" | "B") : first === "A" ? "B" : "A";
}

export const teamName = (m: MatchRow, side: "A" | "B" | null) =>
  side === "A" ? m.team_a : side === "B" ? m.team_b : "";
export const teamPlayers = (m: MatchRow, side: "A" | "B" | null) =>
  side === "A" ? m.team_a_players : side === "B" ? m.team_b_players : [];

export interface Derived {
  cfg: MatchConfig;
  first: InningsState;
  second: InningsState;
  innings: 1 | 2;
  current: InningsState;
  target: number | null;
  battingSide: "A" | "B" | null;
  bowlingSide: "A" | "B" | null;
  result: string | null;
}

export function derive(m: MatchRow, deliveries: Delivery[]): Derived {
  const cfg = configOf(m);
  const first = computeInnings(deliveries.filter((d) => d.innings === 1), cfg, null);
  const target = first.complete || getLive(m).innings === 2 ? first.runs + 1 : null;
  const second = computeInnings(deliveries.filter((d) => d.innings === 2), cfg, target);
  const innings: 1 | 2 = getLive(m).innings === 2 ? 2 : 1;
  const bs = battingSide(m, innings);
  return {
    cfg,
    first,
    second,
    innings,
    current: innings === 1 ? first : second,
    target: innings === 2 ? target : null,
    battingSide: bs,
    bowlingSide: bs ? (bs === "A" ? "B" : "A") : null,
    result: m.result ?? (innings === 2 ? matchResult(first, second, cfg, teamName(m, battingSide(m, 1)), teamName(m, battingSide(m, 2))) : null),
  };
}

export type ConnState = "connecting" | "live" | "offline";

/** Loads a match + deliveries and keeps both in sync via realtime. */
export function useLiveMatch(matchId: string) {
  const [match, setMatch] = useState<MatchRow | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [conn, setConn] = useState<ConnState>("connecting");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  const refetch = useCallback(async () => {
    const [m, d] = await Promise.all([
      supabase.from("matches").select("*").eq("id", matchId).maybeSingle(),
      supabase.from("deliveries").select("*").eq("match_id", matchId).order("innings").order("seq"),
    ]);
    if (!alive.current) return;
    if (m.error || !m.data) {
      setError(m.error?.message ?? "Match not found");
      return;
    }
    setMatch(m.data);
    setDeliveries((d.data ?? []) as unknown as Delivery[]);
    setLastUpdated(new Date());
  }, [matchId]);

  useEffect(() => {
    alive.current = true;
    refetch();
    const channel = supabase
      .channel(`match-${matchId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `id=eq.${matchId}` }, (p) => {
        if (p.eventType === "UPDATE") setMatch(p.new as MatchRow);
        setLastUpdated(new Date());
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries", filter: `match_id=eq.${matchId}` }, (p) => {
        setDeliveries((prev) => {
          if (p.eventType === "INSERT") {
            const n = p.new as unknown as Delivery;
            return prev.some((x) => x.id === n.id) ? prev : [...prev, n];
          }
          if (p.eventType === "DELETE") {
            const id = (p.old as { id?: string }).id;
            return prev.filter((x) => x.id !== id);
          }
          return prev;
        });
        setLastUpdated(new Date());
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setConn("live");
          refetch(); // catch up on anything missed while reconnecting
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setConn("offline");
      });
    const off = () => setConn("offline");
    window.addEventListener("offline", off);
    return () => {
      alive.current = false;
      window.removeEventListener("offline", off);
      supabase.removeChannel(channel);
    };
  }, [matchId, refetch]);

  const derived = useMemo(() => (match ? derive(match, deliveries) : null), [match, deliveries]);
  return { match, setMatch, deliveries, setDeliveries, derived, conn, lastUpdated, error, refetch };
}
