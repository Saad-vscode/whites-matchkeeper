import { expect, it } from "vitest";
import { tvPlayers } from "./tv-players";
import { derive } from "./match";
import { matchFixture as match, deliveryFixture as ball } from "@/test/tournament-fixtures";
it("has empty slots at the start, without inventing previous players", () => {
  const m = match({live:{innings:2}});
  expect(tvPlayers(m,derive(m,[])).batters).toEqual([{name:null,faded:false},{name:null,faded:false}]);
});
it("fades the dismissed batter until a replacement is confirmed", () => {
  const m = match({live:{innings:1,striker:null,nonStriker:"Sam",bowler:"Lee"}});
  const ds = [ball({bowler:"Lee",wicket:{kind:"bowled",playerOut:"Alex"}})];
  expect(tvPlayers(m,derive(m,ds)).batters[0]).toEqual({name:"Alex",faded:true});
  const next = {...m,live:{innings:1,striker:"Pat",nonStriker:"Sam",bowler:"Lee"}};
  expect(tvPlayers(next,derive(next,ds)).batters[0]).toEqual({name:"Pat",faded:false});
});
it("keeps the previous bowler faded at the over boundary", () => {
  const m = match({balls_per_over:1,overs:4,live:{innings:1,striker:"Sam",nonStriker:"Alex",bowler:null}});
  expect(tvPlayers(m,derive(m,[ball({bowler:"Lee"})])).bowler).toEqual({name:"Lee",faded:true});
});
it("clears previous-innings names rather than leaking them into new innings", () => {
  const m = match({live:{innings:2}});
  const slots=tvPlayers(m,derive(m,[ball({bowler:"Lee"})]));
  expect(slots.bowler.name).toBeNull();
  expect(slots.batters.every(p=>p.name===null)).toBe(true);
});
