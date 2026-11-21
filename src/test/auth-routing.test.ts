import { beforeEach, expect, it, vi } from "vitest";
import { isRedirect } from "@tanstack/react-router";

const getUser = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getUser } } }));
vi.mock("@/components/cricket/bits", () => ({ SiteHeader: () => null }));
vi.mock("@/lib/google-auth", () => ({ signInWithGoogle: vi.fn() }));
vi.mock("@/lib/global-settings", () => ({ globalDefault: vi.fn() }));
import { Route } from "@/routes/auth";

const enter = async () => Route.options.beforeLoad!(undefined as never);
beforeEach(() => { getUser.mockReset(); });

it("verifies the session before replacing /auth with /dashboard", async () => {
  let resolve!: (value: unknown) => void;
  getUser.mockReturnValue(new Promise(r => { resolve = r; }));
  let settled = false;
  const pending = enter().catch(error => { settled = true; return error; });
  await Promise.resolve();
  expect(settled).toBe(false);
  resolve({ data: { user: { id: "verified-user" } }, error: null });
  const result = await pending;
  expect(isRedirect(result)).toBe(true);
  expect(result.options).toMatchObject({ to: "/dashboard", replace: true });
  expect(getUser).toHaveBeenCalledTimes(1);
  expect(Route.options.ssr).toBe(false);
});

it.each([
  { data: { user: null }, error: null },
  { data: { user: null }, error: { message: "Session expired" } },
  { data: { user: { id: "stale-user" } }, error: { message: "Invalid session" } },
])("keeps sign-in available when verification fails: %j", async result => {
  getUser.mockResolvedValue(result);
  await expect(enter()).resolves.toBeUndefined();
});

it("keeps sign-in available after a network failure without a redirect loop", async () => {
  getUser.mockRejectedValue(new Error("Network unavailable"));
  await expect(enter()).resolves.toBeUndefined();
});

it("redirects verified admins using the same user route without changing roles", async () => {
  const user = { id: "admin-user", app_metadata: { role: "platform_admin" } };
  getUser.mockResolvedValue({ data: { user }, error: null });
  const result = await enter().catch(error => error);
  expect(result.options).toMatchObject({ to: "/dashboard", replace: true });
  expect(user.app_metadata.role).toBe("platform_admin");
});
