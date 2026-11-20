vi.mock("@/lib/feature-access", async (original) => { const module = await original<typeof import("@/lib/feature-access")>(); const access = module.allFeatures(true); return { ...module, useFeatureAccess: () => ({ allows: () => true, access }) }; });
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/integrations/supabase/types";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("sonner", () => ({ toast: { error: mocks.error, success: mocks.success } }));

import { TournamentForm } from "./tournament-form";

const tournament: Database["public"]["Tables"]["tournaments"]["Row"] = {
  location: "Galle",
  description: null,
  start_date: null,
  end_date: null,
  competition_format: "league",
  ranking_rule: "points_nrr_wins",
  points_no_result: 1,
  id: "tournament-1",
  created_by: "owner-1",
  created_at: "2026-11-06",
  name: "Colombo League",
  short_name: "CPL",
  primary_color: "#123456",
  accent_color: "#abcdef",
  logo_url: null,
  overs: 10,
  balls_per_over: 6,
  players_per_team: 8,
  rules: { wideRuns: 2, noBallRuns: 3, lastManBats: true, maxOversPerBowler: 2, customRule: true },
  points_win: 4,
  points_tie: 2,
  points_loss: 0,
};

describe("Tournament editing", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.clearAllMocks();
    mocks.from.mockReturnValue({ update: mocks.update });
    mocks.update.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ single: mocks.single });
    mocks.single.mockResolvedValue({ data: { id: tournament.id }, error: null });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loads saved values and updates the same tournament while preserving its rules", async () => {
    const onSaved = vi.fn().mockResolvedValue(undefined);
    render(<TournamentForm tournament={tournament} onSaved={onSaved} />);
    expect(screen.getByDisplayValue("CPL")).toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue("Colombo League"), {
      target: { value: "Updated League" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(mocks.from).toHaveBeenCalledWith("tournaments");
    expect(mocks.eq).toHaveBeenCalledWith("id", tournament.id);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Updated League",
        overs: 10,
        players_per_team: 8,
        points_win: 4,
        rules: tournament.rules,
      }),
    );
  });

  it("keeps the editor open and restores Save after a rejected update", async () => {
    mocks.single.mockResolvedValue({ data: null, error: { message: "Permission denied" } });
    const onSaved = vi.fn();
    render(<TournamentForm tournament={tournament} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Permission denied"));
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });

  it("cancels without saving changes", () => {
    const onCancel = vi.fn();
    render(<TournamentForm tournament={tournament} onCancel={onCancel} />);
    fireEvent.change(screen.getByDisplayValue("Colombo League"), {
      target: { value: "Discard this" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("saves logo changes on the legacy schema without sending unavailable columns", async () => {
    const legacy = { ...tournament, logo_url: "data:image/webp;base64,existing" };
    for (const key of [
      "competition_format",
      "location",
      "description",
      "start_date",
      "end_date",
      "ranking_rule",
      "points_no_result",
    ]) {
      Reflect.deleteProperty(legacy, key);
    }
    const onSaved = vi.fn().mockResolvedValue(undefined);
    render(<TournamentForm tournament={legacy} onSaved={onSaved} />);
    expect(screen.queryByRole("combobox", { name: "Tournament format" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove logo" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    const values = mocks.update.mock.calls[0]![0];
    expect(values.logo_url).toBeNull();
    expect(values.rules).toEqual(tournament.rules);
    for (const key of [
      "competition_format",
      "location",
      "description",
      "start_date",
      "end_date",
      "ranking_rule",
      "points_no_result",
    ]) {
      expect(values).not.toHaveProperty(key);
    }
    expect(mocks.error).not.toHaveBeenCalled();
  });
});
