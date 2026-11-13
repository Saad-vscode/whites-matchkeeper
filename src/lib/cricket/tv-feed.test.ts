import { expect, it } from "vitest";
import { nextTvMatch } from "./tv-feed";
import { matchFixture } from "@/test/tournament-fixtures";

it("previews the scorer's scheduled match without interrupting active play or accepting unknown fixtures", () => {
  const rows = [matchFixture({ id: "done" }), matchFixture({ id: "next", status: "scheduled", toss_winner: null })];
  expect(nextTvMatch("done", rows, "next")).toBe("next");
  expect(nextTvMatch("done", rows, "unknown")).toBe("done");
  expect(nextTvMatch("done", [...rows, matchFixture({id:"playing",status:"live"})], "next")).toBe("playing");
});

it("holds a finished result until another match starts", () => {
  expect(nextTvMatch("done", [matchFixture({ id: "done" }), matchFixture({ id: "next", status: "scheduled", toss_winner: null })])).toBe("done");
});
it("follows a confirmed toss even before the first delivery or live status", () => {
  expect(nextTvMatch("done", [matchFixture({ id: "done" }), matchFixture({ id: "next", status: "scheduled", toss_winner: "B" })])).toBe("next");
});
it.each(["live", "paused", "innings_break"])("does not interrupt a %s match for another ground", status => {
  expect(nextTvMatch("current", [matchFixture({ id: "other", status: "live" }), matchFixture({ id: "current", status })])).toBe("current");
});
it("skips abandoned and cancelled matches, chooses active fixtures in creation order", () => {
  const rows = [matchFixture({ id: "cancelled", status: "cancelled" }), matchFixture({ id: "newer", status: "live", created_at: "2026-11-08" }), matchFixture({ id: "older", status: "live", created_at: "2026-11-07" })];
  expect(nextTvMatch("done", rows)).toBe("older");
});
