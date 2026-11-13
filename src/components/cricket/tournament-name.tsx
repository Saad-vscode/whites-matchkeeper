import { useTournamentBranding } from "@/lib/cricket/tournament-branding";
export function TournamentName({ id, fallback }: { id: string | null; fallback: string }) {
  const { data } = useTournamentBranding(id);
  return <>{data?.name ?? fallback}</>;
}
