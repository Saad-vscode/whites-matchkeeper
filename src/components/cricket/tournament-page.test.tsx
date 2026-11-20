vi.mock("@/lib/feature-access", async (original) => { const module = await original<typeof import("@/lib/feature-access")>(); const access = module.allFeatures(true); return { ...module, useFeatureAccess: () => ({ allows: () => true, access }) }; });
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { deliveryFixture, matchFixture, teamFixture, tournamentFixture } from "@/test/tournament-fixtures";
// jsdom has no layout observers; Embla uses these to track slide visibility.
class LayoutObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("IntersectionObserver", LayoutObserver);
vi.stubGlobal("ResizeObserver", LayoutObserver);
const state = vi.hoisted(() => ({
  owner: true,
  scoreIds: [] as string[],
  userId: "owner",
  status: "live",
  finished: false,
  rpc: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: state.rpc } }));
vi.mock("@/lib/cricket/use-playoffs", () => ({usePlayoffs:()=>({isPending:true})}));
vi.mock("./bits", () => ({
  useUser: () => ({ user: { id: state.userId } }),
  StatusPill: ({ status }: { status: string }) => <span>{status}</span>,
}));
vi.mock("@/lib/cricket/use-tournament", () => ({
  useTournament: () => ({
    isLoading: false,
    isError: false,
    data: {
      tournament: tournamentFixture(),
      teams: [teamFixture("a", "Lions"), teamFixture("b", "Eagles")],
      groups: [],
      matches: [matchFixture({ status: state.status, rules: state.finished ? { tournamentStage: { kind: "other", title: "Final" } } : {} })],
      deliveries: state.finished ? [deliveryFixture({ runs_bat: 4, wicket: { kind: "bowled", playerOut: "Alex" } }), deliveryFixture({ id: "chase", innings: 2, runs_bat: 6 })] : [],
      schemaPending: false,
    },
  }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: { owner: state.owner, scoreIds: state.scoreIds } }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  Link: ({
    children,
    to,
    params,
    ...rest
  }: {
    children: React.ReactNode;
    to: string;
    params?: Record<string, string>;
  }) => (
    <a href={to.replace(/\$(\w+)/g, (_, key) => params?.[key] ?? key)} {...rest}>
      {children}
    </a>
  ),
}));
import { TournamentPage } from "./tournament-page";
function tab(name: string) {
  fireEvent.mouseDown(screen.getByRole("tab", { name }), { button: 0, ctrlKey: false });
}
describe("tournament view permissions", () => {
  beforeEach(() => {
    state.owner = true;
    state.scoreIds = ["match"];
    state.userId = "owner";
    state.status = "live";
    state.finished = false;
    state.rpc.mockReset();
    state.rpc.mockResolvedValue({ error: null });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
  it("confirms before using guarded scheduled deletion", () => {
    state.status = "scheduled";
    render(<TournamentPage tournamentId="tour" management />);
    tab("matches");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "Delete scheduled match" }));
    expect(state.rpc).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Delete scheduled match" }));
    expect(state.rpc).toHaveBeenCalledWith("delete_scheduled_match", { _match: "match" });
  });
  it.each(["live", "completed", "abandoned", "cancelled"])(
    "never offers deletion for %s matches",
    (status) => {
      state.status = status;
      render(<TournamentPage tournamentId="tour" management />);
      tab("matches");
      expect(
        screen.queryByRole("button", { name: "Delete scheduled match" }),
      ).not.toBeInTheDocument();
    },
  );
  it("does not let assigned scorers delete scheduled matches", () => {
    state.status = "scheduled";
    state.owner = false;
    render(<TournamentPage tournamentId="tour" management />);
    tab("matches");
    expect(
      screen.queryByRole("button", { name: "Delete scheduled match" }),
    ).not.toBeInTheDocument();
  });
  it("keeps the public route read-only even for a signed-in owner", () => {
    render(<TournamentPage tournamentId="tour" />);
    expect(screen.queryByRole("link", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /schedule match/i })).not.toBeInTheDocument();
    tab("teams");
    expect(screen.queryByRole("button", { name: /add team/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Lions/ }));
    expect(screen.getByRole("heading", { name: "Squad" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit team/i })).not.toBeInTheDocument();
    tab("matches");
    expect(screen.getByRole("link", { name: /Lions/ })).toHaveAttribute("href", "/match/match");
    expect(screen.queryByRole("link", { name: "Scoring controls" })).not.toBeInTheDocument();
    tab("points");
    expect(screen.queryByRole("button", { name: /create new group/i })).not.toBeInTheDocument();
    tab("statistics");
    expect(screen.getByText("Highest Individual Score")).toBeInTheDocument();
  });
  it("shows management actions only after the ownership check succeeds", () => {
    render(<TournamentPage tournamentId="tour" management />);
    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      "/tournaments/tour/edit",
    );
    expect(screen.getByRole("button", { name: "Start / schedule match" })).toBeInTheDocument();
  });
  it("allows an assigned scorekeeper to score without tournament management", () => {
    state.owner = false;
    state.userId = "scorer";
    render(<TournamentPage tournamentId="tour" management />);
    expect(screen.queryByRole("link", { name: "Edit" })).not.toBeInTheDocument();
    tab("matches");
    expect(screen.getByRole("link", { name: "Scoring controls" })).toHaveAttribute(
      "href",
      "/score/match",
    );
    expect(screen.queryByRole("button", { name: /schedule match/i })).not.toBeInTheDocument();
  });
  it("does not give another signed-in user scoring controls", () => {
    state.owner = false;
    state.scoreIds = [];
    state.userId = "other";
    render(<TournamentPage tournamentId="tour" management />);
    tab("matches");
    expect(screen.queryByRole("link", { name: "Scoring controls" })).not.toBeInTheDocument();
  });
  it.each(["owner", "scorer", "spectator"])("shows completed honours and appropriate TV control for %s on public Home", (role) => {
    state.finished = true;
    state.status = "completed";
    state.owner = role === "owner";
    state.scoreIds = role === "scorer" ? ["match"] : [];
    render(<TournamentPage tournamentId="tour" />);
    expect(screen.getByText("Champions")).toBeInTheDocument();
    expect(screen.getByText("Runner-up")).toBeInTheDocument();
    expect(screen.getByText("Player of the Series")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Teams" })).toBeNull();
    const button = screen.queryByRole("button", { name: "Start tournament honours" });
    if (role === "spectator") expect(button).toBeNull();
    else expect(button).toBeInTheDocument();
  });
});
