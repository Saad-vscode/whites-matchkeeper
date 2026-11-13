import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/cricket/bits";
import { TournamentForm } from "@/components/cricket/tournament-form";

export const Route = createFileRoute("/_authenticated/tournaments/new")({
  head: () => ({
    meta: [
      { title: "New tournament — Crease" },
      {
        name: "description",
        content: "Create a branded cricket tournament with fixtures and a points table.",
      },
      { property: "og:title", content: "New tournament — Crease" },
      {
        property: "og:description",
        content: "Create a branded cricket tournament with fixtures and a points table.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewTournament,
});

function NewTournament() {
  return (
    <div className="tournament-page front-page min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
        <p className="front-eyebrow">Bring your teams together</p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight">Create a tournament</h1>
        <p className="mt-3 text-muted-foreground">Set the stage with your tournament identity, format, and match rules.</p>
        <div className="mt-8 rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-7">
          <TournamentForm />
        </div>
      </main>
    </div>
  );
}
