import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const m = vi.hoisted(() => ({
  profile: undefined as unknown,
  profileState: {} as Record<string, unknown>,
  household: null as unknown,
  update: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({ supabase: { auth: { signOut: m.signOut } } }));
vi.mock('../lib/queries', () => ({
  useProfile: () => ({ data: m.profile, isPending: !m.profile, isError: false, ...m.profileState }),
  useUpdateProfile: () => ({ mutateAsync: m.update }),
  useMyHousehold: () => ({ data: m.household }),
}));

import Settings from './Settings';

const base = {
  id: 'u1',
  display_name: 'Mom',
  remind_household: true,
  remind_personal: true,
  lead_days: 7,
  retention_months: 36,
};
const withHousehold = { role: 'owner', households: { id: 'h1', name: 'The Khans', time_zone: 'UTC', retention_months: 36 } };

let qc: QueryClient;
const wrap = () =>
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Settings userId="u1" />
      </MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  qc = new QueryClient();
  m.profile = { ...base };
  m.profileState = {};
  m.household = withHousehold;
  m.update.mockReset().mockResolvedValue(undefined);
  m.signOut.mockReset().mockResolvedValue({ error: null });
});
afterEach(cleanup);

describe('Settings', () => {
  test('top bar and sections', () => {
    wrap();
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Bills/ }).getAttribute('href')).toBe('/');
    expect(screen.getByRole('link', { name: /Archived bills/ }).getAttribute('href')).toBe('/settings/archived');
    const house = screen.getByRole('link', { name: /Household/ });
    expect(house.getAttribute('href')).toBe('/settings/household');
    expect(house.textContent).toContain('The Khans');
    expect(screen.getByRole('link', { name: /Delete account/ }).getAttribute('href')).toBe('/settings/delete-account');
    expect(screen.getByText('Your personal bills')).toBeTruthy();
    expect(screen.getByRole('button', { name: /First reminder/ }).textContent).toContain('7 days before');
    expect(screen.getByRole('button', { name: /Keep history for/ }).textContent).toContain('3 years');
  });

  test('the reminder switches save one column each', async () => {
    const u = userEvent.setup();
    wrap();
    await u.click(screen.getByRole('switch', { name: 'Household bills' }));
    expect(m.update).toHaveBeenLastCalledWith({ remind_household: false });
    await u.click(screen.getByRole('switch', { name: 'My bills' }));
    expect(m.update).toHaveBeenLastCalledWith({ remind_personal: false });
  });

  test.each([
    ['1 day before', 1],
    ['2 days before', 2],
    ['3 days before', 3],
    ['5 days before', 5],
    ['10 days before', 10],
    ['14 days before', 14],
  ])('the first reminder picker saves %s', async (label, days) => {
    const u = userEvent.setup();
    wrap();
    await u.click(screen.getByRole('button', { name: /First reminder/ }));
    const sheet = screen.getByRole('dialog');
    await u.click(within(sheet).getByRole('button', { name: new RegExp(`^${label}`) }));
    expect(m.update).toHaveBeenCalledWith({ lead_days: days });
  });

  test.each([
    ['1 year', 12],
    ['2 years', 24],
    ['5 years', 60],
    ['Never', null],
  ])('keep history for %s saves %s', async (label, months) => {
    const u = userEvent.setup();
    wrap();
    await u.click(screen.getByRole('button', { name: /Keep history for/ }));
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: new RegExp(`^${label}`) }));
    expect(m.update).toHaveBeenCalledWith({ retention_months: months });
  });

  test('shows Never when retention is null', () => {
    m.profile = { ...base, retention_months: null };
    wrap();
    expect(screen.getByRole('button', { name: /Keep history for/ }).textContent).toContain('Never');
  });

  test('without a household, the household switch and row are hidden', () => {
    m.household = null;
    wrap();
    expect(screen.queryByRole('switch', { name: 'Household bills' })).toBeNull();
    expect(screen.queryByRole('link', { name: /Household/ })).toBeNull();
    expect(screen.getByRole('switch', { name: 'My bills' })).toBeTruthy();
  });

  test('a failed save reverts the control and shows calm copy', async () => {
    m.update.mockRejectedValue(new Error('duplicate key value violates constraint xyz'));
    const u = userEvent.setup();
    wrap();
    const sw = screen.getByRole('switch', { name: 'My bills' });
    await u.click(sw);
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).not.toMatch(/duplicate|xyz/);
    expect(screen.getByRole('switch', { name: 'My bills' }).getAttribute('aria-checked')).toBe('true');
  });

  test('keeps the new value while saving and ignores overlapping saves', async () => {
    let finish: () => void = () => {};
    m.update.mockReturnValue(new Promise<void>((r) => (finish = r)));
    const u = userEvent.setup();
    wrap();
    await u.click(screen.getByRole('switch', { name: 'My bills' }));
    expect(screen.getByRole('switch', { name: 'My bills' }).getAttribute('aria-checked')).toBe('false');
    await u.click(screen.getByRole('switch', { name: 'My bills' }));
    expect(m.update).toHaveBeenCalledTimes(1);
    finish();
  });

  test('Sign out uses the normal path and clears the cache', async () => {
    const clear = vi.spyOn(qc, 'clear');
    const u = userEvent.setup();
    wrap();
    await u.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(m.signOut).toHaveBeenCalledWith();
    await waitFor(() => expect(clear).toHaveBeenCalled());
  });

  test('Sign out of all devices uses the global scope and clears the cache', async () => {
    const clear = vi.spyOn(qc, 'clear');
    const u = userEvent.setup();
    wrap();
    await u.click(screen.getByRole('button', { name: 'Sign out of all devices' }));
    expect(m.signOut).toHaveBeenCalledWith({ scope: 'global' });
    await waitFor(() => expect(clear).toHaveBeenCalled());
  });

  test('a sign-out failure shows calm copy and keeps the app as it was', async () => {
    m.signOut.mockResolvedValue({ error: new Error('raw server text') });
    const clear = vi.spyOn(qc, 'clear');
    const u = userEvent.setup();
    wrap();
    await u.click(screen.getByRole('button', { name: 'Sign out of all devices' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).not.toMatch(/raw server/);
    expect(clear).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
  });

  test('the display name can be edited; invalid or unchanged disables Save', async () => {
    const u = userEvent.setup();
    wrap();
    await u.click(screen.getByRole('button', { name: /Name/ }));
    const dialog = screen.getByRole('dialog');
    const input = within(dialog).getByRole('textbox', { name: 'Your name' }) as HTMLInputElement;
    const save = within(dialog).getByRole('button', { name: 'Save' }) as HTMLButtonElement;
    expect(input.value).toBe('Mom');
    expect(save.disabled).toBe(true);
    await u.clear(input);
    expect(save.disabled).toBe(true);
    await u.type(input, '   ');
    expect(save.disabled).toBe(true);
    await u.clear(input);
    await u.type(input, 'x'.repeat(41));
    expect(save.disabled).toBe(true);
    expect(within(dialog).getByText('Please keep your name to 40 characters or fewer.')).toBeTruthy();
    await u.clear(input);
    await u.type(input, '  Grandma ');
    expect(save.disabled).toBe(false);
    await u.click(save);
    expect(m.update).toHaveBeenCalledWith({ display_name: 'Grandma' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  test('a failed name save keeps the sheet open with calm copy', async () => {
    m.update.mockRejectedValue(new Error('raw'));
    const u = userEvent.setup();
    wrap();
    await u.click(screen.getByRole('button', { name: /Name/ }));
    const dialog = screen.getByRole('dialog');
    await u.type(within(dialog).getByRole('textbox'), 'y');
    await u.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(within(dialog).getByRole('alert')).toBeTruthy());
    expect(within(dialog).getByRole('alert').textContent).not.toMatch(/raw/);
  });

  test('loading and error states', () => {
    m.profile = undefined;
    wrap();
    expect(screen.getByRole('status').textContent).toBe('Loading…');
    cleanup();
    m.profileState = { isPending: false, isError: true, error: new Error('x') };
    wrap();
    expect(screen.getByRole('alert').textContent).toBe('Something went wrong. Please try again.');
  });

  test('a saving control is disabled so a second choice cannot be lost', async () => {
    let finish: () => void = () => {};
    m.update.mockReturnValue(new Promise<void>((r) => (finish = r)));
    const u = userEvent.setup();
    wrap();
    await u.click(screen.getByRole('switch', { name: 'My bills' }));
    expect((screen.getByRole('switch', { name: 'My bills' }) as HTMLButtonElement).disabled).toBe(true);
    await u.click(screen.getByRole('button', { name: /Keep history for/ }));
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^1 year/ }));
    finish();
    await waitFor(() => expect((screen.getByRole('switch', { name: 'My bills' }) as HTMLButtonElement).disabled).toBe(false));
  });

  test('two controls saving together both save, and one error does not clear another', async () => {
    const resolvers: Array<(v?: unknown) => void> = [];
    const rejecters: Array<(e: unknown) => void> = [];
    m.update.mockImplementation(
      () => new Promise((res, rej) => { resolvers.push(res); rejecters.push(rej); }),
    );
    const u = userEvent.setup();
    wrap();
    await u.click(screen.getByRole('switch', { name: 'My bills' }));
    await u.click(screen.getByRole('switch', { name: 'Household bills' }));
    expect(m.update).toHaveBeenNthCalledWith(1, { remind_personal: false });
    expect(m.update).toHaveBeenNthCalledWith(2, { remind_household: false });
    rejecters[0](new Error('x'));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    resolvers[1]();
    await waitFor(() =>
      expect((screen.getByRole('switch', { name: 'Household bills' }) as HTMLButtonElement).disabled).toBe(false),
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    // retention error lives in its own section and stays when reminders save
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  test('a failed local sign-out keeps the user signed in with calm copy', async () => {
    m.signOut.mockResolvedValue({ error: new Error('raw') });
    const clear = vi.spyOn(qc, 'clear');
    const u = userEvent.setup();
    wrap();
    await u.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).not.toMatch(/raw/));
    expect(clear).not.toHaveBeenCalled();
  });

  test('a null display name renders sensibly', async () => {
    m.profile = { ...base, display_name: null };
    const u = userEvent.setup();
    wrap();
    await u.click(screen.getByRole('button', { name: /Name/ }));
    const dialog = screen.getByRole('dialog');
    expect((within(dialog).getByRole('textbox', { name: 'Your name' }) as HTMLInputElement).value).toBe('');
    expect((within(dialog).getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
  });

  test('shows no counts', () => {
    wrap();
    expect(document.body.textContent).not.toMatch(/\(\d+\)/);
  });
});
