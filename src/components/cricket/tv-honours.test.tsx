import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TvHonours } from "./tv-honours";
import { TvVictory, victoryLevel } from "./tv-victory";
import { defaults, PRESENTATION_EVENT, readPresentation } from "@/lib/presentation-settings";
import {
  tournamentFixture,
  teamFixture,
  matchFixture,
  deliveryFixture,
} from "@/test/tournament-fixtures";
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: [
      { id: "s1", title: "Semi-final 1", name: "Alex" },
      { id: "s2", title: "Semi-final 2", name: "Sam" },
      { id: "f", title: "Final", name: "Lee" },
    ],
  }),
}));
vi.mock("./tv-presentation", () => ({ TvWatermark: () => null }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("cycles champions, runners-up and all three match awards, then loops and clears timers", () => {
  vi.useFakeTimers();
  const ctx = {
    tournament: tournamentFixture(),
    teams: [teamFixture("a", "Lions"), teamFixture("b", "Eagles")],
    groups: [],
    token: "x",
    playoff: null,
    matches: [
      matchFixture({
        id: "f",
        overs: 1,
        balls_per_over: 1,
        rules: { tournamentStage: { kind: "other", title: "Final" } },
      }),
    ],
    deliveries: [
      deliveryFixture({ match_id: "f", runs_bat: 1 }),
      deliveryFixture({ id: "2", match_id: "f", innings: 2, runs_bat: 2 }),
    ],
  };
  const view = render(<TvHonours ctx={ctx} seconds={8} />);
  expect(screen.getByText("Champions")).toBeInTheDocument();
  expect(screen.getByText(`of ${ctx.tournament.short_name}`)).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(8000));
  expect(screen.getByText("Runners-up")).toBeInTheDocument();
  expect(screen.getByText(`of ${ctx.tournament.short_name}`)).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(8000));
  expect(screen.getByRole("main", { name: "Tournament honours" })).toBeInTheDocument();
  expect(screen.getByText("Man of the Match · Semi-final 1")).toBeInTheDocument();
  expect(screen.getByText("Man of the Match · Semi-final 2")).toBeInTheDocument();
  expect(screen.getByText("Man of the Match · Final")).toBeInTheDocument();
  let stored = JSON.stringify({ ...defaults, honoursRuns: false, honoursMatches: false });
  vi.stubGlobal("localStorage", { getItem: () => stored });
  act(() => window.dispatchEvent(new Event(PRESENTATION_EVENT)));
  expect(screen.queryByText("Most Runs")).toBeNull();
  expect(screen.queryByText("Man of the Match · Final")).toBeNull();
  expect(screen.getByText("Most Wickets")).toBeInTheDocument();
  stored = JSON.stringify({
    ...defaults,
    honoursRuns: false,
    honoursMatches: false,
    honoursWickets: false,
    honoursPlayer: false,
  });
  act(() => window.dispatchEvent(new Event(PRESENTATION_EVENT)));
  expect(screen.queryByRole("main", { name: "Tournament honours" })).toBeNull();
  act(() => vi.advanceTimersByTime(8000));
  expect(screen.getByText("Runners-up")).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(8000));
  expect(screen.getByText("Champions")).toBeInTheDocument();
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});
it("defaults older settings to all awards and ignores invalid checkbox values", () => {
  vi.stubGlobal("localStorage", {
    getItem: () => JSON.stringify({ honoursRuns: false, honoursPlayer: "false" }),
  });
  expect(readPresentation()).toMatchObject({
    honoursRuns: false,
    honoursWickets: true,
    honoursPlayer: true,
    honoursMatches: true,
  });
});
it("distinguishes match stages and shows award names without points", () => {
  expect(victoryLevel({ tournamentStage: { title: "Semi Final 1" } })).toBe("playoff");
  expect(victoryLevel({ tournamentStage: { title: "Final" } })).toBe("final");
  expect(victoryLevel({})).toBe("match");
  render(
    <TvVictory
      name="Lions"
      result="Won by 4 wickets"
      level="match"
      award="Alex"
      settings={defaults}
    />,
  );
  expect(screen.getByRole("region", { name: "Man of the Match" })).toHaveTextContent("Alex");
  expect(screen.queryByText(/points/i)).toBeNull();
});
