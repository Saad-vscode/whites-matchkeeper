import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
export function AccountAccessGate({ userId, children }: { userId: string; children: ReactNode }) {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [knownRestricted, setKnownRestricted] = useState(() => {
    try {
      return sessionStorage.getItem("crease-restricted:" + userId) === "true";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  const access = useQuery({
    queryKey: ["account-access", userId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("account_access");
      if (error) throw error;
      return data;
    },
    enabled: online,
    refetchInterval: 5000,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  useEffect(() => {
    if (access.data === undefined) return;
    setKnownRestricted(!access.data);
    try {
      sessionStorage.setItem("crease-restricted:" + userId, String(!access.data));
    } catch {}
  }, [access.data, userId]);
  if (knownRestricted || access.data === false)
    return (
      <div className="tournament-page flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
        <section className="max-w-lg rounded-2xl border border-border bg-card p-8">
          <h1 className="text-2xl font-bold">Account restricted</h1>
          <p className="my-4 text-muted-foreground">
            Your account is blocked or deactivated. Contact your platform administrator. Your
            tournaments and saved scoring queue have been preserved.
          </p>
          <Button variant="outline" disabled={!online} onClick={() => void access.refetch()}>
            Check access again
          </Button>
        </section>
      </div>
    );
  if (online && (access.isPending || access.isError))
    return (
      <div className="tournament-page min-h-screen bg-background p-8 text-foreground">
        <p role={access.isError ? "alert" : "status"}>
          {access.isError
            ? "Unable to verify account access. Check your connection and try again."
            : "Checking account access…"}
        </p>
        {access.isError && (
          <Button className="mt-4" variant="outline" onClick={() => void access.refetch()}>
            Retry
          </Button>
        )}
      </div>
    );
  return <>{children}</>;
}
