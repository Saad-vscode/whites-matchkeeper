import { expect, it } from "vitest";
import { calculateMatchAward } from "./match-award";
import { tournamentSummary } from "./tournament-summary";
import { matchFixture as match, deliveryFixture as ball } from "@/test/tournament-fixtures";

it("uses match-length overs for MOM and series economy bonuses", () => {
  const m = match({ balls_per_over: 4 });
  const ds = [2,2,2,0].map((runs_bat, i) => ball({ id: String(i), seq: i+1, runs_bat, bowler: "Lee" }));
  const award = calculateMatchAward(m, ds);
  expect(award.winners[0]?.name).toBe("Alex");
  expect(award.winners[0]?.points).toBe(12);
  expect(tournamentSummary([m], ds, []).players.find(p => p.name === "Lee")?.points).toBe(8);
});
it("applies SR bonuses per innings and allows a losing-team player", () => {
  const ds = [3,3,3,3,3].map((runs_bat,i) => ball({ id:String(i), seq:i+1, runs_bat }));
  const award = calculateMatchAward(match(), ds);
  expect(award.winners[0]).toMatchObject({ name: "Alex", teamId: "a", points: 38 });
});
it("credits normal/roof catches once and direct, assisted and stumping credits", () => {
  const ds = [
    ball({ id:"1", seq:1, wicket:{kind:"caught",playerOut:"Alex",fielder:"Lee"} }),
    ball({ id:"2", seq:2, wicket:{kind:"stumped",playerOut:"Sam",fielder:"Lee"} }),
    ball({ id:"3", seq:3, wicket:{kind:"run_out",playerOut:"P3",fielder:"Lee",runOutType:"direct"} }),
    ball({ id:"4", seq:4, wicket:{kind:"run_out",playerOut:"P4",fielder:"Lee",assistedBy:"Pat",runOutType:"assisted"} }),
  ];
  const award = calculateMatchAward(match(),ds);
  expect(award.players.find(p => p.name === "Lee")?.fieldingPoints).toBe(18);
  expect(award.players.find(p => p.name === "Pat")?.fieldingPoints).toBe(4);
  expect(award.players.find(p => p.teamId === "b" && p.name === "Alex")?.wickets).toBe(2);
});
it("breaks equal points by runs before wickets", () => {
  const award = calculateMatchAward(match(), [ball({ runs_bat:5, wicket:{kind:"bowled",playerOut:"Alex"}, bowler:"Lee" })]);
  expect(award.winners[0]?.name).toBe("Alex");
});
it("breaks equal points and wickets by runs", () => {
  const award = calculateMatchAward(match(), [ball({ runs_bat:2, wicket:{kind:"run_out",playerOut:"Sam",runOutType:"assisted",fielder:"Lee"} })]);
  expect(award.winners[0]).toMatchObject({name:"Alex",teamId:"a"});
});
it("keeps exact ties shared rather than choosing by name", () => {
  const award = calculateMatchAward(match(), [
    ball({ id:"1",seq:1,runs_bat:2,striker:"Alex" }),
    ball({ id:"2",seq:2,runs_bat:2,striker:"Sam",non_striker:"Alex" }),
  ]);
  expect(award.winners.map(p=>p.name).sort()).toEqual(["Alex","Sam"]);
});
it("does not award an unfinished or empty match", () => {
  expect(calculateMatchAward(match({status:"live"}),[ball()]).winners).toEqual([]);
  expect(calculateMatchAward(match(),[]).winners).toEqual([]);
});
it("excludes group-eliminated players and ordinary matches from series eligibility", () => {
  const group = match({team_a_id:"eliminated"});
  const advanced = match({id:"advanced",team_a_id:"qualified"});
  const ds = [ball({runs_bat:50}),ball({match_id:"advanced",runs_bat:10})];
  const playoff = match({id:"semi",status:"scheduled",team_a_id:"qualified",rules:{tournamentStage:{kind:"other",title:"Semi Final"}}});
  const summary = tournamentSummary([group,advanced,playoff],ds,[]);
  expect(summary.leaderboards.find(b=>b.id==="mvp")?.rows[0]?.player.teamId).toBe("eliminated");
  expect(summary.seriesPlayers[0]?.teamId).toBe("qualified");
  expect(tournamentSummary([group,advanced,{...playoff,team_a_players:[],rules:{tournamentStage:{kind:"other",title:"Semi Final 1"}}}],ds,[]).seriesPlayers[0]?.teamId).toBe("qualified");
  expect(tournamentSummary([group,advanced,{...playoff,status:"cancelled"}],ds,[]).seriesPlayers).toEqual([]);
  expect(tournamentSummary([group,advanced,{...playoff,rules:{tournamentStage:{kind:"other",title:"Match"}}}],ds,[]).seriesPlayers).toEqual([]);
});

it("breaks equal points, runs and wickets by direct run-outs", () => {
  const award = calculateMatchAward(match(), [
    ball({ id: "d", seq: 1, wicket: { kind: "run_out", playerOut: "Alex", fielder: "Direct", assistedBy: "Ignored", runOutType: "direct" } }),
    ball({ id: "a1", seq: 2, wicket: { kind: "run_out", playerOut: "Sam", fielder: "Assist", runOutType: "assisted" } }),
    ball({ id: "a2", seq: 3, wicket: { kind: "run_out", playerOut: "Third", fielder: "Assist", assistedBy: "Assist", runOutType: "assisted" } }),
  ]);
  expect(award.winners.map(p => p.name)).toEqual(["Direct"]);
  expect(award.players.find(p => p.name === "Direct")).toMatchObject({ points: 8, directRunOuts: 1 });
  expect(award.players.find(p => p.name === "Assist")).toMatchObject({ points: 8, directRunOuts: 0 });
  expect(award.players.find(p => p.name === "Ignored")).toBeUndefined();
});
it("awards 28 points for two wickets and a qualifying economy bonus", () => {
  const ds = Array.from({ length: 6 }, (_, i) => ball({
    id: String(i), seq: i + 1, bowler: "Lee",
    wicket: i < 2 ? { kind: "bowled", playerOut: i === 0 ? "Alex" : "Sam" } : null,
  }));
  expect(calculateMatchAward(match(), ds).players.find(p => p.name === "Lee")?.bowlingPoints).toBe(28);
});
