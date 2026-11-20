import { PlatformMatches } from '@/components/platform-matches';
import { PlatformSettings } from '@/components/platform-settings';
import { PlatformFeatures } from "@/components/platform-features";
import { PlatformUsers } from "@/components/platform-users";
import { PlatformTournaments } from "@/components/platform-tournaments";
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Activity, Users, Trophy, SlidersHorizontal, Settings2, LayoutDashboard, ShieldCheck, Menu, Radio, ArrowUpRight } from 'lucide-react';
import { useUser } from '@/components/cricket/bits';
import { usePlatformRole, readOverview } from '@/lib/platform-admin';
import { PlatformModeSwitch } from '@/components/platform-mode-switch';
import { Button } from '@/components/ui/button';

const sections = [
  ['Overview', LayoutDashboard, 'A live view of your cricket platform.'],
  ['User Management', Users, 'Account administration, blocking and administrator access.'],
  ['Tournament Management', Trophy, 'Tournament visibility and lifecycle controls.'],
  ['Other Matches', Radio, 'Independent match visibility, scoring access and recoverable history.'],
  ['Feature Controls', SlidersHorizontal, 'Individual access, animations, sounds, celebrations and presentation.'],
  ['Application Settings', Settings2, 'Platform-wide configuration and feature defaults.'],
  ['Activity Logs', Activity, 'Administrative actions and platform activity.'],
] as const;
export function AdminPage() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  const { user, ready } = useUser();
  const role = usePlatformRole(user?.id);
  const allowed = online && !!user && !role.isError && (role.data === 'owner' || role.data === 'admin');
  const overview = useQuery({ queryKey: ['platform-overview', user?.id], queryFn: readOverview, enabled: allowed, retry: false, gcTime: 0, staleTime: 0, refetchInterval: 30000 });
  const [section, setSection] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  if (online && (!ready || (user && role.isPending))) return <div className="tournament-page min-h-screen bg-background p-8 text-foreground" role="status">Checking platform access…</div>;
  if (!allowed) return <div className="tournament-page flex min-h-screen items-center justify-center bg-background p-6 text-foreground"><div className="max-w-md rounded-2xl border border-border bg-card p-8"><ShieldCheck className="mb-4 text-primary"/><h1 className="text-2xl font-bold">Platform access required</h1><p className="my-4 text-muted-foreground">{!online ? 'Administration requires an online connection.' : role.isError ? 'Unable to verify access. Check your connection and database configuration.' : 'This workspace is available to authorised platform administrators.'}</p><Button asChild><Link to={user ? '/dashboard' : '/auth'}>Return to {user ? 'User Mode' : 'sign in'}</Link></Button></div></div>;
  const data = overview.isError ? undefined : overview.data;
  const metrics = data ? [
    ['Registered users', data.users, Users], ['Active users · 30 days', data.activeUsers, Activity], ['Blocked users', data.blockedUsers, ShieldCheck], ['Platform admins', data.admins, ShieldCheck],
    ['Total tournaments', data.tournaments, Trophy], ['Active tournaments', data.activeTournaments, Activity], ['Completed tournaments', data.completedTournaments, Trophy], ['Live matches', data.liveMatches, Radio],
  ] as const : [];
  return <div className="tournament-page min-h-screen bg-background text-foreground md:flex">
    <aside className={`shrink-0 border-b border-border bg-card p-4 md:sticky md:top-0 md:h-screen md:border-r ${collapsed ? 'md:w-40' : 'md:w-64'}`}>
      <div className="flex items-center justify-between"><Link to="/" className="text-2xl font-extrabold tracking-tight text-primary">Crease</Link><Button variant="ghost" size="icon" aria-label="Toggle navigation labels" aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}><Menu size={18}/></Button></div>
      <PlatformModeSwitch admin/>
      <nav aria-label="Platform administration" className="mt-6 flex gap-1 overflow-x-auto md:flex-col">
        {sections.map(([label, Icon], index) => <button key={label} title={label} aria-current={index === section ? 'page' : undefined} onClick={() => setSection(index)} className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition-colors ${section === index ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}><Icon size={19}/><span className={collapsed ? 'md:sr-only' : ''}>{label}</span></button>)}
      </nav><p className="mt-6 text-xs text-muted-foreground">{role.data === 'owner' ? 'Platform Owner' : 'Platform Admin'}<br/>Secure administration · Phase 3</p>
    </aside>
    <main className="min-w-0 flex-1 p-5 sm:p-8 lg:p-10"><div className="mx-auto max-w-6xl">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4"><div><p className="mb-2 text-xs font-bold uppercase tracking-widest text-primary">Platform workspace</p><h1 className="text-3xl font-bold tracking-tight">{sections[section]![0]}</h1><p className="mt-2 text-sm text-muted-foreground">{sections[section]![2]}</p></div><ShieldCheck className="text-primary" size={32}/></div>
      {section === 1 ? <PlatformUsers actorId={user!.id} actorRole={role.data!}/> : section === 2 ? <PlatformTournaments actorId={user!.id} actorRole={role.data!}/> : section === 3 ? <PlatformMatches actorRole={role.data!}/> : section === 4 ? <PlatformFeatures actorRole={role.data!}/> : section === 5 ? <PlatformSettings actorRole={role.data!}/> : section !== 0 ? <section className="rounded-2xl border border-border bg-card p-8"><p className="text-xs font-bold uppercase tracking-wider text-primary">Planned capability</p><h2 className="mt-3 text-xl font-semibold">Ready for the next phase</h2><p className="mt-3 max-w-xl text-muted-foreground">{sections[section]![2]} These management operations are planned for a future phase. Existing account and tournament permissions remain in effect.</p></section> : <>
        {overview.isPending && <p role="status">Loading platform information…</p>}
        {overview.isError && <div role="alert" className="rounded-xl border border-border bg-card p-5">Platform information is unavailable. Access may have changed or the connection was lost. <Button variant="outline" onClick={() => void overview.refetch()}>Retry</Button></div>}
        {data && <><div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{metrics.map(([label, value, Icon]) => <section key={label} className="rounded-2xl border border-border bg-card p-4 sm:p-5"><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-muted-foreground">{label}</p><Icon size={17} className="shrink-0 text-primary"/></div><p className="mt-4 text-3xl font-bold tabular-nums">{value.toLocaleString()}</p></section>)}</div>
          <p className="my-4 text-xs leading-relaxed text-muted-foreground">Active users signed in within 30 days and are not blocked. Active tournaments have started fixtures and no completed identified final. Completed tournaments have a completed identified final. Admin totals include owners. Updated {new Date(data.generatedAt).toLocaleTimeString()}.</p>
          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            <section className="rounded-2xl border border-border bg-card p-5"><h2 className="mb-4 text-lg font-bold">Recent registrations</h2>{data.registrations.length ? data.registrations.map(row => <div key={row.id} className="flex flex-wrap justify-between gap-2 border-t border-border py-3 text-sm"><span className="min-w-0 break-all">{row.email || 'Account without email'}</span><time className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleDateString()}</time></div>) : <p className="text-sm text-muted-foreground">No registrations yet.</p>}</section>
            <section className="rounded-2xl border border-border bg-card p-5"><h2 className="mb-4 text-lg font-bold">Recent tournaments</h2>{data.recentTournaments.length ? data.recentTournaments.map(row => <Link key={row.id} to="/t/$tournamentId" params={{tournamentId:row.id}} className="flex items-center justify-between gap-3 border-t border-border py-3 text-sm hover:text-primary"><span className="truncate">{row.name}</span><ArrowUpRight size={16}/></Link>) : <p className="text-sm text-muted-foreground">No tournaments yet.</p>}</section>
          </div><section className="mt-5 rounded-2xl border border-border bg-card p-5"><h2 className="mb-4 text-lg font-bold">Administrative activity</h2>{data.activity.length ? data.activity.map((row,index) => <div key={index} className="flex flex-wrap justify-between gap-2 border-t border-border py-3 text-sm"><span>{row.action.replaceAll('_',' ')}</span><time className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString()}</time></div>) : <p className="text-sm text-muted-foreground">No administrative activity recorded.</p>}<p className="mt-4 text-xs text-muted-foreground">Role changes are recorded from this release. User growth trends and broader platform activity will be added in a future phase.</p></section></>}
      </>}
    </div></main>
  </div>;
}
