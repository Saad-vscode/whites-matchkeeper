// Pure cricket scoring engine. All match numbers are derived from the delivery log.

export type ExtraType = "none" | "wide" | "noball" | "bye" | "legbye" | "penalty";
export type DismissalKind =
  | "bowled"
  | "caught"
  | "lbw"
  | "stumped"
  | "hit_wicket"
  | "run_out"
  | "retired_out"
  | "retired_hurt"
  | "obstructing";

export interface Wicket {
  kind: DismissalKind;
  playerOut: string;
  fielder?: string | null;
}

export interface Delivery {
  id: string;
  innings: 1 | 2;
  seq: number;
  striker: string;
  non_striker: string;
  bowler: string;
  runs_bat: number;
  extra_type: ExtraType;
  extras: number;
  wicket: Wicket | null;
}

export interface Rules {
  wideRuns: number; // base penalty for a wide
  noBallRuns: number; // base penalty for a no ball
  lastManBats: boolean;
  maxOversPerBowler: number | null;
}

export const DEFAULT_RULES: Rules = {
  wideRuns: 1,
  noBallRuns: 1,
  lastManBats: false,
  maxOversPerBowler: null,
};

export interface MatchConfig {
  overs: number;
  ballsPerOver: number;
  playersPerTeam: number;
  rules: Rules;
}

export function normalizeRules(raw: unknown): Rules {
  const r = (raw ?? {}) as Partial<Rules>;
  return {
    wideRuns: Number.isFinite(r.wideRuns) ? Number(r.wideRuns) : 1,
    noBallRuns: Number.isFinite(r.noBallRuns) ? Number(r.noBallRuns) : 1,
    lastManBats: !!r.lastManBats,
    maxOversPerBowler:
      r.maxOversPerBowler != null && Number(r.maxOversPerBowler) > 0
        ? Number(r.maxOversPerBowler)
        : null,
  };
}

export const isLegal = (d: Pick<Delivery, "extra_type">) =>
  d.extra_type !== "wide" && d.extra_type !== "noball";

/** Total runs added to team score by a delivery. */
export const deliveryRuns = (d: Delivery) => d.runs_bat + d.extras;

/** Runs physically completed between the wickets (drives strike rotation). */
export function runsRan(d: Delivery, rules: Rules): number {
  switch (d.extra_type) {
    case "wide":
      return Math.max(0, d.extras - rules.wideRuns);
    case "bye":
    case "legbye":
      return d.extras;
    case "penalty":
      return 0;
    case "noball":
      return d.runs_bat + Math.max(0, d.extras - rules.noBallRuns);
    default:
      return d.runs_bat;
  }
}

const BOWLER_WICKETS: DismissalKind[] = ["bowled", "caught", "lbw", "stumped", "hit_wicket"];
export const countsAsWicket = (w: Wicket | null) => !!w && w.kind !== "retired_hurt";
export const creditsBowler = (w: Wicket | null) => !!w && BOWLER_WICKETS.includes(w.kind);

export function formatOvers(legalBalls: number, ballsPerOver: number) {
  return `${Math.floor(legalBalls / ballsPerOver)}.${legalBalls % ballsPerOver}`;
}

export interface BatterLine {
  name: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  out: Wicket | null;
  bowler?: string;
}
export interface BowlerLine {
  name: string;
  balls: number;
  runs: number;
  wickets: number;
  wides: number;
  noBalls: number;
}

export interface InningsState {
  runs: number;
  wickets: number;
  legalBalls: number;
  extras: { wide: number; noball: number; bye: number; legbye: number; penalty: number; total: number };
  batters: BatterLine[];
  bowlers: BowlerLine[];
  currentOver: Delivery[];
  /** Who should be on strike / non-strike / bowling next, null when a selection is required. */
  next: { striker: string | null; nonStriker: string | null; overComplete: boolean; lastBowler: string | null };
  complete: boolean;
  endReason: "overs" | "all_out" | "target" | null;
}

export const maxWickets = (cfg: MatchConfig) =>
  cfg.rules.lastManBats ? cfg.playersPerTeam : cfg.playersPerTeam - 1;

