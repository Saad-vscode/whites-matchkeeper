import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";

export async function signInWithGoogle() {
  const redirectTo = new URL("/dashboard", window.location.origin).href;
  const hostname = window.location.hostname;

  // Loopback development uses the same Supabase project as the deployed app.
  // The current origin (including port) must be on that project's redirect allowlist.
  const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
  // Preserve the existing Vercel flow and Lovable-hosted broker below.
  if (isLoopback || hostname.endsWith(".vercel.app")) {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
      },
    });

    return {
      error,
      redirected: !error && Boolean(data?.url),
    };
  }

  // Keep the existing Lovable authentication flow.
  return lovable.auth.signInWithOAuth("google", {
    redirect_uri: redirectTo,
  });
}
