import { supabase } from '@/integrations/supabase/client';
import type { MatchRow } from './cricket/match';
import type { Delivery } from './cricket/engine';
import type { PlatformRole } from './platform-admin';
export type ManagedMatch = MatchRow & { organizer: string; email: string; platform_hidden: boolean; platform_disabled: boolean; platform_archived: boolean; platform_deleted_at: string | null };
export const matchActionLabels = { hide: 'Hide match', unhide: 'Unhide match', disable: 'Disable match', enable: 'Enable match', archive: 'Archive match', restore: 'Restore from archive', delete: 'Delete match', recover: 'Recover match', transfer: 'Transfer ownership' };
export type MatchAction = keyof typeof matchActionLabels;
export const ongoingMatch = (m: MatchRow) => ['live','paused','innings_break'].includes(m.status);
export function independentMatchActions(role: PlatformRole, m: ManagedMatch): MatchAction[] {
  if (role === 'user' || m.tournament_id) return [];
  if (m.platform_deleted_at) return ['recover'];
  return [m.platform_hidden ? 'unhide' : 'hide', m.platform_disabled ? 'enable' : 'disable',
    ...(m.platform_archived ? ['restore' as const] : ongoingMatch(m) ? [] : ['archive' as const]),
    ...(!ongoingMatch(m) ? ['delete' as const, ...(role === 'owner' ? ['transfer' as const] : [])] : [])];
}
export async function otherMatches(search: string, state: string, page: number) {
  const { data, error } = await supabase.rpc('platform_other_matches', { _search: search, _state: state, _page: page });
  if (error) throw error;
  return data as unknown as { rows: ManagedMatch[]; total: number; summary: Record<string, number> };
}
export async function otherMatchDetails(id: string) {
  const { data, error } = await supabase.rpc('platform_other_match_details', { _match: id });
  if (error) throw error;
  return data as unknown as { match: ManagedMatch; deliveries: Delivery[]; history: { actor_id: string; action: string; reason: string | null; created_at: string }[] };
}
