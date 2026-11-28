import type { ScoreOperation, ScoreSnapshot } from "./offline";

/** Preserve backend messages/codes so the queue keeps its existing error policy. */
export interface ScoringTransportError {
  message: string;
  code?: string;
}

export type ScoringTransportResult =
  | { data: ScoreSnapshot; error: null }
  | { data: null; error: ScoringTransportError };

/** Transport only: persistence, replay, retries and conflict handling stay in the hook.
 * Implementations may reject for network failures; callers retain the pending operation.
 */
export interface ScoringTransport {
  readSnapshot(matchId: string): Promise<ScoringTransportResult>;
  applyOperation(
    matchId: string,
    expectedRevision: number,
    operation: ScoreOperation,
  ): Promise<ScoringTransportResult>;
}