export function computeInnings(deliveries: Delivery[], cfg: MatchConfig, target: number | null): InningsState {
  const sorted = [...deliveries].sort((a, b) => a.seq - b.seq);
  const s: InningsState = {
    runs: 0,
    wickets: 0,
    legalBalls: 0,
    extras: { wide: 0, noball: 0, bye: 0, legbye: 0, penalty: 0, total: 0 },
    batters: [],
    bowlers: [],
    currentOver: [],
    next: { striker: null, nonStriker: null, overComplete: false, lastBowler: null },
    complete: false,
    endReason: null,
  };
  const bat = (n: string) => {
    let b = s.batters.find((x) => x.name === n);
    if (!b) {
      b = { name: n, runs: 0, balls: 0, fours: 0, sixes: 0, out: null };
      s.batters.push(b);
    }
    return b;
  };
  const bowl = (n: string) => {
    let b = s.bowlers.find((x) => x.name === n);
    if (!b) {
      b = { name: n, balls: 0, runs: 0, wickets: 0, wides: 0, noBalls: 0 };
      s.bowlers.push(b);
    }
    return b;
  };

  let ballsInOver = 0;
  for (const d of sorted) {
    if (ballsInOver === 0) s.currentOver = [];
    const legal = isLegal(d);
    const striker = bat(d.striker);
    bat(d.non_striker);
    const bowler = bowl(d.bowler);

    s.runs += deliveryRuns(d);
    if (d.extra_type !== "none") {
      s.extras[d.extra_type] += d.extras;
      s.extras.total += d.extras;
    }
    striker.runs += d.runs_bat;
    if (d.runs_bat === 4) striker.fours++;
    if (d.runs_bat === 6) striker.sixes++;
    if (d.extra_type !== "wide") striker.balls++;

    bowler.runs += d.runs_bat;
    if (d.extra_type === "wide") {
      bowler.runs += d.extras;
      bowler.wides++;
    } else if (d.extra_type === "noball") {
      bowler.runs += d.extras;
      bowler.noBalls++;
    }
    if (legal) {
      bowler.balls++;
      s.legalBalls++;
      ballsInOver++;
    }
    s.currentOver.push(d);

    // strike rotation
    let onStrike: string | null = d.striker;
    let offStrike: string | null = d.non_striker;
    if (runsRan(d, cfg.rules) % 2 === 1) [onStrike, offStrike] = [offStrike, onStrike];

    if (d.wicket) {
      const outB = bat(d.wicket.playerOut);
      outB.out = d.wicket;
      outB.bowler = d.bowler;
      if (countsAsWicket(d.wicket)) s.wickets++;
      if (creditsBowler(d.wicket)) bowler.wickets++;
      if (onStrike === d.wicket.playerOut) onStrike = null;
      if (offStrike === d.wicket.playerOut) offStrike = null;
    }

    const overDone = legal && ballsInOver === cfg.ballsPerOver;
    if (overDone) {
      [onStrike, offStrike] = [offStrike, onStrike];
      ballsInOver = 0;
    }
    s.next = { striker: onStrike, nonStriker: offStrike, overComplete: overDone, lastBowler: d.bowler };
  }

  // Last-man batting: a lone batter keeps strike.
  if (cfg.rules.lastManBats && s.wickets === cfg.playersPerTeam - 1) {
    const alone = s.next.striker ?? s.next.nonStriker;
    s.next.striker = alone;
    s.next.nonStriker = null;
  }

  if (target != null && s.runs >= target) {
    s.complete = true;
    s.endReason = "target";
  } else if (s.wickets >= maxWickets(cfg)) {
    s.complete = true;
    s.endReason = "all_out";
  } else if (s.legalBalls >= cfg.overs * cfg.ballsPerOver) {
    s.complete = true;
    s.endReason = "overs";
  }
  return s;
}

export function bowlerOversUsed(state: InningsState, name: string) {
  return state.bowlers.find((b) => b.name === name)?.balls ?? 0;
}

/** Returns an error message when the bowler may not bowl the next over, else null. */
export function bowlerEligibility(state: InningsState, cfg: MatchConfig, name: string): string | null {
  if (state.next.overComplete && state.next.lastBowler === name)
    return "A bowler cannot bowl two overs in a row.";
  const max = cfg.rules.maxOversPerBowler;
  if (max != null && bowlerOversUsed(state, name) >= max * cfg.ballsPerOver)
    return `${name} has already bowled the maximum ${max} overs.`;
  return null;
}

export const runRate = (runs: number, legalBalls: number, bpo: number) =>
  legalBalls === 0 ? 0 : (runs / legalBalls) * bpo;

export function requiredRunRate(target: number, s: InningsState, cfg: MatchConfig) {
  const left = cfg.overs * cfg.ballsPerOver - s.legalBalls;
  const need = target - s.runs;
  if (left <= 0) return null;
  return (need / left) * cfg.ballsPerOver;
}

export function matchResult(
  first: InningsState,
  second: InningsState,
  cfg: MatchConfig,
  firstName: string,
  secondName: string,
): string | null {
  if (!first.complete || !second.complete) return null;
  if (second.runs > first.runs) {
    const w = maxWickets(cfg) - second.wickets;
    return `${secondName} won by ${w} wicket${w === 1 ? "" : "s"}`;
  }
  if (first.runs > second.runs) {
    const r = first.runs - second.runs;
    return `${firstName} won by ${r} run${r === 1 ? "" : "s"}`;
  }
  return "Match tied";
}

export const strikeRate = (runs: number, balls: number) => (balls ? (runs / balls) * 100 : 0);
export const economy = (runs: number, balls: number, bpo: number) => (balls ? (runs / balls) * bpo : 0);

export function ballLabel(d: Delivery): string {
  const w = countsAsWicket(d.wicket) ? "W" : "";
  switch (d.extra_type) {
    case "wide":
      return `${d.extras}wd${w ? "+W" : ""}`;
    case "noball":
      return `${d.runs_bat + d.extras}nb${w ? "+W" : ""}`;
    case "bye":
      return `${d.extras}b${w ? "+W" : ""}`;
    case "legbye":
      return `${d.extras}lb${w ? "+W" : ""}`;
    case "penalty":
      return `${d.extras}p`;
    default:
      return w ? (d.runs_bat ? `${d.runs_bat}+W` : "W") : String(d.runs_bat);
  }
}
