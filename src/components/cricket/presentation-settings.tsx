import { useFeatureAccess } from "@/lib/feature-access";
import { useEffect, useState } from "react";
import { Palette, Sparkles, Sun, Moon, Monitor, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  usePresentation,
  savePresentation,
  type PresentationSettings as Preferences,
} from "@/lib/presentation-settings";
import { TvVictory } from "./tv-victory";

export function PresentationSettings() {
  const s = usePresentation();
  const { allows } = useFeatureAccess();
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<"match" | "playoff" | "final" | null>(null);
  const update = (part: Partial<Preferences>) => {
    try {
      savePresentation({ ...s, ...part });
      setError("");
    } catch {
      setError("Could not save your preferences. Allow browser storage and try again.");
    }
  };
  useEffect(() => {
    if (!preview) return;
    const timer = setTimeout(() => setPreview(null), s.duration);
    return () => clearTimeout(timer);
  }, [preview, s.duration]);
  const select = (
    title: string,
    key: "font" | "duration" | "style" | "motion",
    options: [string | number, string][],
  ) => (
    <label className="grid gap-2 text-sm font-semibold">
      {title}
      <select
        className="rounded-lg border border-input bg-background p-3"
        value={s[key]}
        onChange={(e) =>
          update({ [key]: key === "duration" ? Number(e.target.value) : e.target.value })
        }
      >
        {options.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <>
      <section className="space-y-6 rounded-2xl border border-border bg-card p-6">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <Palette className="text-primary" size={22} />
            App appearance
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            A look for your everyday pages. TV appearance stays independent.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            ["light", "Light", Sun],
            ["dark", "Dark", Moon],
            ["system", "Device", Monitor],
          ].map(([value, label, Icon]) => {
            const Symbol = Icon as typeof Sun;
            return (
              <button
                type="button"
                key={String(value)}
                aria-pressed={s.mode === value}
                onClick={() => update({ mode: String(value) })}
                className={`flex flex-col items-center gap-3 rounded-xl border p-4 text-sm font-semibold transition-colors ${s.mode === value ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:bg-muted"}`}
              >
                <Symbol size={24} />
                {String(label)}
              </button>
            );
          })}
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <fieldset>
            <legend className="mb-3 text-sm font-semibold">Accent color</legend>
            <div className="flex flex-wrap gap-2">
              {["teal", "blue", "violet"].map((color) => (
                <button
                  type="button"
                  key={color}
                  aria-pressed={s.accent === color}
                  onClick={() => update({ accent: color })}
                  className={`flex items-center gap-2 rounded-full border px-3 py-2 text-sm capitalize ${s.accent === color ? "border-primary bg-primary/10" : "border-border"}`}
                >
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{
                      background: { teal: "#008c83", blue: "#3575db", violet: "#8655c5" }[color],
                    }}
                  />
                  {color}
                </button>
              ))}
            </div>
          </fieldset>
          {select("Typography", "font", [
            ["modern", "Modern · Manrope"],
            ["classic", "Classic · Fraunces"],
          ])}
        </div>
      </section>
      {(allows("celebrations") || allows("honours")) && <details className="space-y-5 rounded-2xl border border-border bg-card p-6">
        <summary className="cursor-pointer text-xl font-bold">
          Victory celebrations & tournament honours
        </summary>
        {allows("celebrations") && <><div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold">
              <Sparkles className="text-primary" size={22} />
              Victory celebrations
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              TV only. A winning moment, with a bigger stage for the final.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={s.celebration}
              onChange={(e) => update({ celebration: e.target.checked })}
            />
            Enabled
          </label>
        </div>
        <div className="grid gap-5 sm:grid-cols-3">
          {select("Duration", "duration", [
            [5000, "5 seconds"],
            [10000, "10 seconds"],
            [15000, "15 seconds"],
          ])}
          {select("Style", "style", [
            ["classic", "Classic · Understated"],
            ["stadium", "Stadium · Celebratory"],
            ["gold", "Gold · Trophy night"],
          ])}
          {select("Motion", "motion", [
            ["full", "Full animation"],
            ["reduced", "Reduced motion"],
          ])}
        </div>
        <div className="flex flex-wrap gap-2">
          {(["match", "playoff", "final"] as const).map((level) => (
            <Button key={level} variant="outline" onClick={() => setPreview(level)}>
              <Play size={15} />
              {level === "match" ? "Group / quick" : level === "playoff" ? "Playoff" : "Final"}{" "}
              preview
            </Button>
          ))}
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Silent celebrations. Published Man of the Match awards replay the presentation. Your
          device’s reduced-motion preference is respected.
        </p>
        </>}
        {allows("honours") && <><label className="grid max-w-xs gap-2 text-sm font-semibold">
          Honours screen duration
          <select
            className="rounded-lg border border-input bg-background p-3"
            value={s.honoursSeconds}
            onChange={(e) => update({ honoursSeconds: Number(e.target.value) })}
          >
            {[5, 6, 7, 8, 9, 10].map((n) => (
              <option key={n} value={n}>
                {n} seconds
              </option>
            ))}
          </select>
        </label>
        <fieldset className="rounded-xl border border-border bg-muted/20 p-4">
          <legend className="px-2 text-sm font-bold">Awards to show on TV</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["honoursRuns", "Most Runs"],
                ["honoursWickets", "Most Wickets"],
                ["honoursPlayer", "Player of the Tournament"],
                ["honoursMatches", "Man of the Match awards"],
              ] as const
            ).filter(([key]) => allows("awards") || !["honoursPlayer", "honoursMatches"].includes(key)).map(([key, label]) => (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm font-semibold"
              >
                <input
                  className="h-4 w-4 accent-[var(--primary)]"
                  type="checkbox"
                  checked={s[key]}
                  onChange={(e) => update({ [key]: e.target.checked })}
                />
                {label}
              </label>
            ))}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Choose on the TV browser. Man of the Match follows the draw: qualifiers, Eliminator and final for IPL playoffs; semi-finals and final for knockout playoffs.
            Only published awards reveal winners. These switches only change the honours presentation, not award calculations.
            With all awards off, champions and runners-up keep looping.
          </p>
        </fieldset>
        </>}
      </details>}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <Dialog
        open={!!preview && allows("celebrations")}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
      >
        <DialogContent className="max-w-5xl overflow-hidden p-0">
          <DialogTitle className="sr-only">Victory preview</DialogTitle>
          <DialogDescription className="sr-only">
            Sample celebration, closes automatically after the selected duration.
          </DialogDescription>
          <div className="tournament-page tv-page tv-broadcast flex h-[75dvh] flex-col">
            {preview && (
              <TvVictory
                tournamentName="Crease Premier League"
                key={preview}
                level={preview}
                name="Crease XI"
                result="Crease XI won by 6 wickets"
                award="A. Silva · Crease XI"
                settings={s}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
