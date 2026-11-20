import { usePlatformRole } from "@/lib/platform-admin";
import { PlatformModeSwitch } from "@/components/platform-mode-switch";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { ballLabel, countsAsWicket, type Delivery } from "@/lib/cricket/engine";
import type { ConnState } from "@/lib/cricket/match";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Settings2, LayoutGrid, UserRound, LogOut, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

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
  const dims = size === "xl" ? "h-20 w-20" : size === "lg" ? "h-12 w-12" : "h-8 w-8";
  return (
    <span aria-label={label} title={label} className={cn("inline-flex shrink-0 items-center justify-center rounded-full border-2 score-num", dims, tone)}>
      <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden="true">
        <text x="50" y="50" textAnchor="middle" dominantBaseline="central" fill="currentColor" fontSize="44" textLength={label.length > 2 ? 76 : undefined} lengthAdjust="spacingAndGlyphs">{label}</text>
      </svg>
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
  const platformRole = usePlatformRole(user?.id);
  const isPlatformAdmin = !platformRole.isError && (platformRole.data === "owner" || platformRole.data === "admin");
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
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-5 sm:px-8">
        {isPlatformAdmin ? <div><Link to="/" className="flex items-baseline gap-2">
          <span className="text-2xl font-extrabold tracking-tight text-primary">Crease</span>
          <span className="hidden text-xs uppercase tracking-[0.2em] text-muted-foreground sm:inline">cricket scoring</span>
        </Link><PlatformModeSwitch /></div> : <Link to="/" className="flex items-baseline gap-2">
          <span className="text-2xl font-extrabold tracking-tight text-primary">Crease</span>
          <span className="hidden text-xs uppercase tracking-[0.2em] text-muted-foreground sm:inline">cricket scoring</span>
        </Link>}
        <nav aria-label="Main navigation" className="flex items-center gap-1 rounded-xl border border-border bg-background p-1 sm:gap-2">
          <Link to="/settings" activeProps={{className:"bg-primary/10 text-primary"}} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors hover:bg-muted"><Settings2 size={17}/><span className="hidden sm:inline">Settings</span><span className="sr-only sm:hidden">Settings</span></Link>
          {user ? (
            <>
              <Link to="/dashboard" activeProps={{className:"bg-primary/10 text-primary"}} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors hover:bg-muted"><LayoutGrid size={17}/><span className="hidden sm:inline">My matches</span><span className="sr-only sm:hidden">My matches</span></Link>
              <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="sm" aria-label="Account menu" className="gap-1 rounded-lg"><span className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-primary"><UserRound size={16}/></span><ChevronDown size={13}/></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-60"><DropdownMenuLabel className="truncate">{user.email ?? "Your account"}</DropdownMenuLabel><DropdownMenuSeparator/><DropdownMenuItem onClick={()=>void signOut()}><LogOut size={16} className="mr-2"/>Sign out</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
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
