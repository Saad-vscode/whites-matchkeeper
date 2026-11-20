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
  innings?: 1 | 2 | undefined;
  striker?: string | null | undefined;
  nonStriker?: string | null | undefined;
  bowler?: string | null | undefined;
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
    result: (innings === 2 ? matchResult(first, second, cfg, teamName(m, battingSide(m, 1)), teamName(m, battingSide(m, 2))) : null),
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
  const generation = useRef(0);
  const request = useRef(0);

  const refetch = useCallback(async () => {
    const epoch = generation.current;
    const ticket = ++request.current;
    const result = await supabase.rpc("read_live_match", { _match: matchId });
    let snapshotData: unknown = result.data;
    let snapshotError = result.error;
    // Keep older databases functional while the forward-only snapshot migration
    // is being applied. Normal row-level policies still guard this fallback.
    if (snapshotError?.code === "PGRST202") {
      const [matchResult, deliveryResult] = await Promise.all([
        supabase.from("matches").select("*").eq("id", matchId).maybeSingle(),
        supabase.from("deliveries").select("*").eq("match_id", matchId).order("innings").order("seq"),
      ]);
      if (!matchResult.error && !deliveryResult.error && matchResult.data) {
        snapshotData = { match: matchResult.data, deliveries: deliveryResult.data ?? [] };
        snapshotError = null;
      } else {
        snapshotError = matchResult.error ?? deliveryResult.error ?? snapshotError;
      }
    }
    if (!alive.current || epoch !== generation.current || ticket !== request.current) return false;
    const snapshot = snapshotData && typeof snapshotData === "object" && !Array.isArray(snapshotData)
      ? snapshotData as { match?: MatchRow | null; deliveries?: Delivery[] }
      : null;
    if (snapshotError || !snapshot?.match) {
      // A successful empty result means access was revoked or the match removed.
      // Do not leave a previously public score on a spectator/TV display.
      if (!snapshotError || snapshotError.code === "42501") { setMatch(null); setDeliveries([]); }
      setError(snapshotError?.message ?? "Match not found or no longer public");
      setConn("offline");
      return false;
    }
    setError(null);
    setMatch(snapshot.match);
    setDeliveries(snapshot.deliveries ?? []);
    setLastUpdated(new Date());
    setConn("live");
    return true;
  }, [matchId]);

  useEffect(() => {
    alive.current = true;
    generation.current++;
    setMatch(null);
    setDeliveries([]);
    setError(null);
    setConn("connecting");
    setLastUpdated(null);
    let subscribed = true;
    let connectionVersion = 0;
    refetch();
    const channel = supabase
      .channel(`match-${matchId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `id=eq.${matchId}` }, () => {
        if (!subscribed) return;
        void refetch();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries", filter: `match_id=eq.${matchId}` }, () => {
        if (!subscribed) return;
        void refetch();
      })
      .subscribe((status) => {
        if (!subscribed) return;
        const connection = ++connectionVersion;
        if (status === "SUBSCRIBED") {
          // Establish the reconnect snapshot before declaring the stream live.
          // Consumers must not mistake missed historical balls for new events.
          setConn("connecting");
          void refetch().then((ok) => { if (subscribed && connection === connectionVersion && !ok) setConn("offline"); });
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setConn("offline");
      });
    const off = () => setConn("offline");
    const refresh = () => { void refetch(); };
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    const poll = window.setInterval(refresh, 5000);
    window.addEventListener("offline", off);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      subscribed = false;
      alive.current = false;
      generation.current++;
      window.clearInterval(poll);
      window.removeEventListener("offline", off);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", visible);
      supabase.removeChannel(channel);
    };
  }, [matchId, refetch]);

  const derived = useMemo(() => (match ? derive(match, deliveries) : null), [match, deliveries]);
  return { match, setMatch, deliveries, setDeliveries, derived, conn, lastUpdated, error, refetch };
}
