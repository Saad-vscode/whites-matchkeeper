import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TvPlayoffs } from "./tv-playoffs";
import { makeDraw, type PlayoffContext } from "@/lib/cricket/playoffs";
import {
  tournamentFixture,
  teamFixture,
  matchFixture,
  deliveryFixture,
} from "@/test/tournament-fixtures";
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
const context = (): PlayoffContext => ({
  tournament: tournamentFixture(),
  teams: ["a", "b", "c", "d"].map((id) => teamFixture(id, id.toUpperCase())),
  groups: [],
  matches: [],
  deliveries: [],
  token: "t",
  playoff: {
    tournament_id: "tour",
    approved: true,
    revision: 1,
    draw: makeDraw(["a", "b", "c", "d"], "single"),
  },
});
it("rotates rounds every eight seconds and removes the timer when closed", () => {
  vi.useFakeTimers();
  const ctx=context();ctx.playoff!.draw=makeDraw(["a","b","c","d","e","f","g","h"],"single");
  const v = render(<TvPlayoffs ctx={ctx} />);
  expect(screen.getByRole("heading", { name: "Quarter Finals" })).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(8000));
  expect(screen.getByRole("heading", { name: "Semi Finals" })).toBeInTheDocument();
  v.unmount();
  expect(vi.getTimerCount()).toBe(0);
});
it("celebrates a resolved final but supports manually revisiting the draw", () => {
  const ctx = context();
  ctx.playoff!.draw = makeDraw(["a", "b"], "single");
  ctx.matches = [
    matchFixture({ id: "f", rules: { playoffNode: "final" }, overs: 1, balls_per_over: 1 }),
  ];
  ctx.deliveries = [
    deliveryFixture({ match_id: "f", runs_bat: 1 }),
    deliveryFixture({ id: "2", match_id: "f", innings: 2, runs_bat: 2 }),
  ];
  const v = render(<TvPlayoffs ctx={ctx} />);
  expect(screen.getByRole("main", { name: "Tournament champions" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "B" })).toBeInTheDocument();
  v.rerender(<TvPlayoffs ctx={ctx} forceDraw />);
  expect(screen.getByRole("main", { name: "Playoff draw" })).toBeInTheDocument();
});
