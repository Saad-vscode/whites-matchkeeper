import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TournamentStatistics } from "./tournament-statistics";
import { tournamentSummary } from "@/lib/cricket/tournament-summary";
import { deliveryFixture as ball, matchFixture as match } from "@/test/tournament-fixtures";
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/score">{children}</a>,
}));
afterEach(cleanup);
const summary = tournamentSummary(
  [match()],
  [
    ball({ runs_bat: 6 }),
    ball({ id: "second", seq: 2, striker: "Sam", non_striker: "Alex", runs_bat: 4 }),
  ],
  [],
);
function setup() {
  render(
    <TournamentStatistics summary={summary} renderCard={(stat) => <span>{stat.label}</span>} />,
  );
}
it("opens ordered rankings from a card and switches categories", () => {
  setup();
  fireEvent.click(screen.getByRole("button", { name: "View Most Runs rankings" }));
  const rows = screen.getAllByRole("listitem");
  expect(rows[0]).toHaveTextContent("Alex");
  expect(rows[1]).toHaveTextContent("Sam");
  fireEvent.change(screen.getByLabelText("Statistic"), { target: { value: "mvp" } });
  expect(screen.getByRole("heading", { name: "MVP" })).toBeInTheDocument();
  expect(screen.getByText(/Bat 6/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "All statistics" }));
  expect(
    screen.getByRole("button", { name: "View Best Partnership rankings" }),
  ).toBeInTheDocument();
});
it("shows partnership team runs including both batters", () => {
  setup();
  fireEvent.click(screen.getByRole("button", { name: "View Best Partnership rankings" }));
  expect(screen.getByRole("listitem")).toHaveTextContent("Alex & Sam");
  expect(screen.getByRole("listitem")).toHaveTextContent("10");
});
it("shows an empty ranking instead of inventing a performance", () => {
  render(
    <TournamentStatistics
      summary={tournamentSummary([], [], [])}
      renderCard={(stat) => <span>{stat.label}</span>}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "View MVP rankings" }));
  expect(screen.getByText("No qualifying performances yet.")).toBeInTheDocument();
});

it("identifies the legacy run-out that needs classification", () => {
  const m = match();
  const affected = tournamentSummary([m], [ball({ wicket: { kind: "run_out", playerOut: "Alex", fielder: "Lee" } })], []);
  render(<TournamentStatistics summary={affected} renderCard={(stat) => <span>{stat.label}</span>} />);
  fireEvent.click(screen.getByRole("button", { name: "View MVP rankings" }));
  expect(screen.getByRole("status")).toHaveTextContent("Run-out type missing");
  expect(screen.getByRole("status")).toHaveTextContent("innings 1, ball 1");
  expect(screen.getByRole("link", { name: "Open scorer" })).toBeInTheDocument();
});