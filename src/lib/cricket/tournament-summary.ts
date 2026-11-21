import type { Tables } from "@/integrations/supabase/types";
import { computeInnings, countsAsWicket, deliveryRuns, isLegal, type Delivery } from "./engine";
import { battingSide, configOf, derive, type MatchRow } from "./match";
import { matchOutcome } from "./tournament";
import { matchStageTitle } from "./match-stage";

export type TournamentDelivery = Delivery & { match_id: string };
export type TournamentTeam = Tables<"tournament_teams">;
export interface TournamentPlayer {
  name: string;
  teamId: string;
  team: string;
  runs: number;
  wickets: number;
  directRunOuts: number;
  fours: number;
  sixes: number;
  highest: number;
  balls: number;
  battingInnings: number;
  dismissals: number;
  bowlingInnings: number;
  conceded: number;
  bowlingOvers: number;
  matches: number;
  battingPoints: number;
  bowlingPoints: number;
  fieldingPoints: number;
  points: number;
  best: { wickets: number; runs: number } | null;
}
export interface Partnership {
  id: string;
  matchId: string;
  teamId: string;
  team: string;
  names: string[];
  runs: number;
  balls: number;
}
export const battingStrikeRate = (p: TournamentPlayer) => (p.balls ? (p.runs / p.balls) * 100 : 0);
export const battingAverage = (p: TournamentPlayer) =>
  p.dismissals ? p.runs / p.dismissals : Infinity;
export const bowlingEconomy = (p: TournamentPlayer) =>
  p.bowlingOvers ? p.conceded / p.bowlingOvers : Infinity;
const bowlingAverage = (p: TournamentPlayer) => (p.wickets ? p.conceded / p.wickets : Infinity);
export const compareRuns = (a: TournamentPlayer, b: TournamentPlayer) =>
  b.runs - a.runs ||
  battingStrikeRate(b) - battingStrikeRate(a) ||
  b.highest - a.highest ||
  a.battingInnings - b.battingInnings;
export const compareWickets = (a: TournamentPlayer, b: TournamentPlayer) =>
  b.wickets - a.wickets ||
  bowlingEconomy(a) - bowlingEconomy(b) ||
  bowlingAverage(a) - bowlingAverage(b) ||
  a.bowlingInnings - b.bowlingInnings;
export const compareMvp = (a: TournamentPlayer, b: TournamentPlayer) =>
  b.points - a.points ||
  b.points / Math.max(1, b.matches) - a.points / Math.max(1, a.matches) ||
  b.runs - a.runs ||
  b.wickets - a.wickets ||
  b.directRunOuts - a.directRunOuts;

