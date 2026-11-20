import { globalDefault, GLOBAL_CONFIGURATION_EVENT } from '@/lib/global-settings';
import { useFeatureAccess, animationFeature } from "@/lib/feature-access";
import { useEffect, useState } from "react";
import { MatchAudio } from "@/components/cricket/match-audio";
import { PresentationSettings } from "@/components/cricket/presentation-settings";
import { createFileRoute } from "@tanstack/react-router";
import { Play, Settings2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { SiteHeader } from "@/components/cricket/bits";
import { Button } from "@/components/ui/button";
import { TvHighlightScene } from "@/components/cricket/tv-highlight";
import { HIGHLIGHTS, type HighlightKind, type TvHighlight } from "@/lib/cricket/tv-highlights";
import {
  saveAnimationSettings,
  TV_SETTINGS_EVENT,
  useAnimationSettings,
  type AnimationSettings,
} from "@/lib/cricket/tv-settings";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — Crease" }] }),
  component: SettingsPage,
});
const groups: { name: string; keys: HighlightKind[] }[] = [
  {
    name: "Boundaries & milestones",
    keys: ["four", "six", "triple_six", "fifty", "winning_four", "winning_six"],
  },
  { name: "Wickets & reactions", keys: ["wicket", "stumped", "caught", "run_out", "duck", "golden_duck"] },
  { name: "Bowling moments", keys: ["wide", "no_ball", "hat_chance", "hat_trick", "maiden"] },
];
const descriptions: Record<HighlightKind, string> = {
  four: "A racing ball and gold boundary reveal.",
  six: "A rising arc and a bold six.",
  triple_six: "Three consecutive sixes by the same batter.",
  fifty: "Celebrate a batter reaching 50 runs.",
  winning_four: "A boundary that completes a successful chase.",
  winning_six: "A six that seals the chase.",
  wicket: "Three stumps, a ball impact, and flying bails.",
  stumped: "Quick wicketkeeping gloves remove the bails.",
  caught: "An athletic reach and a clean two-handed catch.",
  run_out: "A diving batter just short of the crease.",
  duck: "A little sympathy for a score of zero.",
  golden_duck: "A golden duck for a first-ball dismissal.",
  wide: "The umpire signals wide with both arms.",
  no_ball: "An umpire signal for an illegal delivery.",
  hat_chance: "Two wickets in the bowler’s last two deliveries.",
  hat_trick: "Three consecutive wickets credited to a bowler.",
  maiden: "A complete over with no runs charged to its bowler.",
};
const subtitles: Record<HighlightKind, string> = {
  four: "Boundary",
  six: "Over the rope",
  triple_six: "Player on the charge!",
  fifty: "Brilliant knock!",
  winning_four: "What a finish!",
  winning_six: "That seals the match!",
  wicket: "Bowled",
  stumped: "Quick hands. Bails off.",
  caught: "Safe hands",
  run_out: "Just short of safety",
  duck: "Out without scoring",
  golden_duck: "First ball dismissal",
  wide: "Extra conceded",
  no_ball: "Illegal delivery",
  hat_chance: "2 wickets in 2 balls",
  hat_trick: "History created!",
  maiden: "No runs conceded",
};

