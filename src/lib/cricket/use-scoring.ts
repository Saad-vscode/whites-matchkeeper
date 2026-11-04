import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { derive } from "./match";
import { draftKey, loadDraft, replay, saveDraft, type ScoreDraft, type ScoreOperation, type ScoreSnapshot } from "./offline";

export function useScoring(matchId: string, userId: string) {
  const key = draftKey(userId, matchId);
  const draft = useRef<ScoreDraft | null>(null);
  const mounted = useRef(false);
  const locked = useRef(false);
  const blocked = useRef(false);
  const [state, setState] = useState<ScoreSnapshot | null>(null);
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const publish = useCallback((next: ScoreDraft) => {
    // Fail closed if the device cannot durably save: never pretend a ball was saved.
    saveDraft(key, next);
    draft.current = next;
    if (mounted.current) {
      setState(replay(next.base, next.queue));
      setPending(next.queue.length);
      setLastUpdated(new Date());
    }
  }, [key]);

  const sync = useCallback(async () => {
    if (locked.current || blocked.current || !navigator.onLine) return;
    locked.current = true;
    setSyncing(true);
    try {
      if (!draft.current?.queue.length) {
        const { data, error: e } = await supabase.rpc("scoring_snapshot", { _match: matchId });
        if (e) throw e;
        if (!mounted.current) return;
        // A tap may have arrived while the fresh snapshot was being fetched.
        if (!draft.current?.queue.length) publish({ base: data as unknown as ScoreSnapshot, queue: [] });
      }
      while (mounted.current && navigator.onLine && draft.current?.queue.length) {
        const current = draft.current;
        const op = current.queue[0];
        if (!op) break;
        const { data, error: e } = await supabase.rpc("apply_score_operation", {
          _match: matchId, _id: op.id, _expected: current.base.match.score_revision,
          _kind: op.kind, _delivery: (op.delivery ?? {}) as unknown as Json,
          _patch: op.patch as Json, _reason: op.reason,
        });
        if (e) {
          if (e.message.includes("SCORE_CONFLICT") || e.code === "23505") {
            blocked.current = true;
            setConflict(true);
            setError(null);
            break;
          }
          throw e;
        }
        if (!mounted.current) return;
        const remaining = draft.current?.queue.filter((x) => x.id !== op.id) ?? [];
        publish({ base: data as unknown as ScoreSnapshot, queue: remaining });
      }
      if (!blocked.current) setError(null);
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : (e as { message?: string }).message ?? "Could not sync. Your saved balls remain on this device.");
    } finally {
      locked.current = false;
      if (mounted.current) setSyncing(false);
    }
  }, [matchId, publish]);

  useEffect(() => {
    mounted.current = true;
    draft.current = null;
    blocked.current = false;
    setConflict(false);
    setOnline(navigator.onLine);
    try { const cached = loadDraft(key); if (cached) publish(cached); } catch { setError("Device storage is unavailable."); }
    void sync();
    const connectivity = () => { setOnline(navigator.onLine); if (navigator.onLine) void sync(); };
    const storage = (e: StorageEvent) => { if (e.key === key && !locked.current) { const next = loadDraft(key); if (next) publish(next); } };
    window.addEventListener("online", connectivity);
    window.addEventListener("offline", connectivity);
    window.addEventListener("storage", storage);
    const timer = window.setInterval(() => void sync(), 5000);
    const leave = (e: BeforeUnloadEvent) => { if (draft.current?.queue.length) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", leave);
    return () => { mounted.current = false; clearInterval(timer); window.removeEventListener("online", connectivity); window.removeEventListener("offline", connectivity); window.removeEventListener("storage", storage); window.removeEventListener("beforeunload", leave); };
  }, [key, sync, publish]);

  const mutate = useCallback(async (operation: Omit<ScoreOperation, "id">) => {
    if (!draft.current || blocked.current) return false;
    try {
      publish({ ...draft.current, queue: [...draft.current.queue, { ...operation, id: crypto.randomUUID() }] });
      void sync();
      return true;
    } catch { setError("Could not save on this device. Free some storage before scoring another ball."); return false; }
  }, [publish, sync]);

  const useServer = async () => {
    if (!navigator.onLine || locked.current) return;
    // Download the rejected draft before replacing it. No silent overwrite or rebase.
    if (draft.current?.queue.length) {
      const url = URL.createObjectURL(new Blob([JSON.stringify(draft.current, null, 2)], { type: "application/json" }));
      const a = document.createElement("a"); a.href = url; a.download = `crease-unsynced-${matchId}.json`; a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    const { data, error: e } = await supabase.rpc("scoring_snapshot", { _match: matchId });
    if (e) { setError(e.message); return; }
    publish({ base: data as unknown as ScoreSnapshot, queue: [] });
    blocked.current = false; setConflict(false); setError(null);
  };
  const derived = useMemo(() => state ? derive(state.match, state.deliveries) : null, [state]);
  return { match: state?.match ?? null, deliveries: state?.deliveries ?? [], derived, mutate, pending, syncing, conflict, useServer, online, error, refetch: sync, lastUpdated, conn: online ? "live" as const : "offline" as const };
}