import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, SlidersHorizontal, Users, Gauge, Megaphone, Palette, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { readGlobalSettings, readAnnouncements, type GlobalSettings, type SettingValue, type Announcement } from '@/lib/global-settings';
import type { PlatformRole } from '@/lib/platform-admin';

const sections = [['Platform controls', ShieldCheck], ['Global features', SlidersHorizontal], ['New user permissions', Users], ['Platform limits', Gauge], ['Announcements', Megaphone], ['Application defaults', Palette]] as const;
const descriptions: Record<string, string> = {
  maintenance: 'Pause new activity. Matches already live, paused or between innings can finish. Offline queues remain saved.',
  registrations: 'Allow new accounts, including invitations. Existing users can still sign in.',
  tournaments: 'Allow new tournaments. Existing tournaments remain available.', quick_matches: 'Allow new independent matches. Existing matches remain available.',
  tournaments_per_user: 'Counts all owned tournaments, including recoverable records.', quick_matches_per_user: 'Counts independent matches created by each user.',
  teams_per_tournament: 'Maximum team records in a tournament.', players_per_team: 'Maximum squad size. Existing larger squads are preserved.', matches_per_tournament: 'Includes manually created and generated fixtures.',
};
const options: Record<string, (string | number)[]> = { tv_theme: ['teal', 'blue', 'violet', 'night'], celebration_style: ['classic', 'stadium', 'gold'], celebration_duration: [5000, 10000, 15000], honours_seconds: [5, 6, 7, 8, 9, 10] };
const label = (id: string) => id.replaceAll('_', ' ').replace(/^./, s => s.toUpperCase());
const inputClass = 'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground';
export function PlatformSettings({ actorRole }: { actorRole: PlatformRole }) {
  const query = useQuery({ queryKey: ['platform-settings'], queryFn: readGlobalSettings, retry: false, gcTime: 0, refetchInterval: 15000 });
  if (query.isError) return <div role="alert">Unable to verify settings access. <Button variant="outline" onClick={() => void query.refetch()}>Retry</Button></div>;
  if (!query.data) return <p role="status">Loading platform settings…</p>;
  return <SettingsEditor data={query.data} writable={actorRole === 'owner'}/>;
}
function SettingsEditor({ data, writable }: { data: GlobalSettings; writable: boolean }) {
  const client = useQueryClient();
  const [section, setSection] = useState(0);
  const [values, setValues] = useState<Record<string, SettingValue>>({});
  const [features, setFeatures] = useState<Record<string, { globally_enabled: boolean; default_enabled: boolean }>>({});
  const [base, setBase] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [bulk, setBulk] = useState('');
  const revision = data.revision;
  const dirty = Object.keys(values).length + Object.keys(features).length > 0;
  useEffect(() => {
    if (!dirty) return;
    const leave = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [dirty]);
  const stage = (id: string, value: SettingValue) => { setBase(base ?? revision); setValues(v => ({ ...v, [id]: value })); };
  const discard = () => { setValues({}); setFeatures({}); setBase(null); setConfirm(false); };
  const run = async (operation: () => PromiseLike<{ error: unknown }>) => {
    setBusy(true); setMessage('');
    try { const result = await operation(); if (result.error) throw result.error; discard(); setMessage('Settings saved. Connected screens update within a few seconds.'); await client.invalidateQueries({ queryKey: ['platform-settings'] }); await client.invalidateQueries({ queryKey: ['feature-access'] }); }
    catch (error) { setMessage(error instanceof Error ? error.message : (error as { message?: string })?.message ?? 'Unable to save settings.'); }
    finally { setBusy(false); }
  };
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4"><p className="text-sm text-muted-foreground">{writable ? 'Owner workspace · Changes are staged until confirmed.' : 'Read-only · Only the Platform Owner can change settings.'}</p><span className="text-xs font-semibold text-primary">{data.live_matches} ongoing matches</span></div>
    <nav aria-label="Settings categories" className="grid grid-cols-2 gap-2 lg:grid-cols-3">{sections.map(([name, Icon], i) => <button key={name} onClick={() => setSection(i)} aria-current={section === i ? 'page' : undefined} className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-left text-sm font-semibold ${section === i ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground'}`}><Icon size={17}/>{name}</button>)}</nav>
    {section === 4 ? <Announcements writable={writable}/> : <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="text-lg font-bold">{sections[section]?.[0]}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{section === 1 ? 'Global restrictions override individual permissions. Re-enabling restores saved access and preferences.' : section === 2 ? 'These permissions apply to newly created accounts only. Existing account baselines and overrides stay unchanged.' : section === 5 ? 'Starting preferences for devices without a saved choice. Stage-aware match celebrations retain their existing designs.' : section === 3 ? 'Leave a limit empty for Unlimited. Existing records are never removed.' : 'Maintenance uses a safe finish-current-matches workflow. Administrative access remains available.'}</p>
      {(section === 1 || section === 2) ? <div className="mt-4 divide-y divide-border">{data.features.map(f => <label key={f.id} className="flex items-center justify-between gap-4 py-3"><span><span className="block text-sm font-semibold">{f.label}</span><span className="text-xs text-muted-foreground">{f.category}</span></span><input type="checkbox" className="size-4 accent-primary" disabled={!writable || busy} checked={(features[f.id] ?? f)[section === 1 ? 'globally_enabled' : 'default_enabled']} onChange={e => { setBase(base ?? revision); setFeatures(v => ({ ...v, [f.id]: { globally_enabled: (v[f.id] ?? f).globally_enabled, default_enabled: (v[f.id] ?? f).default_enabled, [section === 1 ? 'globally_enabled' : 'default_enabled']: e.target.checked } })); }}/></label>)}</div> : <div className="mt-4 divide-y divide-border">{data.settings.filter(s => s.category === (section === 0 ? 'controls' : section === 3 ? 'limits' : 'defaults')).map(s => { const value = s.id in values ? values[s.id] : s.value; return <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div className="min-w-0 flex-1 basis-52"><label htmlFor={`setting-${s.id}`} className="text-sm font-semibold">{label(s.id)}</label><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{descriptions[s.id]}</p></div><div className="flex w-full items-center gap-2 sm:w-60">
        {typeof s.default_value === 'boolean' ? <input id={`setting-${s.id}`} type="checkbox" className="size-4 accent-primary" checked={value === true} disabled={!writable || busy} onChange={e => stage(s.id, e.target.checked)}/> : options[s.id] ? <select id={`setting-${s.id}`} className={inputClass} value={String(value)} disabled={!writable || busy} onChange={e => stage(s.id, typeof s.default_value === 'number' ? Number(e.target.value) : e.target.value)}>{options[s.id]!.map(o => <option key={o} value={o}>{o}</option>)}</select> : <input id={`setting-${s.id}`} className={inputClass} type={s.category === 'limits' ? 'number' : 'text'} min={0} max={100000} maxLength={500} placeholder="Unlimited" value={value === null ? '' : String(value)} disabled={!writable || busy} onChange={e => stage(s.id, s.category === 'limits' ? e.target.value === '' ? null : Number(e.target.value) : e.target.value)}/>}
        {writable && <Button variant="ghost" size="icon" aria-label={`Reset ${label(s.id)}`} disabled={busy} onClick={() => stage(s.id, s.default_value)}><RotateCcw size={14}/></Button>}</div></div>; })}</div>}
    </section>}
    {message && <p role="status" className="rounded-xl border border-border bg-muted p-4 text-sm">{message}</p>}
    {writable && <div className="rounded-xl border border-border bg-card p-4"><div className="flex flex-wrap items-center gap-3"><span className="mr-auto text-sm font-semibold">{dirty ? 'Unsaved changes' : 'All changes saved'}</span><Button variant="outline" disabled={busy} onClick={() => { setBase(revision); setValues(Object.fromEntries(data.settings.map(s => [s.id, s.default_value]))); setFeatures(Object.fromEntries(data.features.map(f => [f.id, { globally_enabled: true, default_enabled: true }]))); }}>Restore platform defaults</Button><Button variant="outline" disabled={!dirty || busy} onClick={discard}>Discard</Button><Button disabled={!dirty || busy} onClick={() => setConfirm(true)}>Review changes</Button></div>
      {confirm && <div className="mt-4 space-y-3 border-t border-border pt-4" role="region" aria-label="Confirm platform changes"><p className="text-sm font-semibold">Applies across the platform · {data.users} registered users · {data.live_matches} ongoing matches</p><p className="text-sm text-muted-foreground">Maintenance preserves ongoing matches. Restrictions and creation limits take effect on the next request. New-user defaults leave existing users unchanged.</p><ul className="space-y-1 text-xs">{Object.entries(values).map(([key, value]) => <li key={key}>{label(key)}: {String(data.settings.find(s => s.id === key)?.value ?? 'Unlimited')} → {String(value ?? 'Unlimited')}</li>)}{Object.entries(features).map(([key, value]) => <li key={key}>{data.features.find(f => f.id === key)?.label}: globally {value.globally_enabled ? 'enabled' : 'disabled'}, new accounts {value.default_enabled ? 'enabled' : 'disabled'}</li>)}</ul><input aria-label="Reason for changes" placeholder="Reason (optional)" maxLength={1000} className={inputClass} value={reason} onChange={e => setReason(e.target.value)}/><Button disabled={busy} onClick={() => void run(() => supabase.rpc('platform_settings_save', { _values: values, _features: features, _revision: base ?? revision, _reason: reason }))}>Confirm and save</Button></div>}
    </div>}
    {writable && section === 2 && <details className="rounded-xl border border-border bg-card p-5"><summary className="cursor-pointer text-sm font-semibold">Apply saved defaults to existing users</summary><p className="my-3 text-sm text-muted-foreground">This separate operation replaces feature baselines and removes individual overrides for all {data.users} accounts. Global restrictions still apply. Save any pending changes first.</p><ul className="mb-3 text-xs">{data.features.map(f => <li key={f.id}>{f.label}: {f.default_enabled ? 'enabled' : 'disabled'}</li>)}</ul><input aria-label="Bulk confirmation" placeholder="Type APPLY TO ALL USERS" className={inputClass} value={bulk} onChange={e => setBulk(e.target.value)}/><Button className="mt-3" disabled={dirty || busy || bulk !== 'APPLY TO ALL USERS'} onClick={() => void run(() => supabase.rpc('platform_bulk_defaults', { _confirm: bulk, _revision: revision }))}>Apply to {data.users} accounts</Button></details>}
  </div>;
}
function Announcements({ writable }: { writable: boolean }) {
  const query = useQuery({ queryKey: ['admin-announcements'], queryFn: () => readAnnouncements(), retry: false, gcTime: 0 });
  const [draft, setDraft] = useState<Partial<Announcement> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(remove = false) {
    if (!draft) return;
    setBusy(true); setError('');
    const { error } = await supabase.rpc('platform_announcement_save', { _id: draft.id ?? null, _value: { ...draft, starts_at: draft.starts_at ? new Date(draft.starts_at).toISOString() : null, ends_at: draft.ends_at ? new Date(draft.ends_at).toISOString() : null }, _delete: remove });
    if (error) setError(error.message); else { setDraft(null); await query.refetch(); }
    setBusy(false);
  }
  return <section className="rounded-2xl border border-border bg-card p-5"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold">Announcements</h2>{writable && <Button onClick={() => setDraft({ title: '', body: '', category: 'information', published: false, dismissible: true })}>New announcement</Button>}</div><p className="mt-2 text-sm text-muted-foreground">Normal pages only. Live scoring, spectator screens and TV remain uninterrupted. Schedule times use your local timezone.</p>
    {query.isError ? <p role="alert">Unable to load announcements.</p> : !query.data ? <p>Loading…</p> : query.data.length === 0 ? <p className="py-5 text-sm text-muted-foreground">No announcements yet.</p> : query.data.map(a => <div key={a.id} className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3"><div className="min-w-0"><p className="break-words font-semibold">{a.title}</p><p className="text-xs text-muted-foreground">{a.category} · {a.published ? 'Published / scheduled' : 'Draft'}{a.ends_at ? ` · Ends ${new Date(a.ends_at).toLocaleString()}` : ''}</p></div>{writable && <Button variant="outline" onClick={() => setDraft(a)}>Edit</Button>}</div>)}
    {draft && <form className="mt-5 space-y-3 border-t border-border pt-5" onSubmit={e => { e.preventDefault(); void save(); }}><label className="block text-sm">Title<input required maxLength={120} className={inputClass} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })}/></label><label className="block text-sm">Message<textarea required maxLength={1000} className={inputClass} value={draft.body} onChange={e => setDraft({ ...draft, body: e.target.value })}/></label><label className="block text-sm">Category<select className={inputClass} value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })}>{['information','important','feature','maintenance','warning'].map(c => <option key={c}>{c}</option>)}</select></label><div className="grid gap-3 sm:grid-cols-2">{(['starts_at','ends_at'] as const).map(k => <label key={k} className="text-sm">{k === 'starts_at' ? 'Starts (optional)' : 'Expires (optional)'}<input type="datetime-local" className={inputClass} value={draft[k] ? new Date(new Date(draft[k]!).getTime() - new Date(draft[k]!).getTimezoneOffset() * 60000).toISOString().slice(0,16) : ''} onChange={e => setDraft({ ...draft, [k]: e.target.value || null })}/></label>)}</div>{(['published','dismissible'] as const).map(k => <label key={k} className="flex gap-2 text-sm"><input type="checkbox" checked={draft[k]} onChange={e => setDraft({ ...draft, [k]: e.target.checked })}/>{label(k)}</label>)}<p className="text-xs text-muted-foreground">Saving a published announcement makes it visible during its schedule.</p><div className="flex flex-wrap gap-2"><Button disabled={busy}>Save announcement</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setDraft(null)}>Discard</Button>{draft.id && <Button type="button" variant="outline" disabled={busy} onClick={() => { if (window.confirm('Delete this announcement?')) void save(true); }}>Delete</Button>}</div></form>}{error && <p role="alert" className="mt-3 text-sm">{error}</p>}
  </section>;
}
