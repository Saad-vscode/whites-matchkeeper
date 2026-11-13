import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { deliveryFixture } from "@/test/tournament-fixtures";
import { TvHighlights, TvHighlightScene } from "./tv-highlight";
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it("shows each confirmed boundary for 2.8 seconds and then clears the overlay", () => {
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const view = render(<TvHighlights matchId="a" deliveries={[]} conn="live" />);
  const ball = deliveryFixture({ runs_bat: 6 });
  view.rerender(<TvHighlights matchId="a" deliveries={[ball]} conn="live" />);
  expect(screen.getByRole("status")).toHaveAccessibleName("Six · Alex");
  act(() => vi.advanceTimersByTime(2799));
  expect(screen.getByRole("status")).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.queryByRole("status")).toBeNull();
  view.rerender(<TvHighlights matchId="a" deliveries={[{ ...ball }]} conn="live" />);
  expect(screen.queryByRole("status")).toBeNull();
});
it("clears on match changes and never replays existing scores", () => {
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const view = render(<TvHighlights matchId="a" deliveries={[]} conn="live" />);
  const ball = deliveryFixture({ runs_bat: 4 });
  view.rerender(<TvHighlights matchId="a" deliveries={[ball]} conn="live" />);
  view.rerender(<TvHighlights matchId="b" deliveries={[ball]} conn="live" />);
  expect(screen.queryByRole("status")).toBeNull();
});
it("draws three separate stumps and two bails for the impact sequence", () => {
  const view = render(
    <TvHighlightScene event={{ id: "w", kind: "wicket", player: "Alex", detail: "bowled" }} />,
  );
  expect(view.container.querySelectorAll(".tv-stump")).toHaveLength(3);
  expect(view.container.querySelectorAll(".tv-bail")).toHaveLength(2);
});
it("cancels an active highlight when its delivery is undone", () => {
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const view = render(<TvHighlights matchId="a" deliveries={[]} conn="live" />);
  view.rerender(
    <TvHighlights matchId="a" deliveries={[deliveryFixture({ runs_bat: 4 })]} conn="live" />,
  );
  expect(screen.getByRole("status")).toBeInTheDocument();
  view.rerender(<TvHighlights matchId="a" deliveries={[]} conn="live" />);
  expect(screen.queryByRole("status")).toBeNull();
});
it("plays consecutive events once each rather than restarting the active animation", () => {
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const view = render(<TvHighlights matchId="a" deliveries={[]} conn="live" />);
  const four = deliveryFixture({ runs_bat: 4 }),
    six = deliveryFixture({ id: "six", seq: 2, runs_bat: 6 });
  view.rerender(<TvHighlights matchId="a" deliveries={[four]} conn="live" />);
  act(() => vi.advanceTimersByTime(1000));
  view.rerender(<TvHighlights matchId="a" deliveries={[four, six]} conn="live" />);
  expect(screen.getByRole("status")).toHaveAccessibleName("Four · Alex");
  act(() => vi.advanceTimersByTime(1800));
  expect(screen.getByRole("status")).toHaveAccessibleName("Six · Alex");
  act(() => vi.advanceTimersByTime(2800));
  expect(screen.queryByRole("status")).toBeNull();
});
