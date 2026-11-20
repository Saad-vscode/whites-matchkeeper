import { supabase } from "@/integrations/supabase/client";
import type { PlatformRole } from "./platform-admin";
export type ManagedUser = {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  role: PlatformRole;
  status: "active" | "blocked" | "deactivated" | "invited";
  tournaments: number;
  created_at: string;
  last_sign_in_at: string | null;
};
export type UserAction =
  "edit" | "grant_admin" | "revoke_admin" | "block" | "unblock" | "deactivate" | "restore";
export type UserDirectory = {
  rows: ManagedUser[];
  total: number;
  summary: { total: number; active: number; blocked: number; admins: number; new: number };
};
export type UserDetails = {
  reason: string | null;
  tournaments: { id: string; name: string; created_at: string }[];
  history: {
    actor_id: string | null;
    action: string;
    reason: string | null;
    changes: unknown;
    created_at: string;
  }[];
};
export const roleLabel = (role: PlatformRole) =>
  role === "owner" ? "Platform Owner" : role === "admin" ? "Platform Admin" : "Registered User";
export function userActions(
  actor: PlatformRole,
  actorId: string,
  target: ManagedUser,
): UserAction[] {
  if (
    actor === "user" ||
    target.id === actorId ||
    target.role === "owner" ||
    (actor === "admin" && target.role !== "user")
  )
    return [];
  if (target.status === "deactivated") return ["restore"];
  const actions: UserAction[] = ["edit"];
  if (actor === "owner") {
    if (target.role === "admin") actions.push("revoke_admin");
    else if (target.status === "active") actions.push("grant_admin");
  }
  actions.push(target.status === "blocked" ? "unblock" : "block", "deactivate");
  return actions;
}
export async function getDirectory(filters: {
  search: string;
  role: string;
  status: string;
  sort: string;
  page: number;
}): Promise<UserDirectory> {
  const { data, error } = await supabase.rpc("platform_user_directory", {
    _search: filters.search,
    _role: filters.role,
    _status: filters.status,
    _sort: filters.sort,
    _page: filters.page,
  });
  if (error) throw error;
  return data as unknown as UserDirectory;
}
export async function getUserDetails(id: string): Promise<UserDetails> {
  const { data, error } = await supabase.rpc("platform_user_details", { _target: id });
  if (error) throw error;
  return data as unknown as UserDetails;
}
export async function manageUser(
  id: string,
  action: UserAction,
  name: string,
  avatar: string,
  reason: string,
) {
  const { error } = await supabase.rpc("platform_manage_user", {
    _target: id,
    _action: action,
    _name: name,
    _avatar: avatar,
    _reason: reason,
  });
  if (error) throw error;
}
export async function inviteUser(
  id: string,
  email: string,
  name: string,
  role: string,
): Promise<string> {
  const { data, error } = await supabase.functions.invoke("platform-invite", {
    body: { id, email, name, role },
  });
  if (error) {
    let message = error.message;
    if (error.context instanceof Response) {
      const body = await error.context.json().catch(() => null);
      message = body?.error ?? message;
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data?.message ?? "Invitation submitted.";
}
