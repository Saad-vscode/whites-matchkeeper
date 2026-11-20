import { Link } from '@tanstack/react-router';
export function PlatformModeSwitch({ admin = false }: { admin?: boolean }) {
  return <nav aria-label="Workspace mode" className="mt-2 inline-flex rounded-lg border border-border bg-muted p-1 text-xs font-semibold">
    <Link to="/dashboard" aria-current={!admin ? 'page' : undefined} className={`rounded-md px-4 py-1.5 ${!admin ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}>User</Link>
    <Link to="/admin" aria-current={admin ? 'page' : undefined} className={`rounded-md px-4 py-1.5 ${admin ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'}`}>Admin</Link>
  </nav>;
}
