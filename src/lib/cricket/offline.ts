import type { Delivery } from "./engine";
import type { MatchRow } from "./match";

export interface ScoreSnapshot { match: MatchRow; deliveries: Delivery[] }
export interface ScoreOperation {
  id: string;
  kind: "ball" | "undo" | "edit" | "state";
  delivery: Delivery | null;
  patch: Partial<MatchRow>;
  reason: string;
}
export interface ScoreDraft { base: ScoreSnapshot; queue: ScoreOperation[] }

/** Replay durable events, never cached totals. */
export function replay(base: ScoreSnapshot, queue: ScoreOperation[]): ScoreSnapshot {
  return queue.reduce((state, op) => {
    let deliveries = state.deliveries;
    const ball = op.delivery;
    if (ball && op.kind === "ball" && !deliveries.some((d) => d.id === ball.id)) deliveries = [...deliveries, ball];
    if (ball && op.kind === "undo") deliveries = deliveries.filter((d) => d.id !== ball.id);
    if (ball && op.kind === "edit") deliveries = deliveries.map((d) => d.id === ball.id ? ball : d);
    return { match: { ...state.match, ...op.patch, result: null }, deliveries };
  }, base);
}

export function draftKey(userId: string, matchId: string) { return `crease:score:v1:${userId}:${matchId}`; }
export function loadDraft(key: string): ScoreDraft | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as ScoreDraft;
    return value.base?.match && Array.isArray(value.base.deliveries) && Array.isArray(value.queue) ? value : null;
  } catch { return null; }
}
export function saveDraft(key: string, draft: ScoreDraft) { localStorage.setItem(key, JSON.stringify(draft)); }