import { describe, expect, it } from "vitest";
import { tournamentSummary } from "./tournament-summary";
import { recentTournamentMatches, tournamentHonours } from "./tournament-home";
import { deliveryFixture as ball, matchFixture as match } from "@/test/tournament-fixtures";

const final = match({ rules: { tournamentStage: { kind: "other", title: "Final" } } });
const balls = [
  ball({ runs_bat: 4, wicket: { kind: "bowled", playerOut: "Alex" } }),
  ball({ id: "chase", innings: 2, runs_bat: 6 }),
];
const summary = (matches = [final], deliveries = balls) =>
  tournamentSummary(matches, deliveries, []).matches;

describe("tournament home results", () => {
  it("derives champions and runners-up from the completed final log", () => {
    expect(tournamentHonours(summary())).toEqual({
      champion: { id: "b", name: "Eagles" },
      runnerUp: { id: "a", name: "Lions" },
    });
    expect(tournamentHonours(summary([final], []))).toBeNull();
  });
  it("keeps teams during group matches, live finals, or outstanding fixtures", () => {
    expect(tournamentHonours(summary([match()]))).toBeNull();
    expect(tournamentHonours(summary([{ ...final, status: "live" }]))).toBeNull();
    expect(
      tournamentHonours(summary([final, match({ id: "next", status: "scheduled" })])),
    ).toBeNull();
  });
  it("does not invent champions for ties, abandonment, or multiple finals", () => {
    const tied = [
      ball({ runs_bat: 4, wicket: { kind: "bowled", playerOut: "Alex" } }),
      ball({ id: "chase", innings: 2, runs_bat: 4, wicket: { kind: "bowled", playerOut: "Alex" } }),
    ];
    expect(tournamentHonours(summary([final], tied))).toBeNull();
    expect(tournamentHonours(summary([{ ...final, status: "abandoned" }]))).toBeNull();
    expect(tournamentHonours(summary([final, { ...final, id: "another" }]))).toBeNull();
  });
  it("shows six latest finished fixtures in reverse creation order without mutating input", () => {
    const rows = summary(
      Array.from({ length: 8 }, (_, i) =>
        match({
          id: String(i),
          created_at: `2026-11-0${i + 1}`,
          status: i === 7 ? "scheduled" : i === 6 ? "abandoned" : "completed",
        }),
      ),
    );
    expect(recentTournamentMatches(rows).map((r) => r.m.id)).toEqual([
      "6",
      "5",
      "4",
      "3",
      "2",
      "1",
    ]);
    expect(rows[0]?.m.id).toBe("0");
  });
});
