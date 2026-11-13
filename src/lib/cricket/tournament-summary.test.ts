import { describe,expect,it } from "vitest";
import { tournamentSummary } from "./tournament-summary";
import { standings } from "./tournament";
import { deliveryFixture as ball, matchFixture as match, teamFixture } from "@/test/tournament-fixtures";
const teams=[teamFixture("a","Lions"),teamFixture("b","Eagles")];

describe("tournament statistics from engine output",()=>{
  it("keeps same-named opposing players separate and excludes unrelated matches",()=>{
    const result=tournamentSummary([match()], [ball({runs_bat:6}),ball({id:"two",innings:2,runs_bat:4,non_striker:"Lee"}),ball({id:"other",match_id:"another-tournament",runs_bat:6})],teams);
    expect(result.sixes).toBe(1); expect(result.fours).toBe(1);
    expect(result.players.find(p=>p.name==="Alex" && p.teamId==="a")?.runs).toBe(6);
    expect(result.players.find(p=>p.name==="Alex" && p.teamId==="b")?.runs).toBe(4);
    expect(result.leaders[0]?.player?.team).toBe("Lions");
  });
  it("uses bowling credit rules and excludes byes from best bowling conceded runs",()=>{
    const result=tournamentSummary([match()], [
      ball({id:"one",extra_type:"bye",extras:4}),
      ball({id:"two",seq:2,wicket:{kind:"run_out",playerOut:"Sam"}}),
      ball({id:"three",seq:3,runs_bat:1,wicket:{kind:"bowled",playerOut:"Alex"}}),
    ],teams);
    const bowler=result.players.find(p=>p.teamId==="b" && p.name==="Alex");
    expect(bowler?.wickets).toBe(1);expect(bowler?.best).toEqual({wickets:1,runs:1});expect(result.fours).toBe(0);
  });
  it("recomputes after corrections and undo, with no phantom leader",()=>{
    const m=match(); const d=ball({runs_bat:6});
    expect(tournamentSummary([m],[d],teams).sixes).toBe(1);
    expect(tournamentSummary([m],[{...d,runs_bat:4}],teams).fours).toBe(1);
    const empty=tournamentSummary([m],[],teams);
    expect(empty.sixes).toBe(0);expect(empty.leaders.every(l=>l.player===null)).toBe(true);
  });
  it("keeps highest score and best figures per innings, while accumulating totals",()=>{
    const result=tournamentSummary([match(),match({id:"match2"})],[ball({runs_bat:6}),ball({id:"b2",match_id:"match2",runs_bat:4})],teams);
    const player=result.players.find(p=>p.name==="Alex" && p.teamId==="a");
    expect(player?.runs).toBe(10);expect(player?.highest).toBe(6);
  });
  it("counts only completed results and uses full allotted overs for all-out NRR",()=>{
    const ds=[ball({runs_bat:4,wicket:{kind:"bowled",playerOut:"Alex"}}),ball({id:"second",innings:2,non_striker:"Lee",runs_bat:6})];
    const result=tournamentSummary([match()],ds,teams);
    const outcome=result.matches[0]?.outcome;
    expect(outcome?.winner).toBe("B");expect(outcome?.A.balls).toBe(6);expect(outcome?.B.balls).toBe(1);
    const live=tournamentSummary([match({status:"live"})],ds,teams);
    expect(live.matches[0]?.outcome).toBeNull();
  });
  it("awards no-result points without including abandoned innings in NRR",()=>{
    const summary=tournamentSummary([match({status:"abandoned"})],[ball({runs_bat:6})],teams);
    const rows=standings(teams,summary.matches.map(r=>({teamA:r.m.team_a_id,teamB:r.m.team_b_id,outcome:r.outcome,noResult:r.noResult})),{win:2,tie:1,loss:0,noResult:3},6);
    expect(rows.every(r=>r.played===1 && r.noResult===1 && r.points===3 && r.nrr===0)).toBe(true);
  });
  it("filters cross-group results and honors each match's balls per over",()=>{
    const rows=standings(teams,[{teamA:"a",teamB:"b",outcome:{winner:"A",A:{runs:12,balls:4},B:{runs:4,balls:4},ballsPerOver:4}},{teamA:"a",teamB:"outside",outcome:{winner:"A",A:{runs:100,balls:6},B:{runs:0,balls:6}}}],{win:2,tie:1,loss:0},6);
    expect(rows[0]?.points).toBe(2);expect(rows[0]?.nrr).toBe(8);
  });
});
