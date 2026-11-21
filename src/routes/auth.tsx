import { useState } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { signInWithGoogle } from "@/lib/google-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SiteHeader } from "@/components/cricket/bits";
import { globalDefault } from '@/lib/global-settings';

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    // Verify with Auth, rather than trusting a possibly stale cached session.
    const verified = await supabase.auth.getUser().catch(() => null);
    if (verified && !verified.error && verified.data.user) {
      throw redirect({ to: "/dashboard", replace: true });
    }
  },
  head: () => ({
    meta: [
      { title: "Sign in — Crease" },
      { name: "description", content: "Sign in to create matches and score ball by ball." },
      { property: "og:title", content: "Sign in — Crease" },
      { property: "og:description", content: "Sign in to create matches and score ball by ball." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'up' && (!globalDefault('registrations', true) || globalDefault('maintenance', false))) {
      toast.error('New registrations are temporarily closed. Existing accounts can still sign in.');
      return;
    }
    setBusy(true);
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      navigate({ to: "/dashboard" });
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin + "/dashboard" },
      });
      setBusy(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Check your email to confirm your account.");
      setMode("in");
    }
  };

  const google = async () => {
    setGoogleBusy(true);
    try {
      const result = await signInWithGoogle();
      if (result.error) throw result.error;
      if (result.redirected) return;
      await navigate({ to: "/dashboard" });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Google sign-in failed. Please try again.",
      );
    } finally {
      setGoogleBusy(false);
    }
  };

  return (
    <div className="tournament-page front-page min-h-screen">
      <SiteHeader />
      <main className="mx-auto grid max-w-6xl gap-10 px-5 py-10 sm:px-8 lg:grid-cols-2 lg:items-center lg:py-20">
        <aside className="auth-story">
          <p className="front-eyebrow">Welcome to Crease</p>
          <h2 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            Great games.
            <br />
            <span className="text-primary">Shared moments.</span>
          </h2>
          <p className="mt-5 max-w-md leading-relaxed text-muted-foreground">
            One place to organise your tournament, score every ball, and bring the crowd closer to
            the game.
          </p>
          <div className="mt-10 space-y-5">
            <p>
              <strong className="text-primary">01</strong>
              <span className="ml-4 font-semibold">Create a match your way</span>
            </p>
            <p>
              <strong className="text-primary">02</strong>
              <span className="ml-4 font-semibold">Score it live, ball by ball</span>
            </p>
            <p>
              <strong className="text-primary">03</strong>
              <span className="ml-4 font-semibold">Share the action with everyone</span>
            </p>
          </div>
        </aside>
        <section className="auth-panel">
          <h1 className="text-3xl font-bold tracking-tight">
            {mode === "in" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Spectators don't need an account — only scorers do.
          </p>
          <form onSubmit={submit} className="mt-8 space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy || googleBusy}>
              {mode === "in" ? "Sign in" : "Create account"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={google}
              disabled={busy || googleBusy}
            >
              {googleBusy ? "Signing in with Google…" : "Continue with Google"}
            </Button>
          </form>
          <button
            className="mt-4 text-sm text-primary underline-offset-4 hover:underline"
            onClick={() => {
              if (mode === 'in' && (!globalDefault('registrations', true) || globalDefault('maintenance', false))) {
                toast.error('New registrations are temporarily closed. Existing accounts can still sign in.');
                return;
              }
              setMode(mode === "in" ? "up" : "in");
            }}
          >
            {mode === "in" ? "New here? Create an account" : "Already have an account? Sign in"}
          </button>
        </section>
      </main>
    </div>
  );
}
