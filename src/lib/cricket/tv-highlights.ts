import { computeInnings, creditsBowler, isLegal, normalizeRules, type Delivery } from "./engine";
import type { MatchRow } from "./match";

export const HIGHLIGHTS = {
  four: "Four",
  six: "Six",
  wicket: "Wicket",
  triple_six: "Six! Six! Six!",
  run_out: "Run out!",
  duck: "Duck! 0",
  golden_duck: "Golden duck!",
  wide: "Wide ball!",
  no_ball: "No ball!",
  hat_chance: "On a hat-trick!",
  hat_trick: "Hat-trick!",
  maiden: "Maiden over!",
  winning_four: "Winning four!",
  winning_six: "Winning six!",
  fifty: "Fifty!",
} as const;
export type HighlightKind = keyof typeof HIGHLIGHTS;
export type TvHighlight = {
  id: string;
  kind: HighlightKind;
  player: string;
  detail: string;
  dots?: number;
};
export const HIGHLIGHT_DURATION = 2800;

/** Candidates are ordered so one meaningful moment replaces overlapping celebrations. */
export function highlightCandidates(
  ball: Delivery,
  balls: Delivery[],
  match?: MatchRow,
): TvHighlight[] {
  const basic = highlightFor(ball);
  if (!match) return basic ? [basic] : [];
  const cfg = {
    overs: match.overs,
    ballsPerOver: match.balls_per_over,
    playersPerTeam: match.players_per_team,
    rules: normalizeRules(match.rules),
  };
  const innings = balls
    .filter((b) => b.innings === ball.innings && b.seq <= ball.seq)
    .sort((a, b) => a.seq - b.seq);
  const previous = innings.filter((b) => b.id !== ball.id);
  const target =
    ball.innings === 2
      ? computeInnings(
          balls.filter((b) => b.innings === 1),
          cfg,
          null,
        ).runs + 1
      : null;
  const before = computeInnings(previous, cfg, target),
    after = computeInnings(innings, cfg, target);
  const result: TvHighlight[] = [];
  const add = (kind: HighlightKind, player: string, detail: string, dots?: number) =>
    result.push({ id: ball.id, kind, player, detail, ...(dots ? { dots } : {}) });
  if (
    target !== null &&
    before.runs < target &&
    after.runs >= target &&
    !ball.wicket &&
    [4, 6].includes(ball.runs_bat)
  )
    add(
      ball.runs_bat === 6 ? "winning_six" : "winning_four",
      ball.striker,
      ball.runs_bat === 6 ? "That seals the match!" : "What a finish!",
    );
  // Consecutive deliveries by this bowler, across overs but never across innings.
  const bowlerBalls = innings.filter(
    (b) => b.bowler === ball.bowler && (isLegal(b) || creditsBowler(b.wicket)),
  );
  const streak = [...bowlerBalls].reverse().findIndex((b) => !creditsBowler(b.wicket));
  const wickets = streak === -1 ? bowlerBalls.length : streak;
  if (creditsBowler(ball.wicket) && wickets === 3)
    add("hat_trick", ball.bowler, "History created!");
  if (creditsBowler(ball.wicket) && wickets === 2 && !after.complete)
    add("hat_chance", ball.bowler, "2 wickets in 2 balls");
  if (ball.wicket && ball.wicket.kind !== "retired_hurt") {
    const out = after.batters.find((b) => b.name === ball.wicket!.playerOut);
    if (out?.runs === 0) {
      if (out.balls === 1 && ball.striker === out.name && isLegal(ball))
        add("golden_duck", out.name, "First ball dismissal");
      add("duck", out.name, "Out without scoring");
    }
    if (ball.wicket.kind === "run_out")
      add("run_out", ball.wicket.playerOut, "Just short of safety");
  }
  const faced = innings.filter(
    (b) => b.striker === ball.striker && !["wide", "penalty"].includes(b.extra_type),
  );
  const lastThree = faced.slice(-3),
    prior = faced.at(-4);
  if (
    !ball.wicket &&
    ball.runs_bat === 6 &&
    lastThree.length === 3 &&
    lastThree.every((b) => b.runs_bat === 6 && !b.wicket) &&
    prior?.runs_bat !== 6
  )
    add("triple_six", ball.striker, "Player on the charge!");
  const runsBefore = before.batters.find((b) => b.name === ball.striker)?.runs ?? 0;
  const runsAfter = after.batters.find((b) => b.name === ball.striker)?.runs ?? 0;
  if (!ball.wicket && runsBefore < 50 && runsAfter >= 50)
    add("fifty", ball.striker, "Brilliant knock!");
  if (after.next.overComplete) {
    // Isolate this over, including wides before its first legal ball.
    const startLegal = after.legalBalls - cfg.ballsPerOver;
    let legal = 0;
    const over = innings.filter((b) => {
      const inOver = legal >= startLegal;
      if (isLegal(b)) legal++;
      return inOver;
    });
    const overState = computeInnings(over, cfg, null);
    if (over.every((b) => b.bowler === ball.bowler) && overState.bowlers.every((b) => b.runs === 0))
      add("maiden", ball.bowler, "No runs conceded", cfg.ballsPerOver);
  }
  if (basic?.kind === "wicket") result.push(basic);
  if (ball.extra_type === "noball") add("no_ball", ball.bowler, "Illegal delivery");
  if (ball.extra_type === "wide") add("wide", ball.bowler, "Extra conceded");
  if (basic && basic.kind !== "wicket") result.push(basic);
  return result;
}

export function selectHighlight(
  ball: Delivery,
  balls: Delivery[],
  match?: MatchRow,
  enabled?: Partial<Record<HighlightKind, boolean>>,
) {
  return highlightCandidates(ball, balls, match).find((h) => enabled?.[h.kind] !== false) ?? null;
}

export function highlightFor(ball: Delivery): TvHighlight | null {
  if (ball.wicket && ball.wicket.kind !== "retired_hurt")
    return {
      id: ball.id,
      kind: "wicket",
      player: ball.wicket.playerOut,
      detail: ball.wicket.kind.replaceAll("_", " "),
    };
  // Extras adding up to four or six are not batting boundaries.
  if (ball.runs_bat === 4 || ball.runs_bat === 6)
    return {
      id: ball.id,
      kind: ball.runs_bat === 4 ? "four" : "six",
      player: ball.striker,
      detail: ball.runs_bat === 4 ? "Boundary" : "Over the rope",
    };
  return null;
}

/** Track confirmed server snapshots only. Loading, reconnecting and edits are silent. */
export class TvHighlightTracker {
  private matchId: string | null = null;
  private seen = new Set<string>();
  private latest = 0;
  private ready = false;

  update(
    matchId: string,
    balls: Delivery[],
    live: boolean,
    match?: MatchRow,
    enabled?: Partial<Record<HighlightKind, boolean>>,
  ): TvHighlight[] {
    const changed = this.matchId !== matchId;
    if (changed) {
      this.matchId = matchId;
      this.seen.clear();
      this.ready = false;
    }
    const order = (b: Delivery) => b.innings * 1_000_000 + b.seq;
    const fresh = balls
      .filter((b) => !this.seen.has(b.id) && order(b) > this.latest)
      .sort((a, b) => order(a) - order(b));
    const play = !changed && this.ready && live;
    for (const ball of balls) this.seen.add(ball.id);
    this.latest = Math.max(0, ...balls.map(order));
    this.ready = live;
    return play
      ? fresh
          .map((b) => selectHighlight(b, balls, match, enabled))
          .filter((h): h is TvHighlight => h !== null)
      : [];
  }
}
