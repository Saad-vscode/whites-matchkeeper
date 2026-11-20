import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { PlatformRole } from "./platform-admin";
import type { TournamentDelivery } from "./cricket/tournament-summary";

export type ManagedTournament = Tables<"tournaments"> & {
  organizer: string;
  email: string | null;
  teams: number;
  players: number;
  matches: number;
  live_matches: number;
  lifecycle: "upcoming" | "active" | "completed" | "archived";
  platform_hidden: boolean;
  platform_disabled: boolean;
  platform_archived: boolean;
  platform_deleted_at: string | null;
};
export type TournamentAction =
  | "edit"
  | "hide"
  | "unhide"
  | "disable"
  | "enable"
  | "archive"
  | "restore"
  | "transfer"
  | "delete"
  | "recover";
export const tournamentActionLabels: Record<TournamentAction, string> = {
  edit: "Edit information",
  hide: "Hide tournament",
  unhide: "Unhide tournament",
  disable: "Disable tournament",
  enable: "Enable tournament",
  archive: "Archive tournament",
  restore: "Restore from archive",
  transfer: "Transfer ownership",
  delete: "Delete tournament",
  recover: "Recover tournament",
};
export function tournamentActions(role: PlatformRole, t: ManagedTournament): TournamentAction[] {
  if (role === "user") return [];
  if (t.platform_deleted_at) return ["recover"];
  return [
    "edit",
    t.platform_hidden ? "unhide" : "hide",
    t.platform_disabled ? "enable" : "disable",
    t.platform_archived ? "restore" : "archive",
    ...(role === "owner" ? ["transfer" as const] : []),
    ...(t.live_matches ? [] : ["delete" as const]),
  ];
}
export type TournamentFilters = {
  search: string;
  status: string;
  visibility: string;
  organizer: string;
  sort: string;
  page: number;
};
export type TournamentDirectory = {
  rows: ManagedTournament[];
  total: number;
  summary: Record<
    "total" | "active" | "completed" | "upcoming" | "hidden" | "disabled" | "archived",
    number
  >;
};
export type TournamentInspection = {
  published_awards: string[];
  tournament: Tables<"tournaments">;
  teams: Tables<"tournament_teams">[];
  groups: Tables<"tournament_groups">[];
  matches: Tables<"matches">[];
  deliveries: TournamentDelivery[];
  playoff: unknown;
  history: {
    actor_id: string;
    action: string;
    reason: string | null;
    changes: unknown;
    created_at: string;
  }[];
};
export async function getTournamentDirectory(f: TournamentFilters): Promise<TournamentDirectory> {
  const { data, error } = await supabase.rpc("platform_tournament_directory", {
    _search: f.search,
    _status: f.status,
    _visibility: f.visibility,
    _organizer: f.organizer,
    _sort: f.sort,
    _page: f.page,
  });
  if (error) throw error;
  return data as unknown as TournamentDirectory;
}
export async function inspectTournament(id: string): Promise<TournamentInspection> {
  const { data, error } = await supabase.rpc("platform_tournament_details", { _t: id });
  if (error) throw error;
  return data as unknown as TournamentInspection;
}
export async function transferCandidates(
  search: string,
): Promise<{ id: string; email: string; name: string }[]> {
  const { data, error } = await supabase.rpc("platform_transfer_candidates", { _search: search });
  if (error) throw error;
  return data as unknown as { id: string; email: string; name: string }[];
}
export async function manageTournament(
  id: string,
  action: TournamentAction,
  values: Record<string, string>,
  reason: string,
  confirmation: string,
) {
  const { error } = await supabase.rpc("platform_manage_tournament", {
    _t: id,
    _action: action,
    _values: values,
    _reason: reason,
    _confirmation: confirmation,
  });
  if (error) throw error;
}
