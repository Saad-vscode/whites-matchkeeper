import { expect, it } from "vitest";
import { deliveryFixture, matchFixture } from "@/test/tournament-fixtures";
import { highlightCandidates, selectHighlight, HIGHLIGHT_PRIORITY, type HighlightKind } from "./tv-highlights";
import type { Delivery } from "./engine";
const match=matchFixture({overs:20,balls_per_over:4,players_per_team:11,status:"live",live:{innings:1}});
const ball=(seq:number,patch:Partial<Delivery>={})=>deliveryFixture({id:String(seq),seq,bowler:"Lee",...patch});
const kinds=(balls:Delivery[])=>highlightCandidates(balls.at(-1)!,balls,match).map(x=>x.kind);
it.each(["caught", "stumped"] as const)("selects %s only from its recorded wicket type and uses the recorded fielder",kind=>{
  const first=ball(1,{runs_bat:1});
  const out=ball(2,{wicket:{kind,playerOut:"Alex",fielder:"Taylor"}});
  expect(selectHighlight(out,[first,out],match)).toMatchObject({kind,player:"Alex",detail:`${kind === "caught" ? "Caught" : "Stumped"} by Taylor`});
  expect(selectHighlight(out,[first,out],match,{[kind]:false})?.kind).toBe("wicket");
  expect(selectHighlight(out,[first,out],match,{[kind]:false,wicket:false})).toBeNull();
  expect(selectHighlight({...out,wicket:{kind:"bowled",playerOut:"Alex"}},[first],match)?.kind).not.toBe(kind);
  expect(selectHighlight(out,[out],match)?.kind).toBe("golden_duck");
});
it("keeps the approved hierarchy explicit",()=>{
  const order: HighlightKind[] = ["winning_six","hat_trick","triple_six","fifty","golden_duck","duck","run_out","wicket","hat_chance","six","no_ball","maiden"];
  expect(order.map(kind=>HIGHLIGHT_PRIORITY[kind])).toEqual([1,2,3,4,5,6,7,8,9,10,11,12]);
});
it("shows the dismissal over hat-trick chance and a maiden, with supporting text",()=>{
  const balls=[ball(1),ball(2),ball(3,{wicket:{kind:"bowled",playerOut:"Alex"}}),ball(4,{striker:"Sam",wicket:{kind:"bowled",playerOut:"Sam"}})];
  const selected=selectHighlight(balls[3]!,balls,match);
  expect(selected?.kind).toBe("golden_duck");
  expect(selected?.detail).toBe("Lee on a hat-trick · Maiden over");
  expect(selectHighlight(balls[3]!,balls,match,{hat_chance:false,maiden:false})?.detail).toBe("First ball dismissal");
  expect(selectHighlight(balls[3]!,balls,match,{golden_duck:false,duck:false})?.kind).toBe("wicket");
  expect(selectHighlight(balls[3]!,balls,match,{golden_duck:false,duck:false,wicket:false})?.kind).toBe("hat_chance");
});
it("shows fifty over a boundary and a boundary over a no-ball",()=>{
  const balls=[ball(1,{runs_bat:46}),ball(2,{runs_bat:4})];
  expect(selectHighlight(balls[1]!,balls,match)).toMatchObject({kind:"fifty",detail:"Reached with a FOUR"});
  expect(selectHighlight(balls[1]!,balls,match,{four:false})?.detail).toBe("Brilliant knock!");
  const extra=ball(1,{runs_bat:6,extra_type:"noball",extras:1});
  expect(selectHighlight(extra,[extra],match)?.kind).toBe("six");
  expect(selectHighlight(extra,[extra],match,{six:false})?.kind).toBe("no_ball");
});
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
  expect(selectHighlight(last,[first,last],match)?.team).toBe("Eagles");
  const later=ball(2,{id:"after",innings:2,runs_bat:4});
  expect(highlightCandidates(later,[first,last,later],match).map(x=>x.kind)).not.toContain("winning_four");
  const four=ball(1,{id:"four",innings:2,runs_bat:4});
  expect(selectHighlight(four,[ball(1,{runs_bat:3}),four],match)?.kind).toBe("winning_four");
});

it("prioritises a winning third six over the streak and a hat-trick over a duck",()=>{
  const first=ball(1,{runs_bat:17});
  const chase=[1,2,3].map(seq=>ball(seq,{id:`chase-${seq}`,innings:2,runs_bat:6}));
  expect(selectHighlight(chase[2]!,[first,...chase],match)?.kind).toBe("winning_six");
  expect(selectHighlight(chase[2]!,[first,...chase],match,{winning_six:false})?.kind).toBe("triple_six");
  const wickets=[1,2,3].map(seq=>ball(seq,{striker:`Player ${seq}`,wicket:{kind:"bowled",playerOut:`Player ${seq}`}}));
  expect(selectHighlight(wickets[2]!,wickets,match)?.kind).toBe("hat_trick");
});
it("respects disabled events and falls back to an enabled standard highlight",()=>{
  const out=ball(1,{wicket:{kind:"run_out",playerOut:"Alex"}});
  expect(selectHighlight(out,[out],match,{golden_duck:false,duck:false})?.kind).toBe("run_out");
  const off=Object.fromEntries(highlightCandidates(out,[out],match).map(x=>[x.kind,false])) as Partial<Record<HighlightKind,boolean>>;
  expect(selectHighlight(out,[out],match,off)).toBeNull();
  expect(selectHighlight(ball(1,{extra_type:"noball",extras:1}),[],match)?.detail).toBe("Illegal delivery");
});
