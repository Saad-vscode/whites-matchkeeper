import { useRef, useState } from "react";
import { Loader2, Upload, X } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import type { Database } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumField } from "@/components/cricket/num-field";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
type Tournament = Database["public"]["Tables"]["tournaments"]["Row"];

export function TournamentForm({
  tournament,
  onSaved,
  onCancel,
}: {
  tournament?: Tournament;
  onSaved?: () => Promise<void>;
  onCancel?: () => void;
}) {
  const navigate = useNavigate();
  // SELECT * reflects the deployed schema, including legacy databases.
  const supportsDetails = !tournament || "competition_format" in tournament;
  const rules =
    tournament?.rules && typeof tournament.rules === "object" && !Array.isArray(tournament.rules)
      ? tournament.rules
      : {};
  const [f, setF] = useState({
    name: tournament?.name ?? "",
    short: tournament?.short_name ?? "",
    primary: tournament?.primary_color ?? "#1f4d3a",
    accent: tournament?.accent_color ?? "#c8a24a",
    logo: tournament?.logo_url ?? "",
    overs: tournament?.overs ?? 20,
    bpo: tournament?.balls_per_over ?? 6,
    players: tournament?.players_per_team ?? 11,
    wideRuns: typeof rules["wideRuns"] === "number" ? rules["wideRuns"] : 1,
    noBallRuns: typeof rules["noBallRuns"] === "number" ? rules["noBallRuns"] : 1,
    lastManBats: rules["lastManBats"] === true,
    maxOvers:
      typeof rules["maxOversPerBowler"] === "number" ? String(rules["maxOversPerBowler"]) : "",
    win: tournament?.points_win ?? 2,
    tie: tournament?.points_tie ?? 1,
    loss: tournament?.points_loss ?? 0,
    noResult: tournament?.points_no_result ?? 1,
    location: tournament?.location ?? "",
    description: tournament?.description ?? "",
    startDate: tournament?.start_date ?? "",
    endDate: tournament?.end_date ?? "",
    competitionFormat: tournament?.competition_format ?? "league",
    ranking: tournament?.ranking_rule ?? "points_nrr_wins",
  });
  const [busy, setBusy] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const logoInput = useRef<HTMLInputElement>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const num = (
    k:
      "overs" | "bpo" | "players" | "wideRuns" | "noBallRuns" | "win" | "tie" | "loss" | "noResult",
    min: number,
    max: number,
  ) => <NumField min={min} max={max} value={f[k]} onChange={(v) => set(k, v)} />;

  const selectLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      toast.error("Choose a PNG, JPG, or WebP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Choose an image smaller than 5 MB.");
      return;
    }
    setLogoBusy(true);
    const objectUrl = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = objectUrl;
      await image.decode();
      const scale = Math.min(1, 256 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image processing unavailable");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      // Keep a small, persistent image in the existing logo field so it works
      // for every viewer without requiring a separately provisioned storage bucket.
      set("logo", canvas.toDataURL("image/webp", 0.85));
    } catch {
      toast.error("Could not read this image. Please choose another file.");
    } finally {
      URL.revokeObjectURL(objectUrl);
      setLogoBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || logoBusy) return;
    if (!f.name.trim()) {
      toast.error("Enter a tournament name.");
      return;
    }
    if (f.startDate && f.endDate && f.endDate < f.startDate) {
      toast.error("Ending date must be on or after starting date.");
      return;
    }
    setBusy(true);
    try {
      const values = {
        name: f.name.trim(),
        short_name: f.short.trim() || null,
        primary_color: f.primary,
        accent_color: f.accent,
        logo_url: f.logo.trim() || null,
        overs: f.overs,
        balls_per_over: f.bpo,
        players_per_team: f.players,
        rules: {
          ...rules,
          wideRuns: f.wideRuns,
          noBallRuns: f.noBallRuns,
          lastManBats: f.lastManBats,
          maxOversPerBowler: f.maxOvers ? Number(f.maxOvers) : null,
        },
        points_win: f.win,
        points_tie: f.tie,
        points_loss: f.loss,
        ...(supportsDetails
          ? {
              points_no_result: f.noResult,
              location: f.location.trim() || null,
              description: f.description.trim() || null,
              start_date: f.startDate || null,
              end_date: f.endDate || null,
              competition_format: f.competitionFormat,
              ranking_rule: f.ranking,
            }
          : {}),
      };
      if (tournament) {
        const { error } = await supabase
          .from("tournaments")
          .update(values)
          .eq("id", tournament.id)
          .select("id")
          .single();
        if (error) throw error;
        await onSaved?.();
        toast.success("Tournament updated");
      } else {
        const { data: u, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!u.user) throw new Error("Please sign in to create a tournament.");
        const { data, error } = await supabase
          .from("tournaments")
          .insert({ ...values, created_by: u.user.id })
          .select("id")
          .single();
        if (error) throw error;
        await navigate({
          to: "/tournaments/$tournamentId/manage",
          params: { tournamentId: data.id },
        });
      }
    } catch (error) {
      toast.error(
        error && typeof error === "object" && "message" in error
          ? String(error.message)
          : "Could not save tournament. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-8">
      <fieldset disabled={busy} className="min-w-0 space-y-8">
        <Sec title="Branding">
          <F label="Name">
            <Input
              required
              value={f.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Colombo Premier League"
            />
          </F>
          <div className="grid gap-3 sm:grid-cols-2">
            <F label="Short name">
              <Input
                value={f.short}
                onChange={(e) => set("short", e.target.value)}
                placeholder="CPL"
              />
            </F>
            <div className="space-y-1.5">
              <Label htmlFor="upload-tournament-logo">
                Logo image <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <input
                ref={logoInput}
                id="tournament-logo"
                type="file"
                className="hidden"
                accept="image/png,image/jpeg,image/webp"
                onChange={selectLogo}
                disabled={busy || logoBusy}
                tabIndex={-1}
                aria-label="Choose tournament logo image"
              />
              <div>
                <Button
                  id="upload-tournament-logo"
                  type="button"
                  className="w-full"
                  disabled={busy || logoBusy}
                  onClick={() => logoInput.current?.click()}
                  aria-describedby="tournament-logo-help"
                  aria-busy={logoBusy}
                >
                  {logoBusy ? (
                    <Loader2 className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Upload aria-hidden="true" />
                  )}
                  {logoBusy ? "Preparing…" : f.logo ? "Change logo" : "Upload logo"}
                </Button>
                <p id="tournament-logo-help" className="mt-1.5 text-xs text-muted-foreground">
                  PNG, JPG or WebP · Up to 5 MB
                </p>
                {logoBusy && (
                  <p role="status" className="mt-1.5 text-xs text-muted-foreground">
                    Preparing your image
                  </p>
                )}
                {f.logo && (
                  <div className="mt-3 flex items-center gap-3 rounded-lg border border-border bg-card p-2">
                    <img
                      src={f.logo}
                      alt="Tournament logo preview"
                      className="h-10 w-10 rounded-md border border-primary/10 bg-primary/5 object-contain p-1"
                    />
                    <p className="flex-1 text-xs text-muted-foreground" role="status">
                      Logo ready to save
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                      disabled={busy || logoBusy}
                      onClick={() => set("logo", "")}
                      aria-label="Remove logo"
                    >
                      <X aria-hidden="true" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <F label="Main colour">
              <Input
                type="color"
                value={f.primary}
                onChange={(e) => set("primary", e.target.value)}
              />
            </F>
            <F label="Accent colour">
              <Input
                type="color"
                value={f.accent}
                onChange={(e) => set("accent", e.target.value)}
              />
            </F>
          </div>
        </Sec>
        {!supportsDetails && (
          <p className="text-sm text-muted-foreground">
            Logo, branding, fixture rules and existing points can be saved. Additional tournament
            details will be available after the database update.
          </p>
        )}
        {supportsDetails && (
          <Sec title="Tournament details">
            <F label="Location">
              <Input
                value={f.location}
                onChange={(e) => set("location", e.target.value)}
                placeholder="City or ground"
              />
            </F>
            <F label="Description">
              <Textarea
                value={f.description}
                onChange={(e) => set("description", e.target.value)}
                rows={3}
                placeholder="About this tournament"
              />
            </F>
            <div className="grid gap-3 sm:grid-cols-2">
              <F label="Starting date">
                <Input
                  type="date"
                  value={f.startDate}
                  onChange={(e) => set("startDate", e.target.value)}
                />
              </F>
              <F label="Ending date">
                <Input
                  type="date"
                  min={f.startDate || undefined}
                  value={f.endDate}
                  onChange={(e) => set("endDate", e.target.value)}
                />
              </F>
            </div>
            <F label="Tournament format">
              <select
                aria-label="Tournament format"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={f.competitionFormat}
                onChange={(e) => set("competitionFormat", e.target.value)}
              >
                <option value="league">League — one points table</option>
                <option value="groups">Group stage — separate points tables</option>
                <option value="knockout">Knockout — fixtures and progression</option>
              </select>
            </F>
          </Sec>
        )}
        <Sec title={tournament ? "Format for new fixtures" : "Format (used for every fixture)"}>
          {tournament && (
            <p className="text-sm text-muted-foreground">
              Format and rule changes apply to fixtures added after saving. Existing fixtures keep
              their settings.
            </p>
          )}
          <div className="grid grid-cols-3 gap-3">
            <F label="Overs">{num("overs", 1, 100)}</F>
            <F label="Balls / over">{num("bpo", 1, 12)}</F>
            <F label="Players / side">{num("players", 2, 15)}</F>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <F label="Wide runs">{num("wideRuns", 0, 5)}</F>
            <F label="No-ball runs">{num("noBallRuns", 0, 5)}</F>
            <F label="Max overs / bowler">
              <Input
                type="number"
                min={1}
                placeholder="No limit"
                value={f.maxOvers}
                onChange={(e) => set("maxOvers", e.target.value)}
              />
            </F>
          </div>
          <label className="flex items-center justify-between gap-4 rounded-md border border-border bg-card p-3">
            <span className="font-medium">Last man bats</span>
            <Switch checked={f.lastManBats} onCheckedChange={(v) => set("lastManBats", v)} />
          </label>
        </Sec>
        <Sec title="Points">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <F label="Win">{num("win", 0, 10)}</F>
            <F label="Tie">{num("tie", 0, 10)}</F>
            <F label="Loss">{num("loss", 0, 10)}</F>
            {supportsDetails && <F label="No result">{num("noResult", 0, 10)}</F>}
          </div>
          {supportsDetails && (
            <F label="Standings order">
              <select
                aria-label="Standings order"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={f.ranking}
                onChange={(e) => set("ranking", e.target.value)}
              >
                <option value="points_nrr_wins">Points, net run rate, wins</option>
                <option value="points_wins_nrr">Points, wins, net run rate</option>
              </select>
            </F>
          )}
        </Sec>
      </fieldset>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" size="lg" className="flex-1" disabled={busy || logoBusy}>
          {busy ? "Saving…" : tournament ? "Save changes" : "Create tournament"}
        </Button>
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={busy || logoBusy}
            onClick={onCancel}
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="border-b border-border pb-1 text-xl font-bold">{title}</h2>
      {children}
    </section>
  );
}
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
