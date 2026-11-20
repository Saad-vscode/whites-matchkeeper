import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ role: 'user', enabled: false }));
vi.mock('@tanstack/react-router', () => ({ createFileRoute: () => () => ({}), Link: ({ children, to, ...props }: any) => <a href={to} {...props}>{children}</a> }));
vi.mock('@/components/cricket/bits', () => ({ useUser: () => ({ user: { id: 'test' }, ready: true }) }));
vi.mock('@/lib/platform-admin', () => ({ usePlatformRole: () => ({ data: state.role }), readOverview: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({ useQuery: (options: any) => { state.enabled = options.enabled; return { isPending: true }; } }));
import { AdminPage } from '../components/platform-admin';
afterEach(cleanup);
it('does not request overview data or expose admin navigation to ordinary users', () => {
  state.role = 'user'; render(<AdminPage/>);
  expect(state.enabled).toBe(false);
  expect(screen.getByText('Platform access required')).toBeInTheDocument();
  expect(screen.queryByRole('navigation', { name: 'Platform administration' })).toBeNull();
});
it('owners and admins get existing user route, navigation and honest placeholders', () => {
  for (const role of ['owner','admin']) {
    state.role = role; render(<AdminPage/>);
    expect(state.enabled).toBe(true);
    expect(screen.getByRole('link', { name:'User' })).toHaveAttribute('href','/dashboard');
    fireEvent.click(screen.getByRole('button', {name:'Activity Logs'}));
    expect(screen.getByText('Ready for the next phase')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name:'Toggle navigation labels'}));
    expect(screen.getByRole('button', {name:'Toggle navigation labels'})).toHaveAttribute('aria-expanded','false');
    cleanup();
  }
});

