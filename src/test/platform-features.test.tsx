import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ details: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/feature-access", async (original) => ({
  ...(await original<typeof import("@/lib/feature-access")>()),
  featureDetails: api.details,
  saveFeatures: api.save,
}));
import { FeatureEditor } from "@/components/platform-features";
import { allFeatures, animationFeature, FEATURE_IDS } from "@/lib/feature-access";
import type { ManagedUser } from "@/lib/platform-users";
const user: ManagedUser = {
  id: "alice",
  full_name: "Alice",
  email: "alice@example.com",
  role: "user",
  status: "active",
  avatar_url: null,
  tournaments: 2,
  created_at: "2026-01-01",
  last_sign_in_at: null,
};
const rows = FEATURE_IDS.map((id) => ({
  id,
  label: id,
  category: "Presentation",
  enabled: true,
  default_enabled: true,
  overridden: false,
  changed_at: null,
  changed_by: null,
  administrator: null,
}));
function mount(target = user, actorRole: "owner" | "admin" = "owner") {
  api.details.mockResolvedValue(rows);
  api.save.mockResolvedValue(undefined);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <FeatureEditor target={target} actorRole={actorRole} />
    </QueryClientProvider>,
  );
}
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("registers only supported features and separates animation categories", () => {
  expect(Object.keys(allFeatures(true))).toHaveLength(12);
  expect(animationFeature("winning_six")).toBe("boundaries");
  expect(animationFeature("golden_duck")).toBe("wickets");
  expect(animationFeature("hat_trick")).toBe("moments");
});
it("saves only the selected user's changed permissions and retains other choices", async () => {
  mount();
  await screen.findByText("12 enabled · 0 restricted");
  fireEvent.click(screen.getByRole("checkbox", { name: /^sound / }));
  expect(screen.getByText("11 enabled · 1 restricted")).toBeInTheDocument();
  expect(api.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Save permissions" }));
  await waitFor(() => expect(api.save).toHaveBeenCalledWith("alice", { sound: false }, false));
});
it("stages default restoration until Save and lets admins only inspect other admins", async () => {
  mount();
  await screen.findByText("12 enabled · 0 restricted");
  fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));
  expect(api.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Save permissions" }));
  await waitFor(() => expect(api.save).toHaveBeenCalledWith("alice", {}, true));
  cleanup();
  mount({ ...user, role: "owner" }, "admin");
  await screen.findByText("12 enabled · 0 restricted");
  screen.getAllByRole("checkbox").forEach((input) => expect(input).toBeDisabled());
  expect(screen.queryByRole("button", { name: "Save permissions" })).toBeNull();
});
it("does not expose stale controls after permission loading fails", async () => {
  mount();
  api.details.mockRejectedValue(new Error("Access revoked"));
  cleanup();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <FeatureEditor target={user} actorRole="owner" />
    </QueryClientProvider>,
  );
  await screen.findByRole("alert");
  expect(screen.queryByRole("checkbox")).toBeNull();
});
