import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
const api = vi.hoisted(() => ({
  rpc: vi.fn(),
  session: vi.fn(),
  listener: null as null | ((event: string, session: unknown) => void),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: api.rpc,
    auth: {
      getSession: api.session,
      onAuthStateChange: (listener: typeof api.listener) => {
        api.listener = listener;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
  },
}));
import { allFeatures, useFeatureAccess } from "@/lib/feature-access";
const clients: QueryClient[] = [];
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}
beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  api.session.mockResolvedValue({ data: { session: { user: { id: "alice" } } }, error: null });
  api.rpc.mockResolvedValue({ data: allFeatures(true), error: null });
});
afterEach(() => {
  cleanup();
  onlineManager.setOnline(true);
  clients.splice(0).forEach((client) => client.clear());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it("resolves shared access through the match and drops stale access after a failed refresh", async () => {
  const { wrapper, client } = setup();
  const { result } = renderHook(() => useFeatureAccess({ match: "match-one" }), { wrapper });
  await waitFor(() => expect(result.current.allows("tv")).toBe(true));
  expect(api.rpc).toHaveBeenCalledWith("read_feature_access", { _match: "match-one" });
  api.rpc.mockResolvedValue({ data: null, error: new Error("Access revoked") });
  await act(async () => {
    await client.invalidateQueries({ queryKey: ["feature-access"] });
  });
  await waitFor(() => expect(result.current.allows("tv")).toBe(false));
});
it("restores features from a new server decision without changing browser preferences", async () => {
  const { wrapper, client } = setup();
  localStorage.setItem("crease-presentation", "saved preferences");
  api.rpc.mockResolvedValue({ data: { ...allFeatures(true), sound: false }, error: null });
  const { result } = renderHook(() => useFeatureAccess(), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.allows("sound")).toBe(false);
  api.rpc.mockResolvedValue({ data: allFeatures(true), error: null });
  await act(async () => {
    await client.invalidateQueries({ queryKey: ["feature-access"] });
  });
  await waitFor(() => expect(result.current.allows("sound")).toBe(true));
  expect(localStorage.getItem("crease-presentation")).toBe("saved preferences");
});
it("keeps verified offline access across remounts, separately for each account", async () => {
  localStorage.setItem("crease-feature-offline:alice", JSON.stringify({ offline: true }));
  localStorage.setItem("crease-feature-offline:bob", JSON.stringify({ offline: false }));
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  onlineManager.setOnline(false);
  const { wrapper } = setup();
  const { result } = renderHook(() => useFeatureAccess(), { wrapper });
  await waitFor(() => expect(result.current.allows("offline")).toBe(true));
  act(() => api.listener?.("SIGNED_IN", { user: { id: "bob" } }));
  await waitFor(() => expect(result.current.allows("offline")).toBe(false));
});
