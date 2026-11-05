import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SiteHeader } from "@/components/cricket/bits";

export const Route = createFileRoute("/auth")({
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
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) { toast.error(error.message); return; }
      navigate({ to: "/dashboard" });
    } else {
      const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + "/dashboard" } });
      setBusy(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Check your email to confirm your account.");
      setMode("in");
    }
  };

  const google = async () => {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) { toast.error(String(r.error.message ?? r.error)); return; }
    if (r.redirected) return;
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="min-h-screen pinstripe">
      <SiteHeader />
      <main className="mx-auto max-w-sm px-4 py-12">
        <h1 className="text-4xl font-extrabold text-primary">{mode === "in" ? "Welcome back" : "Join the scorers"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Spectators don't need an account — only scorers do.</p>
        <form onSubmit={submit} className="mt-8 space-y-4 rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {mode === "in" ? "Sign in" : "Create account"}
          </Button>
          <Button type="button" variant="outline" className="w-full" onClick={google}>
            Continue with Google
          </Button>
        </form>
        <button className="mt-4 text-sm text-primary underline-offset-4 hover:underline" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>
      </main>
    </div>
  );
}
