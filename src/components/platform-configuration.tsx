import { useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouterState, Link } from '@tanstack/react-router';
import { Wrench, X, Megaphone } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { applyGlobalDefaults, applyMaintenanceState, readAnnouncements, type SettingValue } from '@/lib/global-settings';

export function PlatformConfiguration({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: s => s.location.pathname });
  const config = useQuery({ queryKey: ['public-platform-config'], queryFn: async () => {
    const { data, error } = await supabase.rpc('public_platform_configuration');
    if (error) throw error;
    return data as unknown as { values: Record<string, SettingValue>; ongoing: string[] };
  }, retry: false, refetchInterval: 5000, refetchIntervalInBackground: true });
  const messages = useQuery({ queryKey: ['public-announcements'], queryFn: () => readAnnouncements(true), retry: false, refetchInterval: 15000 });
  const [dismissed, setDismissed] = useState<string[]>([]);
  useEffect(() => { if (config.data) { applyGlobalDefaults(config.data.values); applyMaintenanceState(config.data.values['maintenance'] === true, config.data.ongoing); } }, [config.data]);
  // Leave the scorer mounted: its queue and reconnection workflow must survive maintenance.
  // Backend guards reject writes except for matches captured when maintenance began.
  const operational = /^\/(score|display|match)\//.test(path);
  const access = path === '/admin' || path === '/auth' || path === '/accept-invite';
  const creationClosed = (path === '/tournaments/new' && config.data?.values['tournaments'] === false) || (path === '/matches/new' && config.data?.values['quick_matches'] === false);
  if (creationClosed) return <div className="tournament-page min-h-screen bg-background p-8 text-foreground"><section className="mx-auto max-w-lg rounded-2xl border border-border bg-card p-6"><h1 className="text-xl font-bold">New creation is temporarily paused</h1><p className="my-4 text-muted-foreground">Your existing tournaments, matches and saved results remain available.</p><Link to="/dashboard" className="text-primary">Return to My matches</Link></section></div>;
  if (config.data?.values['maintenance'] && !access && !operational) return <div className="tournament-page flex min-h-screen items-center justify-center bg-background p-6 text-foreground"><section className="w-full max-w-lg rounded-3xl border border-border bg-card p-8 text-center"><Link to="/" className="text-2xl font-extrabold text-primary">Crease</Link><Wrench className="mx-auto my-6 text-primary" size={36}/><h1 className="text-2xl font-bold">A short break between innings</h1><p className="my-4 text-muted-foreground">{String(config.data.values['maintenance_message'])}</p><p className="mb-6 text-sm text-muted-foreground">Ongoing matches can finish. Saved scores and pending offline changes are preserved.</p><Link to="/admin" className="text-sm font-semibold text-primary">Platform administration</Link><span className="mx-3 text-muted-foreground">·</span><Link to="/auth" className="text-sm text-primary">Sign in</Link></section></div>;
  return <>{!operational && !access && !messages.isError && messages.data?.filter(a => !dismissed.includes(`${a.id}:${a.changed_at}`)).map(a => <aside key={a.id} className="tournament-page flex items-start gap-3 border-b border-border bg-card px-5 py-3 text-foreground" aria-label="Platform announcement"><Megaphone size={18} className="mt-0.5 shrink-0 text-primary"/><div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{a.title}</p><p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{a.body}</p></div>{a.dismissible && <button aria-label="Dismiss announcement" onClick={() => setDismissed(v => [...v, `${a.id}:${a.changed_at}`])}><X size={18}/></button>}</aside>)}{children}</>;
}
