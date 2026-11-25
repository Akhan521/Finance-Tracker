import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

type Q = { data?: unknown; isError?: boolean; isPending?: boolean; error?: unknown; refetch: () => unknown };
const m = vi.hoisted(() => ({
  profile: {} as Q,
  household: {} as Q,
  invites: {} as Q,
  signOut: vi.fn(),
}));

vi.mock('./auth/useSession', () => ({
  useSession: () => ({ session: { user: { id: 'u1' } }, loading: false }),
}));
vi.mock('./auth/SignIn', () => ({ default: () => <p>signin</p> }));
vi.mock('./lib/supabase', () => ({ supabase: { auth: { signOut: m.signOut } } }));
vi.mock('./lib/config', () => ({ APP_NAME: 'Bills' }));
vi.mock('./lib/queries', () => ({
  useProfile: () => m.profile,
  useMyHousehold: () => m.household,
  useMyInvites: () => m.invites,
  useUpdateProfile: () => ({ mutateAsync: vi.fn() }),
  useAcceptInvite: () => ({ mutateAsync: vi.fn() }),
  useMonthEntries: () => ({ data: [], isError: false }),
  useHasBills: () => ({ data: false }),
  useSetLastView: () => ({ mutate: vi.fn() }),
}));

import App from './App';

const ok = (data: unknown): Q => ({ data, isError: false, isPending: false, refetch: vi.fn() });
const wrap = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <App />
    </QueryClientProvider>,
  );

describe('App gate', () => {
  beforeEach(() => {
    sessionStorage.clear();
    m.signOut.mockReset().mockResolvedValue({ error: null });
    m.profile = ok({ display_name: 'Mom' });
    m.household = ok(null);
    m.invites = ok([]);
  });
  afterEach(cleanup);

  test('shows a calm loading status while loading', () => {
    m.profile = { isPending: true, isError: false, refetch: vi.fn() };
    wrap();
    expect(screen.getByRole('status').textContent).toBe('Loading…');
  });

  test('a failed background refetch keeps the app on screen', () => {
    m.profile = { ...ok({ display_name: 'Mom' }), isError: true, error: new Error('fetch failed') };
    m.household = { ...ok(null), isError: true, error: new Error('fetch failed') };
    wrap();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('No bills yet.')).toBeTruthy();
  });

  test('a first-load failure offers Try again and Sign out', async () => {
    const refetch = vi.fn();
    m.profile = { isPending: false, isError: true, error: new Error('x'), refetch };
    wrap();
    expect(screen.getByRole('alert').textContent).toBe('Something went wrong. Please try again.');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(m.signOut).toHaveBeenCalled();
  });

  test('an invites error does not block the app', () => {
    m.invites = { isPending: false, isError: true, error: new Error('x'), refetch: vi.fn() };
    wrap();
    expect(screen.getByText('No bills yet.')).toBeTruthy();
  });

  test('a pending invite shows for someone with no household, per-user Not now', async () => {
    m.invites = ok([{ id: 'i1', household_name: 'Home', invited_by_name: null, expires_at: 'x' }]);
    wrap();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.getByText('No bills yet.')).toBeTruthy();
    expect(sessionStorage.getItem('invite-dismissed:u1')).toBe('1');
  });
});
