import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { MatchRow } from "./match";

type Fixture = Pick<MatchRow, "id" | "status" | "created_at" | "toss_winner">;
const active = (m: Fixture) => ["live", "paused", "innings_break"].includes(m.status) || (m.status === "scheduled" && !!m.toss_winner);

/** Keep an ongoing match stable, including when multiple grounds are playing. */
export function nextTvMatch(currentId: string, matches: Fixture[], preparing?: string | null): string {
  const current = matches.find(m => m.id === currentId);
  if (current && active(current)) return currentId;
  const ordered = [...matches].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  // Retain the result until another match starts; scheduled fixtures don't hide it.
  return ordered.find(active)?.id ?? matches.find(m => m.id === preparing && m.status === "scheduled" && !m.toss_winner)?.id ?? currentId;
}

export function useTvFeed(tournamentId: string | null, currentId: string, following: boolean) {
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [preparing, setPreparing] = useState<string | null>(null);
  useEffect(() => {
    setPreparing(null);
    if (!tournamentId || !following) return;
    const channel = supabase.channel(`tv-preparation-${tournamentId}`)
      .on("broadcast", { event: "preparing" }, ({ payload }) => {
        if (typeof payload?.matchId === "string") setPreparing(payload.matchId);
      }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [tournamentId, following]);
  useEffect(() => {
    setFixtures([]);
    if (!tournamentId || !following) return;
    let alive = true;
    let request = 0;
    const refresh = async () => {
      const ticket = ++request;
      const rows: Fixture[] = [];
      for (let start = 0; ; start += 500) {
        const { data, error } = await supabase.from("matches")
          .select("id,status,created_at,toss_winner").eq("tournament_id", tournamentId)
          .order("created_at").order("id").range(start, start + 499);
        if (!alive || ticket !== request || error) return;
        rows.push(...data);
        if (data.length < 500) break;
      }
      setFixtures(rows);
    };
    void refresh();
    const channel = supabase.channel(`tv-feed-${tournamentId}-${Math.random()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `tournament_id=eq.${tournamentId}` }, () => { void refresh(); })
      .subscribe(status => { if (status === "SUBSCRIBED") void refresh(); });
    const timer = window.setInterval(() => { void refresh(); }, 5000);
    const reconnect = () => { void refresh(); };
    window.addEventListener("online", reconnect);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("online", reconnect);
      void supabase.removeChannel(channel);
    };
  }, [tournamentId, following]);
  return { nextId: following ? nextTvMatch(currentId, fixtures, preparing) : currentId, preparing: following ? preparing : null };
}

/** Display-only cue; opening the scoring page never starts or alters a match. */
export function useTvPreparation(match: MatchRow | null) {
  const id = match?.id, tournament = match?.tournament_id;
  const preparing = match?.status === "scheduled" && !match.toss_winner;
  useEffect(() => {
    if (!id || !tournament || !preparing) return;
    let timer: number | undefined;
    const channel = supabase.channel(`tv-preparation-${tournament}`);
    const announce = () => { void channel.send({ type: "broadcast", event: "preparing", payload: { matchId: id } }); };
    channel.subscribe(status => {
      if (status === "SUBSCRIBED") {
        announce();
        window.clearInterval(timer);
        timer = window.setInterval(announce, 5000);
      }
    });
    return () => { window.clearInterval(timer); void supabase.removeChannel(channel); };
  }, [id, tournament, preparing]);
}
