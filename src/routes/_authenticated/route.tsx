import { AccountAccessGate } from "@/components/account-access-gate";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Offline scorers keep their saved session; the backend re-checks it before sync.
    const user = navigator.onLine ? (await supabase.auth.getUser()).data.user : (await supabase.auth.getSession()).data.session?.user;
    if (!user) throw redirect({ to: "/auth" });
    return { user };
  },
  component: ProtectedPage,
});

function ProtectedPage() { const { user } = Route.useRouteContext(); return <AccountAccessGate userId={user.id}><Outlet /></AccountAccessGate>; }