function SettingsPage() {
  const { allows } = useFeatureAccess();
  const animationsAllowed = allows("boundaries") || allows("wickets") || allows("moments");
  const [category, setCategory] = useState(0);
  const settings = useAnimationSettings();
  const [theme, setTheme] = useState("teal"),
    [font, setFont] = useState("modern"),
    [error, setError] = useState("");
  const [preview, setPreview] = useState<TvHighlight | null>(null);
  useEffect(() => {
    const refresh = () => { try {
      const style = JSON.parse(localStorage.getItem("crease-tv-style") ?? "{}");
      if (["teal", "blue", "violet", "night"].includes(style.theme)) setTheme(style.theme); else setTheme(globalDefault("tv_theme", "teal"));
      if (["modern", "system", "classic"].includes(style.font)) setFont(style.font);
    } catch {} };
    refresh();
    window.addEventListener(GLOBAL_CONFIGURATION_EVENT, refresh);
    return () => window.removeEventListener(GLOBAL_CONFIGURATION_EVENT, refresh);
  }, []);
  useEffect(() => {
    if (!preview) return;
    const timer = setTimeout(() => setPreview(null), settings.duration);
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreview(null);
    };
    window.addEventListener("keydown", close);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", close);
    };
  }, [preview, settings.duration]);
  const update = (next: AnimationSettings) => {
    try {
      saveAnimationSettings(next);
      setError("");
    } catch {
      setError("Your browser could not save these preferences. Allow local storage and try again.");
    }
  };
  const style = (nextTheme: string, nextFont: string) => {
    try {
      localStorage.setItem("crease-tv-style", JSON.stringify({ theme: nextTheme, font: nextFont }));
      setTheme(nextTheme);
      setFont(nextFont);
      window.dispatchEvent(new Event(TV_SETTINGS_EVENT));
      setError("");
    } catch {
      setError("Your browser could not save the display style.");
    }
  };
  const show = (kind: HighlightKind) =>
    setPreview({
      id: `preview-${Date.now()}`,
      kind,
      player: "Sample player",
      detail: subtitles[kind],
      dots: 6,
    });
  return (
    <div className="tournament-page front-page min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-5xl space-y-8 px-5 py-10 sm:px-8">
        <header>
          <p className="front-eyebrow">Make it your matchday</p>
          <h1 className="mt-2 flex items-center gap-3 text-4xl font-extrabold tracking-tight">
            <Settings2 className="text-primary" />
            Settings
          </h1>
          <p className="mt-3 text-muted-foreground">
            Your matchday, your style. Preferences are saved on this browser. Set audio on the scorer’s device and display preferences on the TV device.
          </p>
        </header>
        {error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
            {error}
          </p>
        )}
        <MatchAudio settings />
        <PresentationSettings />
        {allows("appearance") && <section className="rounded-2xl border border-border bg-white p-6">
          <h2 className="text-xl font-bold">Display style</h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold">
              Color theme
              <select
                className="rounded-lg border border-input bg-white p-3"
                value={theme}
                onChange={(e) => style(e.target.value, font)}
              >
                <option value="teal">Crease teal & gold</option>
                <option value="blue">Ocean blue</option>
                <option value="violet">Violet</option>
                <option value="night">Night stadium</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              Scoreboard font
              <select
                className="rounded-lg border border-input bg-white p-3"
                value={font}
                onChange={(e) => style(theme, e.target.value)}
              >
                <option value="modern">Modern · Manrope</option>
                <option value="system">System sans</option>
                <option value="classic">Classic · Fraunces</option>
              </select>
            </label>
          </div>
        </section>}
        {animationsAllowed && <section className="rounded-2xl border border-border bg-white p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold">Match animations</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Short, silent celebrations after confirmed scoring events.
              </p>
            </div>
            <label className="flex items-center gap-2 font-semibold">
              <input
                type="checkbox"
                className="h-5 w-5 accent-teal-600"
                checked={settings.enabled}
                aria-label="Enable match animations"
                onChange={(e) => update({ ...settings, enabled: e.target.checked })}
              />
              Enabled
            </label>
          </div>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold">
              Animation duration
              <select
                className="rounded-lg border border-input bg-white p-3"
                value={settings.duration}
                onChange={(e) => update({ ...settings, duration: Number(e.target.value) })}
              >
                <option value={2000}>2 seconds</option>
                <option value={2500}>2.5 seconds</option>
                <option value={2800}>2.8 seconds · Recommended</option>
                <option value={3000}>3 seconds</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              Motion level
              <select
                className="rounded-lg border border-input bg-white p-3"
                value={settings.motion}
                onChange={(e) =>
                  update({ ...settings, motion: e.target.value as AnimationSettings["motion"] })
                }
              >
                <option value="full">Full animation</option>
                <option value="reduced">Low motion · Static event cards</option>
              </select>
            </label>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            Your device’s reduced-motion preference is respected. Special milestones take priority
            over standard highlights for the same ball. Previews never change a match.
          </p>
        </section>}
        {animationsAllowed && <nav aria-label="Animation categories" className="flex gap-2 rounded-xl border border-border bg-card p-2">{["Batting","Wickets","Bowling"].map((label,i)=><button type="button" key={label} aria-pressed={category===i} onClick={()=>setCategory(i)} className={`flex-1 rounded-lg px-3 py-3 text-sm font-semibold ${category===i?"bg-primary text-primary-foreground":"text-muted-foreground hover:bg-muted"}`}>{label}</button>)}</nav>}
        {groups.filter((group,i)=>i===category && group.keys.some(key => allows(animationFeature(key)))).map((group) => (
          <section key={group.name} className="rounded-2xl border border-border bg-white p-6">
            <h2 className="mb-4 text-xl font-bold">{group.name}</h2>
            <div className="divide-y divide-border">
              {group.keys.filter(key => allows(animationFeature(key))).map((key) => (
                <div key={key} className="flex items-center justify-between gap-4 py-4">
                  <label className="flex flex-1 cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-5 w-5 shrink-0 accent-teal-600"
                      checked={settings.events[key]}
                      onChange={(e) =>
                        update({
                          ...settings,
                          events: { ...settings.events, [key]: e.target.checked },
                        })
                      }
                    />
                    <span>
                      <strong className="block">{HIGHLIGHTS[key]}</strong>
                      <span className="mt-1 block text-sm text-muted-foreground">
                        {descriptions[key]}
                      </span>
                    </span>
                  </label>
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={`Preview ${HIGHLIGHTS[key]}`}
                    onClick={() => show(key)}
                  >
                    <Play size={14} />
                    <span className="hidden sm:inline">Preview</span>
                  </Button>
                </div>
              ))}
            </div>
          </section>
        ))}
        <Dialog open={!!preview && allows(animationFeature(preview.kind))} onOpenChange={open=>{if(!open)setPreview(null)}}>
        {preview && (
          <DialogContent
            className="tournament-page scoring-page tv-page tv-broadcast [&>button]:z-[70] [&>button]:text-white"
            data-theme={theme}
            data-font={font}
            style={{ position: "fixed", inset: 0, zIndex: 100, transform:"none", translate:"none", animation:"none", width:"100vw", height:"100dvh", maxWidth:"none", padding:0, border:0, borderRadius:0 }}
          >
            <DialogTitle className="sr-only">Animation preview</DialogTitle>
            <DialogDescription className="sr-only">Sample animation. No match data is changed.</DialogDescription>
            <TvHighlightScene
              key={preview.id}
              event={preview}
              duration={settings.duration}
              motion={settings.motion}
            />
          </DialogContent>
        )}
        </Dialog>
      </main>
    </div>
  );
}
