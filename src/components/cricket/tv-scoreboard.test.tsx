import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (config: unknown) => config }));
import { TvScoreboard } from "@/routes/display.$matchId";
import { derive } from "@/lib/cricket/match";
import { matchFixture } from "@/test/tournament-fixtures";
import { deliveryFixture } from "@/test/tournament-fixtures";
afterEach(cleanup);
it("uses the current tournament logo in both TV views and hides missing logos", () => {
  const match = matchFixture({ status: "scheduled", toss_winner: null, toss_decision: null });
  const view = render(<TvScoreboard match={match} d={derive(match, [])} tournamentLogo="/cup-a.png" />);
  expect(view.container.querySelector('.tv-watermark')).toHaveAttribute('src', '/cup-a.png');
  const finished = { ...match, status: "completed" };
  view.rerender(<TvScoreboard match={finished} d={derive(finished, [])} tournamentLogo="/cup-b.png" />);
  expect(view.container.querySelector('.tv-watermark')).toHaveAttribute('src', '/cup-b.png');
  view.rerender(<TvScoreboard match={finished} d={derive(finished, [])} tournamentLogo={null} />);
  expect(view.container.querySelector('.tv-watermark')).toBeNull();
});
it("keeps the full-screen toss until both batsmen and the bowler are confirmed", () => {
  const match = matchFixture({ status: "live", live: { innings: 1, striker: "Sam", nonStriker: "Alex" } });
  const view = render(<TvScoreboard match={match} d={derive(match, [])} logos={{ a: "/lions.png", b: "/eagles.png" }} />);
  expect(screen.getByRole("main", { name: "Match introduction" })).toBeInTheDocument();
  expect(screen.getByAltText("Lions logo")).toHaveAttribute("src", "/lions.png");
  expect(screen.getByAltText("Eagles logo")).toHaveAttribute("src", "/eagles.png");
  expect(screen.queryByRole("region", { name: "At the crease" })).not.toBeInTheDocument();
  const ready = { ...match, live: { innings: 1, striker: "Sam", nonStriker: "Alex", bowler: "Lee" } };
  view.rerender(<TvScoreboard match={ready} d={derive(ready, [])} />);
  expect(screen.queryByRole("main", { name: "Match introduction" })).not.toBeInTheDocument();
  expect(screen.getByRole("region", { name: "At the crease" })).toBeInTheDocument();
});
it("never returns to the toss when a bowler or replacement batter is needed after play", () => {
  const match = matchFixture({ status: "live", live: { innings: 1 } });
  render(<TvScoreboard match={match} d={derive(match, [deliveryFixture({ extra_type: "wide", extras: 1 })])} />);
  expect(screen.queryByRole("main", { name: "Match introduction" })).not.toBeInTheDocument();
  expect(screen.getByRole("region", { name: "At the crease" })).toBeInTheDocument();
});
it("shows a result rather than a toss scene for a finished match with cleared selections", () => {
  const match = matchFixture({ live: {} });
  render(<TvScoreboard match={match} d={derive(match, [])} />);
  expect(screen.queryByRole("main", { name: "Match introduction" })).not.toBeInTheDocument();
});
it("shows toss and selected players without any delivery", () => {
  const match = matchFixture({ status: "live", toss_winner: "B", toss_decision: "bowl", live: { innings: 1, striker: "Sam", nonStriker: "Alex", bowler: "Lee" } });
  render(<TvScoreboard match={match} d={derive(match, [])} />);
  expect(screen.getByText("Eagles won the toss and elected to bowl")).toBeInTheDocument();
  for (const name of ["Sam", "Alex", "Lee"]) expect(screen.getByText(name)).toBeInTheDocument();
  expect(screen.getByText("Waiting for the first ball of the over")).toBeInTheDocument();
});
it("updates selections and toss immediately on match state changes", () => {
  const waiting = matchFixture({ status: "scheduled", toss_winner: null, toss_decision: null, live: {} });
  const view = render(<TvScoreboard match={waiting} d={derive(waiting, [])} />);
  expect(screen.getByText("Waiting for the toss")).toBeInTheDocument();
  const ready = { ...waiting, toss_winner: "A", toss_decision: "bat", live: { innings: 1, striker: "Sam", nonStriker: "Alex", bowler: "Lee" } };
  view.rerender(<TvScoreboard match={ready} d={derive(ready, [])} />);
  expect(screen.getByText("Lions won the toss and elected to bat")).toBeInTheDocument();
  expect(screen.getByText("Lee")).toBeInTheDocument();
});
