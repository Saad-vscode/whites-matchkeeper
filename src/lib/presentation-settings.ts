import { globalDefault } from './global-settings';
import { useEffect, useState } from "react";
export const PRESENTATION_EVENT = "crease-presentation-settings";
export const defaults = {
  mode: "light",
  accent: "teal",
  font: "modern",
  celebration: true,
  duration: 10000,
  style: "stadium",
  motion: "full",
  honoursSeconds: 8,
  honoursRuns: true,
  honoursWickets: true,
  honoursPlayer: true,
  honoursMatches: true,
};
export type PresentationSettings = typeof defaults;
export function readPresentation(): PresentationSettings {
  const next = { ...defaults,
    celebration: globalDefault('celebration', defaults.celebration),
    duration: globalDefault('celebration_duration', defaults.duration),
    style: globalDefault('celebration_style', defaults.style),
    honoursSeconds: globalDefault('honours_seconds', defaults.honoursSeconds),
    honoursRuns: globalDefault('honours_runs', defaults.honoursRuns),
    honoursWickets: globalDefault('honours_wickets', defaults.honoursWickets),
    honoursPlayer: globalDefault('honours_player', defaults.honoursPlayer),
    honoursMatches: globalDefault('honours_matches', defaults.honoursMatches),
  };
  try {
    const s = JSON.parse(localStorage.getItem("crease-presentation") ?? "{}");
    for (const [key, options] of Object.entries({
      mode: ["light", "dark", "system"],
      accent: ["teal", "blue", "violet"],
      font: ["modern", "classic"],
      style: ["classic", "stadium", "gold"],
      motion: ["full", "reduced"],
      duration: [5000, 10000, 15000],
    })) {
      if ((options as unknown[]).includes(s[key])) Object.assign(next, { [key]: s[key] });
    }
    if (typeof s.celebration === "boolean") next.celebration = s.celebration;
    for (const key of ["honoursRuns", "honoursWickets", "honoursPlayer", "honoursMatches"] as const)
      if (typeof s[key] === "boolean") next[key] = s[key];
    if (Number.isInteger(s.honoursSeconds) && s.honoursSeconds >= 5 && s.honoursSeconds <= 10)
      next.honoursSeconds = s.honoursSeconds;
  } catch {
    /* Browser defaults. */
  }
  return next;
}
export function savePresentation(s: PresentationSettings) {
  localStorage.setItem("crease-presentation", JSON.stringify(s));
  window.dispatchEvent(new Event(PRESENTATION_EVENT));
}
export function usePresentation() {
  const [s, set] = useState(defaults);
  useEffect(() => {
    const refresh = () => set(readPresentation());
    refresh();
    window.addEventListener(PRESENTATION_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(PRESENTATION_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return s;
}
export function AppAppearance() {
  const s = usePresentation();
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const root = document.documentElement;
      root.dataset["appMode"] = s.mode === "system" ? (media.matches ? "dark" : "light") : s.mode;
      root.dataset["appAccent"] = s.accent;
      root.dataset["appFont"] = s.font;
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [s.mode, s.accent, s.font]);
  return null;
}
