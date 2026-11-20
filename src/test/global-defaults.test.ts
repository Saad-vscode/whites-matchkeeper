import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { applyGlobalDefaults, applyMaintenanceState, maintenanceAllowsScoring } from '@/lib/global-settings';
import { readPresentation } from '@/lib/presentation-settings';
import { readAnimationSettings } from '@/lib/cricket/tv-settings';
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), clear: () => values.clear() });
});
afterEach(() => { applyGlobalDefaults({}); applyMaintenanceState(false, []); vi.unstubAllGlobals(); });
it('uses platform defaults only where explicit device choices are absent', () => {
  applyGlobalDefaults({ celebration: false, celebration_duration: 5000, honours_seconds: 6, animations: false });
  expect(readPresentation()).toMatchObject({ celebration: false, duration: 5000, honoursSeconds: 6 });
  expect(readAnimationSettings().enabled).toBe(false);
  localStorage.setItem('crease-presentation', JSON.stringify({ celebration: true, duration: 15000 }));
  localStorage.setItem('crease-tv-animations', JSON.stringify({ enabled: true, events: { six: false } }));
  expect(readPresentation()).toMatchObject({ celebration: true, duration: 15000, honoursSeconds: 6 });
  expect(readAnimationSettings()).toMatchObject({ enabled: true, events: { six: false } });
  expect(JSON.parse(localStorage.getItem('crease-presentation')!)).toEqual({ celebration: true, duration: 15000 });
});
it('pauses new operations for non-draining matches and restores them after maintenance', () => {
  applyMaintenanceState(true, ['live-match']);
  expect(maintenanceAllowsScoring('live-match')).toBe(true);
  expect(maintenanceAllowsScoring('scheduled-match')).toBe(false);
  applyMaintenanceState(false, []);
  expect(maintenanceAllowsScoring('scheduled-match')).toBe(true);
});
