import { supabase } from '@/integrations/supabase/client';
import type { FeatureId } from './feature-access';
export type SettingValue = boolean | string | number | null;
export type GlobalSetting = { id: string; category: string; value: SettingValue; default_value: SettingValue; changed_at: string; changed_by: string | null };
export type GlobalFeature = { id: FeatureId; label: string; category: string; globally_enabled: boolean; default_enabled: boolean };
export type GlobalSettings = { revision: string; settings: GlobalSetting[]; features: GlobalFeature[]; live_matches: number; users: number };
export type Announcement = { id: string; title: string; body: string; category: string; published: boolean; dismissible: boolean; starts_at: string | null; ends_at: string | null; changed_at: string };
export async function readGlobalSettings() {
  const { data, error } = await supabase.rpc('platform_settings_read');
  if (error) throw error;
  return data as unknown as GlobalSettings;
}
export async function readAnnouncements(publicOnly = false) {
  const { data, error } = await supabase.rpc('platform_announcements_read', { _public: publicOnly });
  if (error) throw error;
  return data as unknown as Announcement[];
}
// In-memory fallback defaults: never overwrite an explicit device preference.
let configuration: Record<string, SettingValue> = {};
export const GLOBAL_CONFIGURATION_EVENT = 'crease-global-configuration';
export function globalDefault<T extends SettingValue>(key: string, fallback: T): T {
  return (configuration[key] ?? fallback) as T;
}
let maintenanceMatches: string[] | null = null;
export function applyMaintenanceState(enabled: boolean, ongoing: string[]) {
  maintenanceMatches = enabled ? ongoing : null;
}
export function maintenanceAllowsScoring(matchId: string) {
  return maintenanceMatches === null || maintenanceMatches.includes(matchId);
}
export function applyGlobalDefaults(values: Record<string, SettingValue>) {
  if (JSON.stringify(configuration) === JSON.stringify(values)) return;
  configuration = values;
  for (const event of [GLOBAL_CONFIGURATION_EVENT, 'crease-presentation-settings', 'crease-tv-settings']) window.dispatchEvent(new Event(event));
}
