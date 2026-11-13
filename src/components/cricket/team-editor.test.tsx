import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { teamFixture } from "@/test/tournament-fixtures";
import { playerRows, validatePlayerRows } from "@/lib/cricket/team-players";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: [] }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("sonner", () => ({ toast: { error: mocks.error, success: vi.fn() } }));
import { TeamEditor } from "./tournament-actions";

describe("team player registration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReturnValue({ update: mocks.update });
    mocks.update.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ eq: mocks.eq, select: mocks.select });
    mocks.select.mockReturnValue({ single: mocks.single });
    mocks.single.mockResolvedValue({ data: { id: "team" }, error: null });
  });
  afterEach(cleanup);
  const team = {
    ...teamFixture("team", "Lions"),
    players: ["Amal", "Bimal", "Chamal", "Dilan"],
    captain: "Chamal",
    vice_captain: "Amal",
  };
  function editor(onDone = vi.fn().mockResolvedValue(undefined)) {
    render(
      <TeamEditor
        tournamentId="tour"
        userId="owner"
        team={team}
        onDone={onDone}
        onCancel={vi.fn()}
      />,
    );
  }
  it("loads leaders first and renumbers regular rows without removing leadership", () => {
    editor();
    expect(screen.getByRole("textbox", { name: "Captain name" })).toHaveValue("Chamal");
    expect(screen.getByRole("textbox", { name: "Vice-Captain name" })).toHaveValue("Amal");
    fireEvent.click(screen.getByRole("button", { name: "Remove player 3" }));
    expect(screen.getByRole("textbox", { name: "Player name 3" })).toHaveValue("Dilan");
    fireEvent.click(screen.getByRole("button", { name: "Add Player" }));
    expect(screen.getByRole("textbox", { name: "Player name 4" })).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Remove player 1" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove player 2" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Captain" })).not.toBeInTheDocument();
  });
  it("allows adding and saving more than eight squad members", async () => {
    const done = vi.fn().mockResolvedValue(undefined);
    editor(done);
    const add = screen.getByRole("button", { name: "Add Player" });
    for (let row = 5; row <= 10; row++) {
      fireEvent.click(add);
      fireEvent.change(screen.getByRole("textbox", { name: `Player name ${row}` }), {
        target: { value: `Player ${row}` },
      });
    }
    expect(add).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Save team" }));
    await waitFor(() => expect(done).toHaveBeenCalledOnce());
    expect(mocks.update.mock.calls[0]![0].players).toHaveLength(10);
  });
  it("updates the existing team with trimmed names and both roles, without touching matches", async () => {
    const done = vi.fn().mockResolvedValue(undefined);
    editor(done);
    fireEvent.change(screen.getByRole("textbox", { name: "Captain name" }), {
      target: { value: "  Chamal  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save team" }));
    await waitFor(() => expect(done).toHaveBeenCalledOnce());
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        players: ["Chamal", "Amal", "Bimal", "Dilan"],
        captain: "Chamal",
        vice_captain: "Amal",
      }),
    );
    expect(mocks.eq).toHaveBeenCalledWith("id", "team");
    expect(mocks.eq).toHaveBeenCalledWith("tournament_id", "tour");
    expect(mocks.from.mock.calls).toEqual([["tournament_teams"]]);
  });
  it("blocks duplicate players before saving", () => {
    editor();
    fireEvent.change(screen.getByRole("textbox", { name: "Player name 3" }), {
      target: { value: " CHAMAL " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save team" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Each player can appear only once");
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("preserves unassigned legacy players without inventing leadership", () => {
    expect(playerRows({ players: ["Bimal", "Amal"], captain: "Amal" })).toEqual([
      "Amal",
      "",
      "Bimal",
    ]);
    expect(playerRows({ players: ["Bimal"] })).toEqual(["", "", "Bimal"]);
  });
  it("requires distinct leaders and nonempty regular rows", () => {
    expect(validatePlayerRows(["", "Amal"]).error).toMatch(/captain's name/);
    expect(validatePlayerRows(["Amal", ""]).error).toMatch(/vice-captain's name/);
    expect(validatePlayerRows(["Amal", " amal "]).error).toMatch(/different players/);
    expect(validatePlayerRows(["Amal", "Bimal", " "]).error).toMatch(/every player row/);
    expect(validatePlayerRows(["Amal", "Bimal", "A  Silva", "a silva"]).error).toMatch(/only once/);
  });
  it("retains entries and explains a missing migration instead of dropping roles", async () => {
    mocks.single.mockResolvedValue({
      error: { code: "PGRST204", message: "Missing vice_captain" },
    });
    const done = vi.fn();
    editor(done);
    fireEvent.click(screen.getByRole("button", { name: "Save team" }));
    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining("database update")),
    );
    expect(done).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Captain name" })).toHaveValue("Chamal");
  });
});
