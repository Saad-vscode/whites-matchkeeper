import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { ballLabel, countsAsWicket, type Delivery } from "@/lib/cricket/engine";
import type { ConnState } from "@/lib/cricket/match";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);
  return { user, ready };
}

export function BallChip({ d, size = "md" }: { d: Delivery; size?: "md" | "lg" | "xl" }) {
  const label = ballLabel(d);
  const tone = countsAsWicket(d.wicket)
    ? "bg-wicket text-accent-foreground border-wicket"
    : d.extra_type === "wide" || d.extra_type === "noball"
      ? "bg-extra text-foreground border-extra"
      : d.runs_bat === 6
        ? "bg-six text-accent-foreground border-six"
        : d.runs_bat === 4
          ? "bg-four text-accent-foreground border-four"
          : "bg-card text-foreground border-border";
  const dims = size === "xl" ? "h-20 min-w-20 text-3xl" : size === "lg" ? "h-12 min-w-12 text-lg" : "h-8 min-w-8 text-xs";
  return (
    <span className={cn("inline-flex items-center justify-center rounded-full border-2 px-1.5 score-num", dims, tone)}>
      {label}
    </span>
  );
}

export function ConnBadge({ conn, lastUpdated, dark }: { conn: ConnState; lastUpdated: Date | null; dark?: boolean }) {
  const color = conn === "live" ? "bg-online" : conn === "offline" ? "bg-wicket" : "bg-extra";
  const text = conn === "live" ? "Live" : conn === "offline" ? "Disconnected" : "Connecting";
  return (
    <span className={cn("inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider", dark ? "text-board-muted" : "text-muted-foreground")}>
      <span className={cn("h-2 w-2 rounded-full", color, conn === "live" && "live-dot")} />
      {text}
      {lastUpdated && <span className="font-normal normal-case tracking-normal">· {lastUpdated.toLocaleTimeString()}</span>}
    </span>
  );
}

export function SiteHeader() {
  const { user } = useUser();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };
  return (
    <header className="border-b border-border bg-card/70 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <Link to="/" className="flex items-baseline gap-2">
          <span className="font-display text-2xl font-extrabold text-primary">Crease</span>
          <span className="hidden text-xs uppercase tracking-[0.2em] text-muted-foreground sm:inline">cricket scoring</span>
        </Link>
        <nav className="flex items-center gap-2">
          {user ? (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/dashboard">My matches</Link>
              </Button>
              <Button variant="outline" size="sm" onClick={signOut}>
                Sign out
              </Button>
            </>
          ) : (
            <Button asChild size="sm">
              <Link to="/auth">Sign in</Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}

export function StatusPill({ status }: { status: string }) {
  const live = status === "live";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider",
        live ? "bg-live text-accent-foreground" : status === "completed" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
      )}
    >
      {live && <span className="h-1.5 w-1.5 rounded-full bg-accent-foreground live-dot" />}
      {status.replace("_", " ")}
    </span>
  );
}
