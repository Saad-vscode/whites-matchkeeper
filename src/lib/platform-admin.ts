import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type PlatformRole = 'owner' | 'admin' | 'user';
export async function readPlatformRole(): Promise<PlatformRole> {
  const { data, error } = await supabase.rpc('platform_role');
  if (error) throw error;
  return data === 'owner' || data === 'admin' ? data : 'user';
}
export function usePlatformRole(userId?: string) {
  return useQuery({ queryKey: ['platform-role', userId], queryFn: readPlatformRole, enabled: !!userId,
    staleTime: 0, gcTime: 0, retry: false, refetchInterval: 30000 });
}
export type Overview = {
  users: number; activeUsers: number; blockedUsers: number; tournaments: number;
  activeTournaments: number; completedTournaments: number; liveMatches: number; admins: number;
  registrations: { id: string; email: string; created_at: string }[];
  recentTournaments: { id: string; name: string; created_at: string }[];
  activity: { action: string; created_at: string }[]; generatedAt: string;
};
export async function readOverview(): Promise<Overview> {
  const { data, error } = await supabase.rpc('platform_overview');
  if (error) throw error;
  return data as unknown as Overview;
}
