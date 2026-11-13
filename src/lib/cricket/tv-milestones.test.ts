import { expect, it } from "vitest";
import { deliveryFixture, matchFixture } from "@/test/tournament-fixtures";
import { highlightCandidates, selectHighlight, type HighlightKind } from "./tv-highlights";
import type { Delivery } from "./engine";
const match=matchFixture({overs:20,balls_per_over:4,players_per_team:11,status:"live",live:{innings:1}});
const ball=(seq:number,patch:Partial<Delivery>={})=>deliveryFixture({id:String(seq),seq,bowler:"Lee",...patch});
const kinds=(balls:Delivery[])=>highlightCandidates(balls.at(-1)!,balls,match).map(x=>x.kind);
it("recognises three consecutive sixes for one batter, once per streak",()=>{
  const balls=[ball(1,{runs_bat:6}),ball(2,{runs_bat:6}),ball(3,{runs_bat:6})];
  expect(kinds(balls)).toContain("triple_six");
  expect(kinds([...balls,ball(4,{runs_bat:6})])).not.toContain("triple_six");
  expect(kinds([balls[0]!,ball(2,{runs_bat:0}),balls[2]!])).not.toContain("triple_six");
});
it("distinguishes a first-ball golden duck, a duck and a non-striker run out",()=>{
  const out=ball(2,{wicket:{kind:"bowled",playerOut:"Alex"}});
  expect(kinds([out])).toContain("golden_duck");
  expect(kinds([ball(1),out])).toContain("duck");
  expect(kinds([ball(1),out])).not.toContain("golden_duck");
  expect(kinds([ball(1,{wicket:{kind:"run_out",playerOut:"Sam"}})])).toEqual(expect.arrayContaining(["duck","run_out"]));
  expect(kinds([ball(1,{wicket:{kind:"retired_hurt",playerOut:"Alex"}})])).not.toContain("duck");
});
it("counts bowler wickets across overs, skips illegal balls and excludes run-outs",()=>{
  const wicket=(seq:number)=>ball(seq,{wicket:{kind:"caught",playerOut:`Player ${seq}`}});
  const balls=[wicket(1),ball(2,{extra_type:"wide",extras:1}),wicket(3)];
  expect(kinds(balls)).toContain("hat_chance");
  expect(kinds([...balls,ball(4,{bowler:"Other"}),wicket(5)])).toContain("hat_trick");
  expect(kinds([wicket(1),ball(2,{wicket:{kind:"run_out",playerOut:"Alex"}}),wicket(3)])).not.toContain("hat_trick");
});
it("requires a complete custom-length over with no runs charged to the bowler",()=>{
  const dots=[ball(1),ball(2),ball(3),ball(4)];
  expect(kinds(dots.slice(0,3))).not.toContain("maiden");
  expect(highlightCandidates(dots[3]!,dots,match).find(x=>x.kind==="maiden")?.dots).toBe(4);
  expect(kinds([ball(0,{extra_type:"wide",extras:1}),...dots])).not.toContain("maiden");
  expect(kinds([ball(1,{extra_type:"bye",extras:1}),...dots.slice(1)])).toContain("maiden");
});
it("celebrates fifty only when crossing the milestone",()=>{
  const before=[ball(1,{runs_bat:48})], fifty=ball(2,{runs_bat:4});
  expect(kinds([...before,fifty])).toContain("fifty");
  expect(kinds([...before,fifty,ball(3,{runs_bat:4})])).not.toContain("fifty");
});
it("recognises a winning boundary only on the delivery that reaches the target",()=>{
  const first=ball(1,{runs_bat:5}), last=ball(1,{id:"chase",innings:2,runs_bat:6});
  expect(selectHighlight(last,[first,last],match)?.kind).toBe("winning_six");
  const later=ball(2,{id:"after",innings:2,runs_bat:4});
  expect(highlightCandidates(later,[first,last,later],match).map(x=>x.kind)).not.toContain("winning_four");
  const four=ball(1,{id:"four",innings:2,runs_bat:4});
  expect(selectHighlight(four,[ball(1,{runs_bat:3}),four],match)?.kind).toBe("winning_four");
});
it("respects disabled events and falls back to an enabled standard highlight",()=>{
  const out=ball(1,{wicket:{kind:"run_out",playerOut:"Alex"}});
  expect(selectHighlight(out,[out],match,{golden_duck:false,duck:false})?.kind).toBe("run_out");
  const off=Object.fromEntries(highlightCandidates(out,[out],match).map(x=>[x.kind,false])) as Partial<Record<HighlightKind,boolean>>;
  expect(selectHighlight(out,[out],match,off)).toBeNull();
  expect(selectHighlight(ball(1,{extra_type:"noball",extras:1}),[],match)?.detail).toBe("Illegal delivery");
});
