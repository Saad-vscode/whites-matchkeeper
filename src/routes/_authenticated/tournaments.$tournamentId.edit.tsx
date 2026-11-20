import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TournamentForm } from "@/components/cricket/tournament-form";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/tournaments/$tournamentId/edit")({
  head: () => ({ meta: [{ title: "Edit tournament — Crease" }] }),
  component: EditTournament,
});
function EditTournament() {
  const { tournamentId } = Route.useParams();
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["tournament-edit", tournamentId, user.id],
    refetchInterval: 5000,
    queryFn: async () => {
      const [t, permission] = await Promise.all([
        supabase.from("tournaments").select("*").eq("id", tournamentId).single(),
        supabase.rpc("is_tournament_owner", { _t: tournamentId }),
      ]);
      if (t.error) throw t.error;
      if (permission.error) throw permission.error;
      return { t: t.data, allowed: permission.data === true };
    },
  });
  const back = () =>
    navigate({ to: "/tournaments/$tournamentId/manage", params: { tournamentId } });
  return (
    <div className="tournament-page min-h-screen bg-white">
      <main className="mx-auto max-w-2xl px-5 py-8">
        <Button asChild variant="ghost">
          <Link to="/tournaments/$tournamentId/manage" params={{ tournamentId }}>
            <ArrowLeft />
            Back to tournament
          </Link>
        </Button>
        <h1 className="mb-2 mt-6 text-3xl font-bold">Edit tournament</h1>
        <p className="mb-8 text-sm text-muted-foreground">
          Tournament information, branding and rules.
        </p>
        {isLoading ? (
          <p role="status">Loading…</p>
        ) : error ? (
          <p role="alert">Could not load tournament: {error.message}</p>
        ) : data?.t.platform_disabled || data?.t.platform_archived ? (
          <p role="alert">This tournament is disabled or archived and read-only. Contact platform administration to restore editing.</p>
        ) : !data?.allowed ? (
          <p role="alert">Only the tournament owner can edit this tournament.</p>
        ) : (
          <TournamentForm
            key={data.t.id}
            tournament={data.t}
            onCancel={() => void back()}
            onSaved={async () => {
              await Promise.all([
                qc.invalidateQueries({ queryKey: ["tournament-branding", tournamentId] }),
                qc.invalidateQueries({ queryKey: ["playoffs", tournamentId] }),
                qc.invalidateQueries({ queryKey: ["scoring-tournament-info", tournamentId] }),
                qc.invalidateQueries({ queryKey: ["tournament", tournamentId] }),
                qc.invalidateQueries({ queryKey: ["tournament-edit", tournamentId] }),
                qc.invalidateQueries({ queryKey: ["my-tournaments"] }),
                qc.invalidateQueries({ queryKey: ["match-tournament", tournamentId] }),
              ]);
              await back();
            }}
          />
        )}
      </main>
    </div>
  );
}
