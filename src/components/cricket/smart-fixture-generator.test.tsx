import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SmartFixtureGenerator } from "./smart-fixture-generator";
import { generateFixtures, type FixtureContext } from "@/lib/cricket/fixture-generator";
import { teamFixture, tournamentFixture } from "@/test/tournament-fixtures";
const api = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/cricket/fixture-generator-api", () => ({
  loadFixtureContext: api.load,
  saveGeneratedFixtures: api.save,
}));
const teams = [teamFixture("a", "Lions"), teamFixture("b", "Eagles")];
const group = {
  id: "g",
  name: "Group A",
  tournament_id: "tour",
  team_ids: ["a", "b"],
  created_at: "2026-11-08",
};
const context: FixtureContext = {
  token: "fresh",
  group,
  tournament: { id: "tour", players_per_team: 2 },
  teams,
  matches: [],
};
class TestWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  terminate = vi.fn();
  postMessage(data: { context: FixtureContext; mode: "equal" | "round_robin"; target: number }) {
    queueMicrotask(() => {
      try {
        this.onmessage?.({
          data: { result: generateFixtures(data.context, data.mode, data.target) },
        });
      } catch (e) {
        this.onmessage?.({ data: { error: (e as Error).message } });
      }
    });
  }
}
beforeEach(() => {
  vi.stubGlobal("Worker", TestWorker);
  api.load.mockReset().mockResolvedValue(context);
  api.save.mockReset().mockResolvedValue(["new-match"]);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function props() {
  return {
    tournament: tournamentFixture(),
    teams,
    groups: [group],
    matches: [],
    onDone: vi.fn().mockResolvedValue(undefined),
    onCancel: vi.fn(),
  };
}
async function preview() {
  fireEvent.change(screen.getByLabelText("Group"), { target: { value: "g" } });
  fireEvent.click(screen.getByRole("button", { name: "Generate preview" }));
  await screen.findByRole("button", { name: "Confirm & Create Matches" });
}
it("previews and shuffles without writes, confirms ordinary match creation", async () => {
  const p = props();
  render(<SmartFixtureGenerator {...p} />);
  await preview();
  expect(api.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Regenerate / Shuffle" }));
  await screen.findByRole("button", { name: "Confirm & Create Matches" });
  expect(api.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm & Create Matches" }));
  await waitFor(() => expect(p.onDone).toHaveBeenCalled());
  expect(api.save).toHaveBeenCalledWith(
    context,
    "round_robin",
    1,
    expect.any(Array),
    expect.any(String),
  );
});
it("keeps the same request ID for a retry and blocks double clicks", async () => {
  api.save.mockRejectedValueOnce(new Error("Connection lost")).mockResolvedValue(["id"]);
  render(<SmartFixtureGenerator {...props()} />);
  await preview();
  fireEvent.click(screen.getByRole("button", { name: "Confirm & Create Matches" }));
  await screen.findByText("Connection lost");
  fireEvent.click(screen.getByRole("button", { name: "Confirm & Create Matches" }));
  await waitFor(() => expect(api.save).toHaveBeenCalledTimes(2));
  expect(api.save.mock.calls[0]?.[4]).toBe(api.save.mock.calls[1]?.[4]);
});
it("invalidates a preview when group membership changes", async () => {
  const p = props();
  const view = render(<SmartFixtureGenerator {...p} />);
  await preview();
  view.rerender(<SmartFixtureGenerator {...p} groups={[{ ...group, team_ids: ["a"] }]} />);
  expect(
    screen.queryByRole("button", { name: "Confirm & Create Matches" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("changed");
  expect(api.save).not.toHaveBeenCalled();
});
it("shows database setup/permission errors without writing", async () => {
  api.load.mockRejectedValue(new Error("Not allowed"));
  render(<SmartFixtureGenerator {...props()} />);
  fireEvent.change(screen.getByLabelText("Group"), { target: { value: "g" } });
  fireEvent.click(screen.getByRole("button", { name: "Generate preview" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Not allowed");
  expect(api.save).not.toHaveBeenCalled();
});
