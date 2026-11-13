
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";

export async function signInWithGoogle() {
  const redirectTo = new URL("/dashboard", window.location.origin).href;
  const hostname = window.location.hostname;

  // Keep Google login disabled in local development.
  if (["localhost", "127.0.0.1", "[::1]"].includes(hostname)) {
    return {
      error: new Error("Google sign-in is unavailable in local preview."),
      redirected: false,
    };
  }

  // Use Supabase OAuth on Vercel.
  if (hostname.endsWith(".vercel.app")) {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
      },
    });

    return {
      error,
      redirected: Boolean(data?.url),
    };
  }

  // Keep the existing Lovable authentication flow.
  return lovable.auth.signInWithOAuth("google", {
    redirect_uri: redirectTo,
  });
}
