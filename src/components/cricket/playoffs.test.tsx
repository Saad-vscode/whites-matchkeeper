import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { teamFixture, tournamentFixture } from "@/test/tournament-fixtures";
import { makeDraw, type PlayoffContext } from "@/lib/cricket/playoffs";
import type { usePlayoffs } from "@/lib/cricket/use-playoffs";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
import { Playoffs } from "./playoffs";
const context = (): PlayoffContext => ({
  tournament: tournamentFixture({ competition_format: "groups" }),
  teams: ["a", "b", "c", "d", "e", "f"].map((t) => teamFixture(t, t.toUpperCase())),
  groups: [
    { id: "g1", name: "Group A", team_ids: ["a", "b", "c"], tournament_id: "tour", created_at: "" },
    { id: "g2", name: "Group B", team_ids: ["d", "e", "f"], tournament_id: "tour", created_at: "" },
  ],
  matches: [],
  deliveries: [],
  token: "snapshot",
  playoff: null,
});
function view(ctx: PlayoffContext, canManage = true) {
  return render(
    <Playoffs
      canManage={canManage}
      query={
        {
          data: ctx,
          isPending: false,
          isError: false,
          syncError: null,
          retrySync: vi.fn(),
        } as unknown as ReturnType<typeof usePlayoffs>
      }
    />,
  );
}
beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ error: null });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("allows qualification counts, seed swaps and explicit approval", async () => {
  view(context());
  fireEvent.change(screen.getByLabelText("Playoff format"), { target: { value: "single" } });
  expect(screen.getByLabelText("Seed 1")).toHaveValue("a");
  expect(screen.getByLabelText("Seed 2")).toHaveValue("d");
  fireEvent.change(screen.getByLabelText("Group A qualifying teams"), { target: { value: "3" } });
  fireEvent.click(screen.getByRole("button", { name: "Use top teams from standings" }));
  expect(screen.getByLabelText("Seed 5")).toHaveValue("c");
  fireEvent.change(screen.getByLabelText("Seed 1"), { target: { value: "d" } });
  expect(screen.getByLabelText("Seed 2")).toHaveValue("a");
  fireEvent.click(screen.getByRole("button", { name: "Approve draw & create fixtures" }));
  await waitFor(() =>
    expect(rpc).toHaveBeenCalledWith(
      "save_playoff_draw",
      expect.objectContaining({
        _token: "snapshot",
        _approve: true,
        _draw: expect.objectContaining({ seeds: ["d", "a", "b", "e", "c"] }),
      }),
    ),
  );
});
it.each([true, false])("approves qualifier routing for grouped=%s", async (grouped) => {
  const ctx = context();
  if (!grouped) ctx.groups = [];
  view(ctx);
  expect(screen.getByLabelText("Playoff format")).toHaveValue("ipl");
  fireEvent.click(screen.getByRole("button", { name: "Approve draw & create fixtures" }));
  const seeds = grouped ? ["a", "d", "b", "e"] : ["a", "b", "c", "d"];
  await waitFor(() => expect(rpc).toHaveBeenCalledWith("save_playoff_draw",
    expect.objectContaining({ _approve: true, _draw: makeDraw(seeds, "ipl") })));
});
it("lets the organiser convert an unstarted semifinal draw to qualifiers", async () => {
  const ctx = context();
  ctx.playoff = { tournament_id: "tour", revision: 1, approved: true,
    draw: makeDraw(["a", "d", "b", "e"], "single") };
  view(ctx);
  fireEvent.click(screen.getByRole("button", { name: "Edit draw" }));
  fireEvent.change(screen.getByLabelText("Playoff format"), { target: { value: "ipl" } });
  fireEvent.click(screen.getByRole("button", { name: "Use top teams from standings" }));
  fireEvent.click(screen.getByRole("button", { name: "Approve draw & create fixtures" }));
  await waitFor(() => expect(rpc).toHaveBeenCalledWith("save_playoff_draw",
    expect.objectContaining({ _draw: makeDraw(["a", "d", "b", "e"], "ipl") })));
});
it("keeps spectators read-only and labels future matches clearly", () => {
  const ctx = context();
  ctx.playoff = {
    tournament_id: "tour",
    revision: 1,
    approved: true,
    draw: makeDraw(["a", "d", "b", "e"], "single"),
  };
  view(ctx, false);
  expect(screen.queryByRole("button", { name: /Approve|Edit draw/ })).toBeNull();
  expect(screen.getByText("Winner · Semi Final 1")).toBeInTheDocument();
  expect(screen.getByText("Winner · Semi Final 2")).toBeInTheDocument();
  expect(rpc).not.toHaveBeenCalled();
});
it("shows a useful migration message without hiding the tournament", () => {
  render(
    <Playoffs
      canManage
      query={
        {
          isPending: false,
          isError: true,
          error: new Error("Apply migration 0012"),
          refetch: vi.fn(),
        } as unknown as ReturnType<typeof usePlayoffs>
      }
    />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("Apply migration 0012");
});
