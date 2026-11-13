import { useEffect, useState } from "react";
import { HIGHLIGHTS, type HighlightKind } from "./tv-highlights";
export const TV_SETTINGS_EVENT = "crease-tv-settings";
const KEY = "crease-tv-animations";
export type AnimationSettings = {
  enabled: boolean;
  duration: number;
  motion: "full" | "reduced";
  events: Record<HighlightKind, boolean>;
};
export function defaultAnimationSettings(): AnimationSettings {
  return {
    enabled: true,
    duration: 2800,
    motion: "full",
    events: Object.fromEntries(Object.keys(HIGHLIGHTS).map((k) => [k, true])) as Record<
      HighlightKind,
      boolean
    >,
  };
}
export function readAnimationSettings(): AnimationSettings {
  const base = defaultAnimationSettings();
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    if (typeof value.enabled === "boolean") base.enabled = value.enabled;
    if ([2000, 2500, 2800, 3000].includes(value.duration)) base.duration = value.duration;
    if (value.motion === "reduced") base.motion = "reduced";
    for (const key of Object.keys(HIGHLIGHTS) as HighlightKind[])
      if (typeof value.events?.[key] === "boolean") base.events[key] = value.events[key];
  } catch {
    /* Defaults also support server rendering and unavailable storage. */
  }
  return base;
}
export function saveAnimationSettings(settings: AnimationSettings) {
  localStorage.setItem(KEY, JSON.stringify(settings));
  window.dispatchEvent(new Event(TV_SETTINGS_EVENT));
}
export function useAnimationSettings() {
  const [settings, setSettings] = useState(defaultAnimationSettings);
  useEffect(() => {
    const refresh = () => setSettings(readAnimationSettings());
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener(TV_SETTINGS_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(TV_SETTINGS_EVENT, refresh);
    };
  }, []);
  return settings;
}
