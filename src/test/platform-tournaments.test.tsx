import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ directory: vi.fn(), details: vi.fn(), manage: vi.fn() }));
vi.mock("@/lib/platform-tournaments", async (original) => ({
  ...(await original<typeof import("@/lib/platform-tournaments")>()),
  getTournamentDirectory: mocks.directory,
  inspectTournament: mocks.details,
  manageTournament: mocks.manage,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));
import { PlatformTournaments } from "@/components/platform-tournaments";
import { tournamentActions, type ManagedTournament } from "@/lib/platform-tournaments";
const t = {
  id: "cup",
  name: "Test Cup",
  short_name: "TC",
  created_by: "organizer",
  created_at: "2026-01-01",
  organizer: "Organizer",
  email: "organizer@test.local",
  logo_url: null,
  teams: 4,
  players: 24,
  matches: 6,
  live_matches: 0,
  lifecycle: "active",
  platform_hidden: false,
  platform_disabled: false,
  platform_archived: false,
  platform_deleted_at: null,
} as ManagedTournament;
const summary = {
  total: 1,
  active: 1,
  completed: 0,
  upcoming: 0,
  hidden: 0,
  disabled: 0,
  archived: 0,
};
function mount() {
  mocks.directory.mockResolvedValue({ rows: [t], total: 1, summary });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PlatformTournaments actorId="admin" actorRole="admin" />
    </QueryClientProvider>,
  );
}
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("shows applicable actions without offering permanent deletion or admin transfers", () => {
  expect(tournamentActions("user", t)).toEqual([]);
  expect(tournamentActions("admin", t)).not.toContain("transfer");
  expect(tournamentActions("owner", t)).toContain("transfer");
  expect(tournamentActions("owner", { ...t, live_matches: 1 })).not.toContain("delete");
  expect(tournamentActions("admin", { ...t, platform_deleted_at: "2026-01-02" })).toEqual([
    "recover",
  ]);
  expect(
    tournamentActions("admin", {
      ...t,
      platform_archived: true,
      platform_disabled: true,
      platform_hidden: true,
    }),
  ).toEqual(["edit", "unhide", "enable", "restore", "delete"]);
});
it("provides desktop and mobile records and sends independent server filters", async () => {
  mount();
  await screen.findByRole("table");
  expect(screen.getByRole("article")).toHaveTextContent("4 teams");
  mocks.directory.mockResolvedValue({ rows: [], total: 0, summary });
  fireEvent.change(screen.getByLabelText("Public visibility"), { target: { value: "hidden" } });
  await screen.findByText("No tournaments match these filters.");
  expect(mocks.directory).toHaveBeenLastCalledWith(
    expect.objectContaining({ visibility: "hidden", status: "all", page: 0 }),
  );
  expect(mocks.manage).not.toHaveBeenCalled();
});
it("clears private directory contents on an authorization error", async () => {
  mount();
  await screen.findByRole("table");
  mocks.directory.mockRejectedValue(new Error("Platform access denied"));
  fireEvent.click(screen.getByRole("button", { name: "Refresh directory" }));
  await screen.findByRole("alert");
  await waitFor(() => expect(screen.queryByRole("table")).toBeNull());
});
it("requires the exact tournament name and a reason before recoverable deletion", async () => {
  mount();
  await screen.findByRole("table");
  fireEvent.keyDown(screen.getAllByRole("button", { name: "Actions for Test Cup" })[0]!, {
    key: "ArrowDown",
  });
  fireEvent.click(await screen.findByRole("menuitem", { name: "Delete tournament" }));
  expect(screen.getByText(/Recoverable deletion only/)).toBeInTheDocument();
  const confirm = screen.getByRole("button", { name: "Confirm" });
  expect(confirm).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Reason (required)"), {
    target: { value: "Organizer requested removal" },
  });
  fireEvent.change(screen.getByLabelText(/Type.*Test Cup.*confirm/), {
    target: { value: "wrong" },
  });
  expect(confirm).toBeDisabled();
  expect(mocks.manage).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText(/Type.*Test Cup.*confirm/), {
    target: { value: "Test Cup" },
  });
  fireEvent.click(confirm);
  await waitFor(() =>
    expect(mocks.manage).toHaveBeenCalledWith(
      "cup",
      "delete",
      expect.any(Object),
      "Organizer requested removal",
      "Test Cup",
    ),
  );
});
