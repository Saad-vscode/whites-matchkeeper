import { afterEach, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const mocks=vi.hoisted(() => ({ list: vi.fn(), rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@/lib/platform-matches', async original => ({ ...await original<typeof import('@/lib/platform-matches')>(), otherMatches: mocks.list }));
import { independentMatchActions, type ManagedMatch } from '@/lib/platform-matches';
import { PlatformMatches } from '@/components/platform-matches';
const match={ id:'quick',tournament_id:null,team_a:'Alpha',team_b:'Beta',organizer:'Organizer',email:'test@example.invalid',status:'completed',overs:20,balls_per_over:6,created_at:'2026-01-01',platform_hidden:false,platform_disabled:false,platform_archived:false,platform_deleted_at:null } as ManagedMatch;
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('limits actions to independent matches and reserves transfers for the owner', () => {
 expect(independentMatchActions('owner',{...match,tournament_id:'t'})).toEqual([]);
 expect(independentMatchActions('user',match)).toEqual([]);
 expect(independentMatchActions('admin',match)).not.toContain('transfer');
 expect(independentMatchActions('owner',match)).toContain('transfer');
 expect(independentMatchActions('owner',{...match,status:'live'})).not.toContain('delete');
 expect(independentMatchActions('admin',{...match,platform_deleted_at:'2026-01-01'})).toEqual(['recover']);
});
it('renders independent matches and passes selected status filters to the backend', async () => {
 mocks.list.mockResolvedValue({ rows:[match],total:1,summary:{total:1,hidden:0,disabled:0,archived:0} });
 render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><PlatformMatches actorRole="admin"/></QueryClientProvider>);
 expect(await screen.findByText('Alpha vs Beta')).toBeInTheDocument();
 expect(screen.getByText(/Independent quick matches only/)).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Filter matches'),{target:{value:'hidden'}});
 await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith('','hidden',0));
});
it('shows an access error instead of a directory on a rejected request', async () => {
 mocks.list.mockRejectedValue(new Error('Access denied'));
 render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><PlatformMatches actorRole="admin"/></QueryClientProvider>);
 expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load matches');
 expect(screen.queryByText('Alpha vs Beta')).toBeNull();
});
