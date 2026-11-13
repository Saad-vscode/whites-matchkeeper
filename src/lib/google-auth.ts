import { lovable } from "@/integrations/lovable";

export async function signInWithGoogle() {
  const redirectTo = new URL("/dashboard", window.location.origin).href;
  // Managed Google OAuth needs Lovable's hosting broker. Calling the backend
  // directly bypasses it and fails because managed credentials aren't stored there.
  if (["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname)) {
    return {
      error: new Error("Google sign-in is unavailable in this local preview. Open the hosted app to use Google, or sign in with email here."),
      redirected: false,
    };
  }
  return lovable.auth.signInWithOAuth("google", { redirect_uri: redirectTo });
}
