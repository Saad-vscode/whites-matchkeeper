import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { matchFixture } from "@/test/tournament-fixtures";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({}) }));
vi.mock("./bits", () => ({
  StatusPill: ({ status }: { status: string }) => <span>{status}</span>,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
import { MatchShelf, splitMatches } from "./match-shelf";
afterEach(cleanup);
it("keeps live, upcoming and finished fixtures separate", () => {
  const rows = [
    "live",
    "paused",
    "innings_break",
    "scheduled",
    "completed",
    "abandoned",
    "cancelled",
  ].map((status) => matchFixture({ status }));
  const groups = splitMatches(rows);
  expect(groups.live).toHaveLength(3);
  expect(groups.upcoming).toHaveLength(1);
  expect(groups.recent).toHaveLength(3);
});
it("pages four matches at a time and returns to the previous set", () => {
  const rows = Array.from({ length: 9 }, (_, i) =>
    matchFixture({ id: String(i), name: `Fixture ${i}`, status: "scheduled" }),
  );
  render(<MatchShelf title="Upcoming Matches" matches={rows} />);
  expect(screen.getAllByRole("article")).toHaveLength(4);
  expect(screen.getByText("Fixture 0")).toBeTruthy();
  fireEvent.click(screen.getByLabelText("Next Upcoming Matches page"));
  expect(screen.queryByText("Fixture 0")).toBeNull();
  expect(screen.getByText("Fixture 4")).toBeTruthy();
  fireEvent.click(screen.getByLabelText("Next Upcoming Matches page"));
  expect(screen.getAllByRole("article")).toHaveLength(1);
  expect(screen.getByLabelText("Next Upcoming Matches page")).toBeDisabled();
  fireEvent.click(screen.getByLabelText("Previous Upcoming Matches page"));
  expect(screen.getAllByRole("article")).toHaveLength(4);
});
