import { cn } from "@/lib/utils";

export function UnderlineTabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="sticky top-0 z-10 -mx-4 overflow-x-auto border-b border-border bg-background/95 px-4 backdrop-blur">
      <div className="flex min-w-max gap-6">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => onChange(t.id)}
            className={cn("border-b-2 py-3 text-sm font-semibold uppercase tracking-wider transition-colors",
              value === t.id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { id: T; label: string }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="flex rounded-full bg-muted p-1">
      {options.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)}
          className={cn("flex-1 truncate rounded-full px-4 py-2 text-sm font-semibold", value === o.id ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function TeamBadge({ name, color, logo, size = 40 }: { name: string; color?: string | null; logo?: string | null; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  if (logo) return <img src={logo} alt="" style={{ width: size, height: size }} className="shrink-0 rounded-full bg-card object-cover shadow" />;
  return (
    <span style={{ width: size, height: size, background: color ?? undefined, fontSize: size * 0.36 }}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground shadow">
      {initials}
    </span>
  );
}
