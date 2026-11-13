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
    vi.stubGlobal("window", { location: { origin: "https://crease.lovable.app", hostname: "crease.lovable.app" } });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("keeps local users on the sign-in page instead of redirecting to an unconfigured provider", async () => {
    vi.stubGlobal("window", { location: { origin: "http://localhost:5173", hostname: "localhost" } });
    const result = await signInWithGoogle();
    expect(result.redirected).toBe(false);
    expect(result.error?.message).toContain("Open the hosted app");
    expect(mocks.oauth).not.toHaveBeenCalled();
    expect(mocks.broker).not.toHaveBeenCalled();
  });

  it("preserves hosted redirects and returns to the dashboard", async () => {
    mocks.broker.mockResolvedValue({ error: null, redirected: true });
    expect(await signInWithGoogle()).toEqual({ error: null, redirected: true });
    expect(mocks.broker).toHaveBeenCalledWith("google", expect.objectContaining({ redirect_uri: "https://crease.lovable.app/dashboard" }));
    expect(mocks.session).not.toHaveBeenCalled();
  });

  it("reports a session rejection instead of treating it as a successful login", async () => {
    mocks.broker.mockResolvedValue({ error: null, tokens: { access_token: "access", refresh_token: "refresh" } });
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
