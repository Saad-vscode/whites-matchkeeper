import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), read: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@/lib/global-settings', () => ({ readGlobalSettings: mocks.read, readAnnouncements: async () => [] }));
import { PlatformSettings } from '@/components/platform-settings';
const data = { revision: 'revision-1', users: 12, live_matches: 2,
  settings: [{ id: 'maintenance', category: 'controls', value: false, default_value: false, changed_at: '', changed_by: null }],
  features: [{ id: 'sound', category: 'Personal features', label: 'Scorer sound effects', globally_enabled: true, default_enabled: true }] };
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function setup(role: 'owner' | 'admin') {
  mocks.read.mockResolvedValue(data); mocks.rpc.mockResolvedValue({ error: null });
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PlatformSettings actorRole={role}/></QueryClientProvider>);
}
it('stages changes, previews impact and saves only after confirmation with revision', async () => {
  setup('owner');
  const toggle = await screen.findByLabelText('Maintenance');
  fireEvent.click(toggle); expect(mocks.rpc).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Review changes' }));
  expect(screen.getByText(/12 registered users/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and save' }));
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('platform_settings_save', expect.objectContaining({ _values: { maintenance: true }, _revision: 'revision-1' })));
});
it('keeps non-owner administration read-only', async () => {
  setup('admin'); expect(await screen.findByLabelText('Maintenance')).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Review changes' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Global features' }));
  expect(screen.getByRole('checkbox')).toBeDisabled();
});
it('discards drafts and requires explicit bulk confirmation separately', async () => {
  setup('owner'); fireEvent.click(await screen.findByLabelText('Maintenance'));
  fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
  expect(screen.getByLabelText('Maintenance')).not.toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'New user permissions' }));
  expect(screen.getByRole('button', { name: 'Apply to 12 accounts', hidden: true })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Bulk confirmation'), { target: { value: 'APPLY TO ALL USERS' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply to 12 accounts', hidden: true }));
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('platform_bulk_defaults', { _confirm: 'APPLY TO ALL USERS', _revision: 'revision-1' }));
});
