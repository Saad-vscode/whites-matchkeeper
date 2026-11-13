import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { matchFixture } from "@/test/tournament-fixtures";
import { replay } from "@/lib/cricket/offline";
const state = vi.hoisted(() => ({ supported: true }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: state.supported }) }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: unknown) => config,
  Link: () => null,
}));
import { TossSetup } from "@/routes/_authenticated/score.$matchId";
beforeEach(() => {
  state.supported = true;
});
afterEach(cleanup);
it("saves per-match format and toss together through the scoring operation", async () => {
  const save = vi.fn().mockResolvedValue(true);
  const match = matchFixture({
    status: "scheduled",
    toss_winner: null,
    overs: 4,
    balls_per_over: 5,
  });
  render(<TossSetup match={match} onSave={save} />);
  fireEvent.change(screen.getByLabelText("Overs per innings"), { target: { value: "3" } });
  fireEvent.change(screen.getByLabelText("Balls per over"), { target: { value: "6" } });
  fireEvent.click(screen.getByRole("button", { name: "Lions" }));
  fireEvent.click(screen.getByRole("button", { name: "Bat" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm toss" }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  const patch = save.mock.calls[0]![0];
  expect(patch).toMatchObject({
    overs: 3,
    balls_per_over: 6,
    toss_winner: "A",
    toss_decision: "bat",
  });
  const local = replay({ match, deliveries: [] }, [
    { id: "operation", kind: "state", delivery: null, reason: "", patch },
  ]);
  expect(local.match.overs).toBe(3);
  expect(local.match.balls_per_over).toBe(6);
  expect(match.overs).toBe(4);
});
it("blocks invalid format values", () => {
  render(<TossSetup match={matchFixture()} onSave={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Lions" }));
  fireEvent.click(screen.getByRole("button", { name: "Bat" }));
  fireEvent.change(screen.getByLabelText("Overs per innings"), { target: { value: "0" } });
  expect(screen.getByRole("button", { name: "Confirm toss" })).toBeDisabled();
  expect(screen.getByRole("alert")).toHaveTextContent("whole numbers");
});
it("keeps format changes disabled before the backend migration", () => {
  state.supported = false;
  render(<TossSetup match={matchFixture()} onSave={vi.fn()} />);
  expect(screen.getByLabelText("Overs per innings")).toBeDisabled();
  expect(screen.getByLabelText("Balls per over")).toBeDisabled();
});
