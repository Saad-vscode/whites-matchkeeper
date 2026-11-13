import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { teamFixture, tournamentFixture } from "@/test/tournament-fixtures";
import { countsForPoints } from "@/lib/cricket/match-stage";
const mocks = vi.hoisted(() => ({ insert: vi.fn(), from: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
import { FixtureEditor } from "./tournament-actions";
const groups = [
  { id: "g", name: "Group A", tournament_id: "tour", created_at: "", team_ids: ["a", "b"] },
];
function renderEditor() {
  render(
    <FixtureEditor
      tournament={tournamentFixture()}
      teams={[teamFixture("a", "Lions"), teamFixture("b", "Eagles"), teamFixture("c", "Tigers")]}
      groups={groups}
      userId="owner"
      onDone={vi.fn().mockResolvedValue(undefined)}
      onCancel={vi.fn()}
    />,
  );
}
describe("fixture classification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReturnValue({ insert: mocks.insert });
    mocks.insert.mockReturnValue({
      select: () => ({ single: async () => ({ data: { id: "match" }, error: null }) }),
    });
  });
  afterEach(cleanup);
  it("requires a group, filters its teams and saves classification", async () => {
    renderEditor();
    expect(screen.queryByRole("combobox", { name: "Home team" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Group Stage (Points Table)" }));
    fireEvent.change(screen.getByRole("combobox", { name: /Which group/ }), {
      target: { value: "g" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.queryByRole("option", { name: "Tigers" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Home team" }), {
      target: { value: "a" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Away team" }), {
      target: { value: "b" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create fixture" }));
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledOnce());
    expect(mocks.insert.mock.calls[0]![0]).toMatchObject({ match_date: null, scheduled_time: null, venue: null });
    expect(mocks.insert.mock.calls[0]![0].rules.tournamentStage).toEqual({
      kind: "group",
      groupId: "g",
      title: "Group A",
    });
  });
  it("allows other matches across groups and persists the round", async () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Other Matches" }));
    fireEvent.change(screen.getByRole("combobox", { name: /Match title/ }), {
      target: { value: "Final" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Home team" }), {
      target: { value: "a" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Away team" }), {
      target: { value: "c" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create & start" }));
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledOnce());
    expect(mocks.insert.mock.calls[0]![0].rules.tournamentStage).toEqual({
      kind: "other",
      title: "Final",
    });
  });
  it("excludes other rounds and different groups from points while preserving legacy fixtures", () => {
    expect(countsForPoints({}, "g")).toBe(true);
    expect(countsForPoints({ tournamentStage: { kind: "other", title: "Final" } }, "g")).toBe(
      false,
    );
    expect(countsForPoints({ tournamentStage: { kind: "other", title: "Match" } })).toBe(false);
    expect(countsForPoints({ tournamentStage: { kind: "group", groupId: "h" } }, "g")).toBe(false);
    expect(countsForPoints({ tournamentStage: { kind: "group", groupId: "g" } }, "g")).toBe(true);
  });
});
