import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
}));
import { AssignMatchScorer } from "./assign-match-scorer";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ error: null });
});
afterEach(cleanup);
function open() {
  render(<AssignMatchScorer matchId="fixture" matchName="Lions vs Eagles" disabled={false} />);
  fireEvent.click(screen.getByRole("button", { name: "Assign scorer" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Scorer email" }), {
    target: { value: "Scorer@Example.com" },
  });
}
it("assigns the email to the selected match through the existing RPC", async () => {
  open();
  fireEvent.click(screen.getByRole("button", { name: "Confirm assignment" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(mocks.rpc).toHaveBeenCalledWith("assign_scorer", {
    _match: "fixture",
    _email: "scorer@example.com",
  });
});
it("retains the email and shows backend errors", async () => {
  mocks.rpc.mockResolvedValue({ error: { message: "No account found with that email" } });
  open();
  fireEvent.click(screen.getByRole("button", { name: "Confirm assignment" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("No account found");
  expect(screen.getByRole("textbox", { name: "Scorer email" })).toHaveValue("Scorer@Example.com");
});
it("cancels without assigning", () => {
  open();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(mocks.rpc).not.toHaveBeenCalled();
});
