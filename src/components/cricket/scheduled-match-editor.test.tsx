import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { matchFixture } from "@/test/tournament-fixtures";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), error: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: mocks.error } }));
import { ScheduledMatchEditor } from "./scheduled-match-editor";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ error: null });
});
afterEach(cleanup);
it("loads schedule details and saves only metadata with the loaded revision", async () => {
  const done = vi.fn();
  render(
    <ScheduledMatchEditor
      match={matchFixture({
        status: "scheduled",
        score_revision: 3,
        match_date: "2026-11-24",
        scheduled_time: "10:30:00",
        venue: "Galle",
      })}
      onDone={done}
      onCancel={vi.fn()}
    />,
  );
  expect(screen.getByLabelText("Date (optional)")).toHaveValue("2026-11-24");
  fireEvent.change(screen.getByLabelText("Date (optional)"), { target: { value: "" } });
  fireEvent.change(screen.getByLabelText("Venue (optional)"), { target: { value: "  Colombo  " } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(done).toHaveBeenCalledOnce());
  expect(mocks.rpc).toHaveBeenCalledWith("edit_scheduled_match", {
    _match: "match",
    _expected: 3,
    _date: null,
    _time: "10:30:00",
    _venue: "Colombo",
  });
});
it("retains edits when the server rejects a stale or started match", async () => {
  mocks.rpc.mockResolvedValue({ error: { message: "Match changed" } });
  const done = vi.fn();
  render(<ScheduledMatchEditor match={matchFixture()} onDone={done} onCancel={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Venue (optional)"), { target: { value: "Galle" } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Match changed"));
  expect(done).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Venue (optional)")).toHaveValue("Galle");
});
