import { createFileRoute } from '@tanstack/react-router';
import { AdminPage } from '@/components/platform-admin';
export const Route = createFileRoute('/admin')({ ssr: false, component: AdminPage, head: () => ({ meta: [{ title: 'Platform administration - Crease' }, { name: 'robots', content: 'noindex, nofollow' }] }) });
