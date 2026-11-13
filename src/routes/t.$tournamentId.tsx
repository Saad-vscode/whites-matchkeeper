import { createFileRoute } from "@tanstack/react-router";
import { TournamentPage } from "@/components/cricket/tournament-page";

export const Route = createFileRoute("/t/$tournamentId")({
  head: () => ({
    meta: [
      { title: "Tournament — Crease" },
      { name: "description", content: "Fixtures, results and the live points table." },
      { property: "og:title", content: "Tournament — Crease" },
      { property: "og:description", content: "Fixtures, results and the live points table." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PublicTournament,
});

function PublicTournament() {
  const { tournamentId } = Route.useParams();
  return <TournamentPage key={tournamentId} tournamentId={tournamentId} />;
}
