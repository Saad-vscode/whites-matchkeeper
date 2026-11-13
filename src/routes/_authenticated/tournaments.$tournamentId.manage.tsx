import { createFileRoute } from "@tanstack/react-router";
import { TournamentPage } from "@/components/cricket/tournament-page";

export const Route = createFileRoute("/_authenticated/tournaments/$tournamentId/manage")({
  head: () => ({
    meta: [
      { title: "Manage tournament — Crease" },
      { name: "description", content: "Add teams, players and fixtures to your tournament." },
      { property: "og:title", content: "Manage tournament — Crease" },
      {
        property: "og:description",
        content: "Add teams, players and fixtures to your tournament.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Manage,
});

function Manage() {
  const { tournamentId } = Route.useParams();
  return <TournamentPage key={tournamentId} tournamentId={tournamentId} management />;
}