/** Read-only aggregation of engine output; no calculated totals are persisted. */
export function tournamentSummary(
  matches: MatchRow[],
  deliveries: TournamentDelivery[],
  teams: TournamentTeam[],
) {
  const byMatch = new Map<string, TournamentDelivery[]>();
  for (const d of deliveries) {
    const list = byMatch.get(d.match_id) ?? [];
    list.push(d);
    byMatch.set(d.match_id, list);
  }
  const players = new Map<string, TournamentPlayer>();
  const appearances = new Map<TournamentPlayer, Set<string>>();
  const partnerships: Partnership[] = [];
  let uncreditedFielding = 0;
  const fieldingIssues: { matchId: string; match: string; innings: number; ball: number; reason: string }[] = [];
  const getPlayer = (m: MatchRow, side: "A" | "B", name: string) => {
    const id = (side === "A" ? m.team_a_id : m.team_b_id) ?? `${m.id}:${side}`;
    const key = JSON.stringify([id, name]);
    let p = players.get(key);
    if (!p) {
      p = {
        name,
        teamId: id,
        team: teams.find((t) => t.id === id)?.name ?? (side === "A" ? m.team_a : m.team_b),
        runs: 0,
        wickets: 0,
        directRunOuts: 0,
        fours: 0,
        sixes: 0,
        highest: 0,
        balls: 0,
        battingInnings: 0,
        dismissals: 0,
        bowlingInnings: 0,
        conceded: 0,
        bowlingOvers: 0,
        matches: 0,
        battingPoints: 0,
        bowlingPoints: 0,
        fieldingPoints: 0,
        points: 0,
        best: null,
      };
      players.set(key, p);
    }
    return p;
  };
  const appear = (p: TournamentPlayer, id: string) => {
    const ids = appearances.get(p) ?? new Set<string>();
    ids.add(id);
    appearances.set(p, ids);
    p.matches = ids.size;
  };
  const matchRows = matches.map((m) => {
    const balls = byMatch.get(m.id) ?? [];
    const derived = derive(m, balls);
    if (m.status !== "cancelled" && balls.length) {
      // Match squads are the available participation record, including zero-point players.
      for (const side of ["A", "B"] as const)
        for (const name of side === "A" ? m.team_a_players : m.team_b_players)
          if (name) appear(getPlayer(m, side, name), m.id);
      for (const innings of [1, 2] as const) {
        const side = battingSide(m, innings);
        if (!side) continue;
        const ds = balls.filter((d) => d.innings === innings).sort((a, b) => a.seq - b.seq);
        const state = computeInnings(
          ds,
          configOf(m),
          innings === 2 ? derived.first.runs + 1 : null,
        );
        for (const b of state.batters) {
          if (!b.name) continue;
          const p = getPlayer(m, side, b.name);
          appear(p, m.id);
          p.runs += b.runs;
          p.balls += b.balls;
          p.battingInnings++;
          p.fours += b.fours;
          p.sixes += b.sixes;
          p.highest = Math.max(p.highest, b.runs);
          if (countsAsWicket(b.out)) p.dismissals++;
          const sr = b.balls ? (b.runs / b.balls) * 100 : 0;
          const bonus =
            b.balls >= 5 && b.runs >= 10 ? (sr >= 250 ? 8 : sr >= 200 ? 5 : sr >= 150 ? 3 : 0) : 0;
          p.battingPoints += b.runs * 2 + bonus;
        }
        const bowlingSide = side === "A" ? "B" : "A";
        for (const b of state.bowlers) {
          if (!b.name || !ds.some((d) => d.bowler === b.name && d.extra_type !== "penalty"))
            continue;
          const p = getPlayer(m, bowlingSide, b.name);
          appear(p, m.id);
          p.wickets += b.wickets;
          p.bowlingInnings++;
          p.conceded += b.runs;
          p.bowlingOvers += b.balls / m.balls_per_over;
          const er = b.balls ? (b.runs / b.balls) * m.balls_per_over : Infinity;
          const bonus = b.balls >= m.balls_per_over ? (er <= 6 ? 8 : er <= 9 ? 5 : 0) : 0;
          p.bowlingPoints += b.wickets * 10 + bonus;
          if (
            !p.best ||
            b.wickets > p.best.wickets ||
            (b.wickets === p.best.wickets && b.runs < p.best.runs)
          )
            p.best = { wickets: b.wickets, runs: b.runs };
        }
        const issue = (d: TournamentDelivery, reason: string) => {
          uncreditedFielding++;
          fieldingIssues.push({ matchId: m.id, match: `${m.team_a} vs ${m.team_b}`, innings, ball: d.seq, reason });
        };
        const field = (name: string | null | undefined, points: number, d: TournamentDelivery) => {
          if (!name) {
            issue(d, "Fielder missing");
            return;
          }
          const p = getPlayer(m, bowlingSide, name);
          appear(p, m.id);
          p.fieldingPoints += points;
        };
        for (const d of ds) {
          const w = d.wicket;
          if (!w) continue;
          if (w.kind === "caught" || w.kind === "stumped") field(w.fielder, 3, d);
          if (w.kind === "run_out") {
            if (w.runOutType === "direct") {
              field(w.fielder, 8, d);
              if (w.fielder) getPlayer(m, bowlingSide, w.fielder).directRunOuts++;
            }
            else if (w.runOutType === "assisted") {
              field(w.fielder, 4, d);
              if (w.assistedBy && w.assistedBy !== w.fielder) field(w.assistedBy, 4, d);
            } else issue(d, "Run-out type missing");
          }
        }
        let partnership: Partnership | null = null;
        for (const d of ds) {
          const names = [...new Set([d.striker, d.non_striker].filter(Boolean))].sort();
          if (!partnership || JSON.stringify(partnership.names) !== JSON.stringify(names)) {
            partnership = {
              id: `${m.id}:${innings}:${d.seq}`,
              matchId: m.id,
              teamId: (side === "A" ? m.team_a_id : m.team_b_id) ?? m.id + side,
              team: side === "A" ? m.team_a : m.team_b,
              names,
              runs: 0,
              balls: 0,
            };
            if (names.length === 2) partnerships.push(partnership);
          }
          partnership.runs += deliveryRuns(d);
          if (isLegal(d)) partnership.balls++;
          if (d.wicket) partnership = null;
        }
      }
    }
    return {
      m,
      derived,
      outcome: m.status === "completed" ? matchOutcome(m, balls) : null,
      noResult: m.status === "abandoned",
    };
  });
  const list = [...players.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.teamId.localeCompare(b.teamId),
  );
  for (const p of list) p.points = p.battingPoints + p.bowlingPoints + p.fieldingPoints;
  const ranked = (
    filter: (p: TournamentPlayer) => boolean,
    compare: (a: TournamentPlayer, b: TournamentPlayer) => number,
  ) =>
    list
      .filter(filter)
      .sort(
        (a, b) => compare(a, b) || a.name.localeCompare(b.name) || a.teamId.localeCompare(b.teamId),
      );
  const rankings = {
    runs: ranked((p) => p.runs > 0, compareRuns),
    wickets: ranked((p) => p.wickets > 0, compareWickets),
    highest: ranked(
      (p) => p.highest > 0,
      (a, b) => b.highest - a.highest,
    ),
    best: ranked(
      (p) => !!p.best,
      (a, b) => b.best!.wickets - a.best!.wickets || a.best!.runs - b.best!.runs,
    ),
    sixes: ranked(
      (p) => p.sixes > 0,
      (a, b) => b.sixes - a.sixes,
    ),
    fours: ranked(
      (p) => p.fours > 0,
      (a, b) => b.fours - a.fours,
    ),
    strikeRate: ranked(
      (p) => p.balls > 0,
      (a, b) => battingStrikeRate(b) - battingStrikeRate(a) || b.runs - a.runs,
    ),
    average: ranked(
      (p) => p.dismissals > 0,
      (a, b) => battingAverage(b) - battingAverage(a) || b.runs - a.runs,
    ),
    economy: ranked(
      (p) => p.bowlingOvers > 0,
      (a, b) => bowlingEconomy(a) - bowlingEconomy(b) || b.wickets - a.wickets,
    ),
    mvp: ranked((p) => p.points > 0, compareMvp),
  };
  const categories = [
    { id: "runs", label: "Most Runs", value: (p: TournamentPlayer) => String(p.runs) },
    { id: "wickets", label: "Most Wickets", value: (p: TournamentPlayer) => String(p.wickets) },
    {
      id: "highest",
      label: "Highest Individual Score",
      value: (p: TournamentPlayer) => String(p.highest),
    },
    {
      id: "best",
      label: "Best Bowling Figures",
      value: (p: TournamentPlayer) => `${p.best!.wickets}/${p.best!.runs}`,
    },
    { id: "sixes", label: "Most Sixes", value: (p: TournamentPlayer) => String(p.sixes) },
    { id: "fours", label: "Most Fours", value: (p: TournamentPlayer) => String(p.fours) },
    {
      id: "strikeRate",
      label: "Batting Strike Rate",
      value: (p: TournamentPlayer) => battingStrikeRate(p).toFixed(2),
    },
    {
      id: "average",
      label: "Batting Average",
      value: (p: TournamentPlayer) => battingAverage(p).toFixed(2),
    },
    {
      id: "economy",
      label: "Best Economy",
      value: (p: TournamentPlayer) => bowlingEconomy(p).toFixed(2),
    },
    { id: "mvp", label: "MVP", value: (p: TournamentPlayer) => String(p.points) },
  ] as const;
  const leaderboards = categories.map((c) => ({
    id: c.id,
    label: c.label,
    rows: rankings[c.id].map((p) => ({ player: p, value: c.value(p) })),
  }));
  partnerships.sort((a, b) => b.runs - a.runs || a.balls - b.balls || a.id.localeCompare(b.id));
  // Selection in a knockout/qualifying fixture establishes advancement, even
  // before that fixture starts. Ordinary friendlies do not establish eligibility.
  const advancedTeams = new Set(matches.filter(m =>
    m.status !== "cancelled" && /^(Qualifier|Eliminator|Knockout|Quarter Final|Semi Final|Final)( \d+)?$/i.test(matchStageTitle(m.rules) ?? ""),
  ).flatMap(m => [m.team_a_id,m.team_b_id]).filter(Boolean));
  const seriesCandidates = rankings.mvp.filter(p => advancedTeams.has(p.teamId));
  const mvp = seriesCandidates[0];
  return {
    matches: matchRows,
    players: list,
    leaderboards,
    partnerships,
    uncreditedFielding,
    fieldingIssues,
    seriesPlayers: mvp ? seriesCandidates.filter((p) => compareMvp(p, mvp) === 0) : [],
    fours: list.reduce((sum, p) => sum + p.fours, 0),
    sixes: list.reduce((sum, p) => sum + p.sixes, 0),
    leaders: leaderboards.map((board) => ({
      id: board.id,
      label: board.label,
      value: board.rows[0]?.value ?? "0",
      player: board.rows[0]?.player ?? null,
    })),
  };
}
