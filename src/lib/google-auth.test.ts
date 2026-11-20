import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ oauth: vi.fn(), broker: vi.fn(), session: vi.fn() }));
vi.mock("@lovable.dev/cloud-auth-js", () => ({
  createLovableAuth: () => ({ signInWithOAuth: mocks.broker }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signInWithOAuth: mocks.oauth, setSession: mocks.session } },
}));

import { signInWithGoogle } from "./google-auth";

describe("Google sign-in", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("window", {
      location: { origin: "https://crease.lovable.app", hostname: "crease.lovable.app" },
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ["127.0.0.1", "http://127.0.0.1:8081"],
    ["localhost", "http://localhost:5173"],
    ["[::1]", "http://[::1]:8081"],
  ])("uses real Supabase OAuth on %s with the exact local port", async (hostname, origin) => {
    vi.stubGlobal("window", { location: { origin, hostname } });
    mocks.oauth.mockResolvedValue({
      data: { url: "https://provider.test/authorize" },
      error: null,
    });
    expect(await signInWithGoogle()).toEqual({ error: null, redirected: true });
    expect(mocks.oauth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: origin + "/dashboard" },
    });
    expect(mocks.broker).not.toHaveBeenCalled();
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it("preserves Vercel OAuth and returns local provider errors without fabricating a session", async () => {
    vi.stubGlobal("window", {
      location: { origin: "https://crease.vercel.app", hostname: "crease.vercel.app" },
    });
    const error = new Error("Provider not configured");
    mocks.oauth.mockResolvedValue({ data: { url: null }, error });
    expect(await signInWithGoogle()).toEqual({ error, redirected: false });
    expect(mocks.oauth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "https://crease.vercel.app/dashboard" },
    });
    expect(mocks.broker).not.toHaveBeenCalled();
  });

  it("preserves hosted redirects and returns to the dashboard", async () => {
    mocks.broker.mockResolvedValue({ error: null, redirected: true });
    expect(await signInWithGoogle()).toEqual({ error: null, redirected: true });
    expect(mocks.broker).toHaveBeenCalledWith(
      "google",
      expect.objectContaining({ redirect_uri: "https://crease.lovable.app/dashboard" }),
    );
    expect(mocks.session).not.toHaveBeenCalled();
  });

  it("reports a session rejection instead of treating it as a successful login", async () => {
    mocks.broker.mockResolvedValue({
      error: null,
      tokens: { access_token: "access", refresh_token: "refresh" },
    });
    const error = new Error("Session rejected");
    mocks.session.mockResolvedValue({ error });
    expect(await signInWithGoogle()).toEqual({ error });
  });

  it("returns provider errors without attempting to save a session", async () => {
    const error = new Error("Popup was blocked");
    mocks.broker.mockResolvedValue({ error });
    expect(await signInWithGoogle()).toEqual({ error });
    expect(mocks.session).not.toHaveBeenCalled();
  });
});
