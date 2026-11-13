import { useEffect, useRef, useState } from "react";
import { Volume2, Square, Upload, Music2, RotateCcw, Clock3, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AUDIO_EVENT, AUDIO_KEY, AUDIO_SECONDS, localTrack } from "@/lib/cricket/match-audio";

export function MatchAudio({ settings = false }: { settings?: boolean }) {
  const [enabled, setEnabled] = useState(false),
    [name, setName] = useState("");
  const [ready, setReady] = useState(false),
    [remaining, setRemaining] = useState(0);
  const [error, setError] = useState("");
  const [custom, setCustom] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const player = useRef<HTMLAudioElement | null>(null),
    timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const generation = useRef(0);
  const stop = () => {
    generation.current++;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    if (player.current) {
      player.current.pause();
      player.current.currentTime = 0;
    }
    setRemaining(0);
  };
  useEffect(() => {
    let disposed = false,
      revision = 0,
      url = "";
    const refresh = async () => {
      const current = ++revision;
      stop();
      setReady(false);
      try {
        setEnabled(localStorage.getItem(AUDIO_KEY) === "true");
        const file = await localTrack();
        if (disposed || current !== revision) return;
        if (url) URL.revokeObjectURL(url);
        url = file ? URL.createObjectURL(file) : "";
        const audio = new Audio(url || "/audio/ipl-horn.mp3");
        audio.loop = true;
        audio.volume = 0.65;
        audio.onerror = () => {
          stop();
          setError("This audio could not be played. Try another MP3 or WAV file.");
        };
        player.current = audio;
        setName(file?.name ?? "IPL stadium horn");
        setCustom(!!file);
        setReady(true);
      } catch {
        if (!disposed)
          setError("Audio storage is unavailable. Allow browser storage and try again.");
      }
    };
    void refresh();
    const stored = (event: StorageEvent) => {
      if (event.key === AUDIO_KEY || event.key === "crease-match-audio-track" || event.key === null)
        void refresh();
    };
    window.addEventListener(AUDIO_EVENT, refresh);
    window.addEventListener("storage", stored);
    window.addEventListener("pagehide", stop);
    return () => {
      disposed = true;
      revision++;
      stop();
      if (url) URL.revokeObjectURL(url);
      window.removeEventListener(AUDIO_EVENT, refresh);
      window.removeEventListener("storage", stored);
      window.removeEventListener("pagehide", stop);
    };
  }, []);
  const play = async () => {
    if (!player.current || !ready || !enabled) return;
    stop();
    setError("");
    const id = generation.current;
    try {
      await player.current.play();
      if (id !== generation.current) return;
      const end = Date.now() + AUDIO_SECONDS * 1000;
      setRemaining(AUDIO_SECONDS);
      timer.current = setInterval(() => {
        const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
        if (!left) stop();
        else setRemaining(left);
      }, 200);
    } catch {
      if (id === generation.current) setError("Playback could not start. Try pressing Horn again.");
    }
  };
  const upload = async (file: File | null) => {
    stop();
    setError("");
    if (file && (!file.type.startsWith("audio/") || file.size > 25 * 1024 * 1024)) {
      setError("Choose an audio file smaller than 25 MB.");
      return;
    }
    try {
      await localTrack(file);
      localStorage.setItem("crease-match-audio-track", String(Date.now()));
      window.dispatchEvent(new Event(AUDIO_EVENT));
    } catch {
      setError("Could not save the audio on this device. Check available browser storage.");
    }
  };
  const controls = (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant={settings ? "default" : "outline"}
        disabled={!ready || !enabled || remaining > 0}
        onClick={() => void play()}
        aria-label="Play horn"
      >
        <Volume2 size={18} />
        {settings ? "Preview horn" : "Horn"}
      </Button>
      {remaining > 0 && (
        <>
          <span
            className="text-sm font-semibold tabular-nums"
            role="timer"
            aria-label="Playback time remaining"
          >
            Playing · {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
          </span>
          <Button type="button" variant="outline" onClick={stop}>
            <Square size={16} />
            Stop
          </Button>
        </>
      )}
    </div>
  );
  if (!settings)
    return enabled ? (
      <div className="flex flex-wrap items-center gap-2">
        {controls}
        {error && (
          <span role="alert" className="text-sm text-destructive">
            {error}
          </span>
        )}
      </div>
    ) : null;
  return (
    <section className="space-y-5 rounded-2xl border border-border bg-white p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Match audio</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your ground. Your sound. Played only from this scorer’s device.
          </p>
        </div>
        <label className="flex items-center gap-2 font-semibold">
          <input
            type="checkbox"
            className="h-5 w-5 accent-teal-600"
            checked={enabled}
            onChange={(e) => {
              stop();
              try {
                localStorage.setItem(AUDIO_KEY, String(e.target.checked));
                window.dispatchEvent(new Event(AUDIO_EVENT));
              } catch {
                setError("Could not save this setting.");
              }
            }}
          />
          Enabled
        </label>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-muted/20">
        <div className="flex items-center gap-4 p-5">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Music2 size={25} aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Matchday sound
            </p>
            <p className="break-words text-base font-bold">{name || "Loading audio…"}</p>
            <span className="mt-2 inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
              {custom ? "Your upload" : "Default horn"}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-white px-5 py-4">
          {controls}
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Clock3 size={14} aria-hidden="true" />
            90-second loop · Manual play
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold">Make it your own</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Upload a horn or music track · Audio files up to 25 MB
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            accept="audio/*"
            aria-label="Upload your tone or music"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = "";
            }}
          />
          <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>
            <Upload size={16} />
            Upload audio
          </Button>
          {custom && (
            <Button type="button" variant="ghost" onClick={() => void upload(null)}>
              <RotateCcw size={15} />
              Restore default
            </Button>
          )}
        </div>
      </div>
      <p className="flex items-start gap-2 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
        <Monitor size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
        Saved and played on this device only. Enable to show the horn beside More on the scorer’s
        page.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
