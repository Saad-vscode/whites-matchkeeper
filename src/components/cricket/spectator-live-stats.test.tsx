import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { SpectatorLiveStats } from "./spectator-live-stats";
import { derive } from "@/lib/cricket/match";
import { matchFixture, deliveryFixture } from "@/test/tournament-fixtures";

afterEach(cleanup);
const match = matchFixture({ status: "live", overs: 2, live: { innings: 2, striker: "Alex", nonStriker: "Lee", bowler: "Sam" } });
const balls = [
  deliveryFixture({ id: "first", runs_bat: 6 }),
  deliveryFixture({ id: "four", innings: 2, seq: 1, runs_bat: 4 }),
  deliveryFixture({ id: "wide", innings: 2, seq: 2, extra_type: "wide", extras: 1 }),
];
it("shows delivery-derived chase, extras, partnership and current batter statistics", () => {
  render(<SpectatorLiveStats match={match} d={derive(match, balls)} deliveries={balls} />);
  const value = (label: string) => screen.getByText(label).parentElement!.querySelector("dd")!.textContent;
  expect(value("Extras")).toBe("1");
  expect(value("Partnership")).toBe("5 (1)");
  expect(value("Target")).toBe("7");
  expect(value("Need")).toBe("2 off 11");
  expect(value("RRR")).toBe("1.09");
  const row = screen.getByRole("rowheader", { name: /Alex/ }).closest("tr")!;
  expect(within(row).getAllByRole("cell").map(c => c.textContent)).toEqual(["4", "1", "1", "0", "400.0"]);
  expect(screen.getByLabelText("On strike")).toBeInTheDocument();
});
it("recalculates after undo and omits live batting and required rate after completion", () => {
  const view = render(<SpectatorLiveStats match={match} d={derive(match, balls)} deliveries={balls} />);
  view.rerender(<SpectatorLiveStats match={match} d={derive(match, balls.slice(0, 1))} deliveries={balls.slice(0, 1)} />);
  expect(screen.getByText("Partnership").parentElement).toHaveTextContent("0 (0)");
  const completed = { ...match, status: "completed" };
  view.rerender(<SpectatorLiveStats match={completed} d={derive(completed, balls)} deliveries={balls} />);
  expect(screen.queryByRole("table", { name: "Current batters" })).toBeNull();
  expect(screen.queryByText("RRR")).toBeNull();
  expect(screen.getByText("Target")).toBeInTheDocument();
});
