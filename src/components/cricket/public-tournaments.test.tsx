import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { matchFixture } from "@/test/tournament-fixtures";
vi.mock("@tanstack/react-router", () => ({ Link: ({ children, params, ...props }: any) => <a {...props} href={`/t/${params.tournamentId}`}>{children}</a> }));
vi.mock("./match-shelf", () => ({
  splitMatches: (matches: any[]) => ({ live: matches.filter(m => m.status === "live"), recent: matches.filter(m => m.status === "completed"), upcoming: matches.filter(m => m.status === "scheduled") }),
  MatchShelf: ({ title, matches }: any) => <div aria-label={title}>{matches.map((m: any) => <span key={m.id}>{m.name}</span>)}</div>,
}));
import { PublicTournaments, publicTournamentGroups } from "./public-tournaments";
afterEach(cleanup);
const tournaments = [{ id: "a", name: "APL", short_name: null, logo_url: null }, { id: "b", name: "Summer Cup", short_name: null, logo_url: null }];
it('excludes archived and hidden competitions and their fixtures from public discovery', () => {
  const matches = [matchFixture({ tournament_id: 'a' }), matchFixture({ id: 'b-match', tournament_id: 'b' })];
  expect(publicTournamentGroups([{...tournaments[0]!,platform_archived:true},{...tournaments[1]!,platform_hidden:true}],matches)).toEqual([]);
});
it("groups fixtures by identity, preserves independent and empty tournaments, and links public Home", () => {
  const matches = [matchFixture({ id: "1", tournament_id: "a", name: "Live A", status: "live" }), matchFixture({ id: "2", tournament_id: "a", name: "Recent A" }), matchFixture({ id: "3", tournament_id: "a", name: "Next A", status: "scheduled" }), matchFixture({ id: "4", tournament_id: null, name: "Friendly" })];
  render(<PublicTournaments tournaments={tournaments} matches={matches} />);
  const apl = screen.getByRole("region", { name: "APL" });
  expect(within(apl).getByRole("link")).toHaveAttribute("href", "/t/a");
  expect(within(apl).queryByText("Friendly")).toBeNull();
  expect([...apl.querySelectorAll('div[aria-label]')].map(e => e.getAttribute("aria-label"))).toEqual(["Live Now", "Recent Matches", "Upcoming Matches"]);
  expect(within(screen.getByRole("region", { name: "Other matches" })).getByText("Friendly")).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Summer Cup" })).toHaveTextContent("Fixtures will appear");
  expect(publicTournamentGroups([], matches).flatMap(g => g.matches)).toHaveLength(4);
});
