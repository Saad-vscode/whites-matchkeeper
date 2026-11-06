import { countsAsWicket, creditsBowler, isLegal, type Delivery, type MatchConfig } from "./engine";

const sorted = (ds: Delivery[]) => [...ds].sort((a, b) => a.seq - b.seq);

export interface FallOfWicket { n: number; player: string; score: number; over: string }
export function fallOfWickets(ds: Delivery[], bpo: number): FallOfWicket[] {
  let runs = 0, legal = 0;
  const out: FallOfWicket[] = [];
  for (const d of sorted(ds)) {
    runs += d.runs_bat + d.extras;
    if (isLegal(d)) legal++;
    if (d.wicket && countsAsWicket(d.wicket)) out.push({ n: out.length + 1, player: d.wicket.playerOut, score: runs, over: `${Math.floor(legal / bpo)}.${legal % bpo}` });
  }
  return out;
}

/** Maidens per bowler: complete overs where the bowler conceded nothing. */
export function maidens(ds: Delivery[], bpo: number): Record<string, number> {
  const res: Record<string, number> = {};
  let legal = 0, conceded = 0, bowler = "";
  for (const d of sorted(ds)) {
    bowler = d.bowler;
    conceded += d.runs_bat + (d.extra_type === "wide" || d.extra_type === "noball" ? d.extras : 0);
    if (isLegal(d)) legal++;
    if (legal === bpo) {
      if (conceded === 0) res[bowler] = (res[bowler] ?? 0) + 1;
      legal = 0; conceded = 0;
    }
  }
  return res;
}

export function describeBall(d: Delivery): string {
  const parts: string[] = [];
  if (d.wicket) {
    const k = d.wicket.kind.replace(/_/g, " ");
    const label = k.charAt(0).toUpperCase() + k.slice(1);
    parts.push(d.wicket.kind === "caught" && d.wicket.fielder ? `Caught by ${d.wicket.fielder}. ${d.wicket.playerOut} is out.` : `${label}. ${d.wicket.playerOut} is out.`);
  }
  if (d.extra_type === "wide") parts.push(`Wide, ${d.extras} run${d.extras === 1 ? "" : "s"}.`);
  else if (d.extra_type === "noball") parts.push(`No ball${d.runs_bat ? `, ${d.runs_bat} off the bat` : ""}.`);
  else if (d.extra_type === "bye") parts.push(`${d.extras} bye${d.extras === 1 ? "" : "s"}.`);
  else if (d.extra_type === "legbye") parts.push(`${d.extras} leg bye${d.extras === 1 ? "" : "s"}.`);
  else if (d.extra_type === "penalty") parts.push(`${d.extras} penalty runs.`);
  else if (!d.wicket || d.runs_bat) {
    const r = d.runs_bat;
    parts.push(r === 0 ? "Dot ball." : r === 1 ? "Single run." : r === 4 ? "FOUR!" : r === 6 ? "SIX!" : `${r} runs.`);
  }
  return parts.join(" ");
}

export interface OverGroup {
  over: number; // 1-based
  balls: { d: Delivery; label: string }[]; // label like 3.4
  runs: number; scoreAfter: number; wicketsAfter: number;
  bowler: string; batters: string[];
}
/** Groups deliveries into overs, oldest first, with running score. */
export function overGroups(ds: Delivery[], bpo: number): OverGroup[] {
  const groups: OverGroup[] = [];
  let legal = 0, score = 0, wk = 0, cur: OverGroup | null = null;
  for (const d of sorted(ds)) {
    const overIdx = Math.floor(legal / bpo);
    if (!cur || cur.over !== overIdx + 1) {
      cur = { over: overIdx + 1, balls: [], runs: 0, scoreAfter: 0, wicketsAfter: 0, bowler: d.bowler, batters: [] };
      groups.push(cur);
    }
    if (isLegal(d)) legal++;
    const inOver = legal - overIdx * bpo;
    cur.balls.push({ d, label: `${overIdx}.${isLegal(d) ? inOver : Math.min(inOver + 1, bpo)}` });
    cur.runs += d.runs_bat + d.extras;
    score += d.runs_bat + d.extras;
    if (countsAsWicket(d.wicket)) wk++;
    cur.scoreAfter = score; cur.wicketsAfter = wk;
    for (const b of [d.striker, d.non_striker]) if (!cur.batters.includes(b)) cur.batters.push(b);
  }
  return groups;
}

export interface PlayerTotals { name: string; team: string; runs: number; balls: number; fours: number; sixes: number; wickets: number; conceded: number; bestRuns: number; }
/** Tournament-wide player totals from many matches' deliveries. teamOf maps (matchId, player) to team name. */
export function playerTotals(ds: (Delivery & { match_id: string })[], teamOf: (matchId: string, player: string) => string) {
  const map = new Map<string, PlayerTotals>();
  const inns = new Map<string, number>(); // match|innings|player -> runs
  const bowl = new Map<string, { w: number; r: number }>();
  const get = (mid: string, n: string) => {
    const key = `${teamOf(mid, n)}|${n}`;
    let p = map.get(key);
    if (!p) { p = { name: n, team: teamOf(mid, n), runs: 0, balls: 0, fours: 0, sixes: 0, wickets: 0, conceded: 0, bestRuns: 0 }; map.set(key, p); }
    return p;
  };
  for (const d of ds) {
    const b = get(d.match_id, d.striker);
    b.runs += d.runs_bat;
    if (d.extra_type !== "wide") b.balls++;
    if (d.runs_bat === 4) b.fours++;
    if (d.runs_bat === 6) b.sixes++;
    const ik = `${d.match_id}|${d.innings}|${b.team}|${b.name}`;
    inns.set(ik, (inns.get(ik) ?? 0) + d.runs_bat);
    b.bestRuns = Math.max(b.bestRuns, inns.get(ik)!);
    const bw = get(d.match_id, d.bowler);
    const c = d.runs_bat + (d.extra_type === "wide" || d.extra_type === "noball" ? d.extras : 0);
    bw.conceded += c;
    const bk = `${d.match_id}|${d.innings}|${bw.team}|${bw.name}`;
    const cur = bowl.get(bk) ?? { w: 0, r: 0 };
    cur.r += c;
    if (creditsBowler(d.wicket)) { bw.wickets++; cur.w++; }
    bowl.set(bk, cur);
  }
  let bestBowl: { name: string; team: string; w: number; r: number } | null = null;
  for (const [k, v] of bowl) {
    const [, , team, name] = k.split("|");
    if (!bestBowl || v.w > bestBowl.w || (v.w === bestBowl.w && v.r < bestBowl.r)) bestBowl = { name, team, ...v };
  }
  return { players: [...map.values()], bestBowl };
}

export const formatLabel = (cfg: Pick<MatchConfig, "overs">) => `T${cfg.overs}`;
