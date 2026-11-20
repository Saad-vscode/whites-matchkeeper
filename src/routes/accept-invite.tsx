import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useUser, SiteHeader } from "@/components/cricket/bits";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
export const Route = createFileRoute("/accept-invite")({
  ssr: false,
  component: AcceptInvite,
  head: () => ({
    meta: [{ title: "Accept invitation - Crease" }, { name: "robots", content: "noindex" }],
  }),
});
function AcceptInvite() {
  const { user, ready } = useUser();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="tournament-page front-page min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-lg px-5 py-12">
        <section className="rounded-2xl border border-border bg-card p-7">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">
            Welcome to Crease
          </p>
          <h1 className="mt-3 text-2xl font-bold">Set your password</h1>
          <p className="my-4 text-sm text-muted-foreground">
            Complete your invitation to manage your cricket matches.
          </p>
          {!ready ? (
            <p role="status">Checking invitation…</p>
          ) : !user ? (
            <p role="alert">
              Open the secure link in your invitation email. If it has expired, contact your
              administrator.
            </p>
          ) : done ? (
            <>
              <p className="mb-4">Your password has been saved.</p>
              <Button asChild>
                <Link to="/dashboard">Continue in User Mode</Link>
              </Button>
            </>
          ) : (
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                if (password !== confirm) {
                  setError("Passwords must match.");
                  return;
                }
                setBusy(true);
                setError("");
                const result = await supabase.auth.updateUser({ password });
                setBusy(false);
                if (result.error) setError(result.error.message);
                else setDone(true);
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="invite-password">Password (at least 12 characters)</Label>
                <Input
                  id="invite-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-confirm">Confirm password</Label>
                <Input
                  id="invite-confirm"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button disabled={busy} type="submit">
                {busy ? "Saving…" : "Save password"}
              </Button>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}
