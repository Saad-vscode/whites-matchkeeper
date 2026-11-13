import { cleanup, render, screen, waitFor, act } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TournamentName } from "@/components/cricket/tournament-name";
import { useTournamentBranding } from "./tournament-branding";
import { tvTournamentName } from "./tv-tournament-name";
const state = vi.hoisted(() => ({
  name: "Old tournament",
  refresh: () => {},
  read: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: state.read }) }) }),
    channel: () => {
      const channel = {
        on: (_event: unknown, _filter: unknown, callback: () => void) => {
          state.refresh = callback;
          return channel;
        },
        subscribe: () => channel,
      };
      return channel;
    },
    removeChannel: state.remove,
  },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("replaces fixture snapshots with the current tournament name and updates open views after a rename", async () => {
  state.name = "Old tournament";
  state.read.mockImplementation(async () => ({
    data: { name: state.name, short_name: "OLD", logo_url: null },
    error: null,
  }));
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={cache}>
      <TournamentName id="cup" fallback="Old copied fixture label" />
    </QueryClientProvider>,
  );
  expect(await screen.findByText("Old tournament")).toBeInTheDocument();
  state.name = "Renamed Premier League";
  act(() => state.refresh());
  await waitFor(() => expect(screen.getByText("Renamed Premier League")).toBeInTheDocument());
  expect(screen.queryByText("OLD")).toBeNull();
  expect(screen.queryByText("Old copied fixture label")).toBeNull();
  view.unmount();
  expect(state.remove).toHaveBeenCalled();
  cache.clear();
});
it("keeps quick-match names without fetching a tournament", () => {
  const cache = new QueryClient();
  render(
    <QueryClientProvider client={cache}>
      <TournamentName id={null} fallback="Sunday friendly" />
    </QueryClientProvider>,
  );
  expect(screen.getByText("Sunday friendly")).toBeInTheDocument();
  expect(state.read).not.toHaveBeenCalled();
  cache.clear();
});

it("updates the TV short name live and falls back when it is blank", async () => {
  let shortName = "APL";
  state.read.mockImplementation(async () => ({
    data: { name: "Premier League", short_name: shortName, logo_url: null }, error: null,
  }));
  function TvName() {
    return <>{tvTournamentName(useTournamentBranding("cup").data)}</>;
  }
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={cache}><TvName /></QueryClientProvider>);
  expect(await screen.findByText("APL")).toBeInTheDocument();
  expect(screen.queryByText("Premier League")).toBeNull();
  shortName = "UPL";
  act(() => state.refresh());
  expect(await screen.findByText("UPL")).toBeInTheDocument();
  shortName = "   ";
  act(() => state.refresh());
  expect(await screen.findByText("Premier League")).toBeInTheDocument();
  view.unmount();
  cache.clear();
});
