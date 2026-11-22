// Pure tournament standings, derived from each match's delivery log.
import type { Delivery } from "./engine";
import { battingSide, derive, type MatchRow } from "./match";

export interface PointsRules {
  win: number;
  tie: number;
  loss: number;
  noResult?: number;
}

export interface Outcome {
  winner: "A" | "B" | "tie";
  /** runs scored and legal balls faced by each side (all-out counts as the full quota) */
  A: { runs: number; balls: number };
  B: { runs: number; balls: number };
  ballsPerOver?: number;
}

/** Result of a finished match, or null while it is still in progress / not started. */
export function matchOutcome(m: MatchRow, deliveries: Delivery[]): Outcome | null {
  if (!m.toss_winner) return null;
  const d = derive(m, deliveries);
  if (!d.first.complete || !d.second.complete || !d.winner) return null;
  const s1 = battingSide(m, 1);
  if (!s1) return null;
  const s2 = s1 === "A" ? "B" : "A";
  const quota = m.overs * m.balls_per_over;
  const balls = (st: typeof d.first) => (st.endReason === "all_out" ? quota : st.legalBalls);
  const out = {} as Outcome;
  out[s1] = { runs: d.first.runs, balls: balls(d.first) };
  out[s2] = { runs: d.second.runs, balls: balls(d.second) };
  out.winner = d.winner;
  out.ballsPerOver = m.balls_per_over;
  return out;
}

export interface TeamRef {
  id: string;
  name: string;
}
export interface StandingRow {
  teamId: string;
  name: string;
  played: number;
  won: number;
  lost: number;
  tied: number;
  noResult: number;
  points: number;
  runsFor: number;
  ballsFaced: number;
  runsAgainst: number;
  ballsBowled: number;
  nrr: number;
}

export function standings(
  teams: TeamRef[],
  results: {
    teamA: string | null;
    teamB: string | null;
    outcome: Outcome | null;
    noResult?: boolean;
  }[],
  pts: PointsRules,
  ballsPerOver: number,
  ranking = "points_nrr_wins",
): StandingRow[] {
  const rows = new Map<string, StandingRow>(
    teams.map((t) => [
      t.id,
      {
        teamId: t.id,
        name: t.name,
        played: 0,
        won: 0,
        lost: 0,
        tied: 0,
        noResult: 0,
        points: 0,
        runsFor: 0,
        ballsFaced: 0,
        runsAgainst: 0,
        ballsBowled: 0,
        nrr: 0,
      },
    ]),
  );
  const overs = new Map<string, { faced: number; bowled: number }>();
  for (const r of results) {
    if ((!r.outcome && !r.noResult) || !r.teamA || !r.teamB) continue;
    const a = rows.get(r.teamA);
    const b = rows.get(r.teamB);
    if (!a || !b) continue;
    if (r.noResult) {
      for (const row of [a, b]) {
        row.played++;
        row.noResult++;
        row.points += pts.noResult ?? pts.tie;
      }
      continue;
    }
    const o = r.outcome;
    if (!o) continue;
    for (const [row, me, opp, side] of [
      [a, o.A, o.B, "A"],
      [b, o.B, o.A, "B"],
    ] as const) {
      row.played++;
      row.runsFor += me.runs;
      row.ballsFaced += me.balls;
      row.runsAgainst += opp.runs;
      row.ballsBowled += opp.balls;
      const rate = overs.get(row.teamId) ?? { faced: 0, bowled: 0 };
      rate.faced += me.balls / (o.ballsPerOver ?? ballsPerOver);
      rate.bowled += opp.balls / (o.ballsPerOver ?? ballsPerOver);
      overs.set(row.teamId, rate);
      if (o.winner === "tie") {
        row.tied++;
        row.points += pts.tie;
      } else if (o.winner === side) {
        row.won++;
        row.points += pts.win;
      } else {
        row.lost++;
        row.points += pts.loss;
      }
    }
  }
  const list = [...rows.values()];
  for (const r of list) {
    const rate = overs.get(r.teamId);
    const forRate = rate?.faced ? r.runsFor / rate.faced : 0;
    const agRate = rate?.bowled ? r.runsAgainst / rate.bowled : 0;
    r.nrr = forRate - agRate;
  }
  return list.sort(
    (x, y) =>
      y.points - x.points ||
      (ranking === "points_wins_nrr"
        ? y.won - x.won || y.nrr - x.nrr
        : y.nrr - x.nrr || y.won - x.won) ||
      x.name.localeCompare(y.name),
  );
}
