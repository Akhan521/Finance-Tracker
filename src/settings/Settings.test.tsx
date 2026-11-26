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
  names: [{ profile_id: 'u1' }, { profile_id: 'u2' }] as unknown[],
  create: vi.fn(),
  leave: vi.fn(),
  build: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({ supabase: { auth: { signOut: m.signOut } } }));
vi.mock('../lib/export', () => ({ buildExportRows: (...a: unknown[]) => m.build(...a) }));
vi.mock('../lib/queries', () => ({
  useProfile: () => ({ data: m.profile, isPending: !m.profile, isError: false, ...m.profileState }),
  useUpdateProfile: () => ({ mutateAsync: m.update }),
  useMyHousehold: () => ({ data: m.household }),
  useHouseholdNames: (_u: string, enabled: boolean) => ({ data: enabled ? m.names : undefined }),
  useCreateHousehold: () => ({ mutateAsync: m.create }),
  useLeaveHousehold: () => ({ mutateAsync: m.leave }),
}));

import { endOfMonth, todayIn } from '../lib/calendar';
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
  m.names = [{ profile_id: 'u1' }, { profile_id: 'u2' }];
  m.create.mockReset().mockResolvedValue(undefined);
  m.build.mockReset().mockResolvedValue([]);
  m.leave.mockReset().mockResolvedValue(undefined);
  m.signOut.mockReset().mockResolvedValue({ error: null });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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

  describe('create household', () => {
    beforeEach(() => {
      m.household = null;
    });

    test('is hidden with a household', () => {
      m.household = withHousehold;
      wrap();
      expect(screen.queryByRole('button', { name: /Create household/ })).toBeNull();
    });

    test('sends the trimmed name and the device zone, guarded while invalid or saving', async () => {
      vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
        timeZone: 'America/Los_Angeles',
      } as Intl.ResolvedDateTimeFormatOptions);
      let finish: () => void = () => {};
      m.create.mockReturnValue(new Promise<void>((r) => (finish = r)));
      const u = userEvent.setup();
      wrap();
      await u.click(screen.getByRole('button', { name: /Create household/ }));
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByText('Time zone: America/Los_Angeles')).toBeTruthy();
      expect(within(dialog).getByText('Bills in this household follow this time zone.')).toBeTruthy();
      const input = within(dialog).getByRole('textbox', { name: 'Household name' });
      const create = within(dialog).getByRole('button', { name: 'Create' }) as HTMLButtonElement;
      expect(create.disabled).toBe(true);
      await u.type(input, 'x'.repeat(41));
      expect(create.disabled).toBe(true);
      await u.clear(input);
      await u.type(input, '  The Khans ');
      expect(create.disabled).toBe(false);
      await u.click(create);
      await u.click(create);
      expect(m.create).toHaveBeenCalledTimes(1);
      expect(m.create).toHaveBeenCalledWith({ name: 'The Khans', timeZone: 'America/Los_Angeles' });
      expect(create.disabled).toBe(true);
      finish();
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    test('a throwing Intl falls back to the profile zone', async () => {
      vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(() => {
        throw new Error('no intl');
      });
      m.profile = { ...base, time_zone: 'Europe/Paris' };
      const u = userEvent.setup();
      wrap();
      await u.click(screen.getByRole('button', { name: /Create household/ }));
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByText('Time zone: Europe/Paris')).toBeTruthy();
      await u.type(within(dialog).getByRole('textbox', { name: 'Household name' }), 'Home');
      await u.click(within(dialog).getByRole('button', { name: 'Create' }));
      expect(m.create).toHaveBeenCalledWith({ name: 'Home', timeZone: 'Europe/Paris' });
    });

    test('bad_time_zone maps to its copy', async () => {
      m.create.mockRejectedValue(new Error('bad_time_zone'));
      const u = userEvent.setup();
      wrap();
      await u.click(screen.getByRole('button', { name: /Create household/ }));
      const dialog = screen.getByRole('dialog');
      await u.type(within(dialog).getByRole('textbox', { name: 'Household name' }), 'Home');
      await u.click(within(dialog).getByRole('button', { name: 'Create' }));
      await waitFor(() => expect(within(dialog).getByRole('alert').textContent).toBe("That time zone isn't recognised."));
    });

    test('an error is calm and keeps the sheet open', async () => {
      m.create.mockRejectedValue(new Error('already_in_household'));
      const u = userEvent.setup();
      wrap();
      await u.click(screen.getByRole('button', { name: /Create household/ }));
      const dialog = screen.getByRole('dialog');
      await u.type(within(dialog).getByRole('textbox', { name: 'Household name' }), 'Home');
      await u.click(within(dialog).getByRole('button', { name: 'Create' }));
      await waitFor(() => expect(within(dialog).getByRole('alert')).toBeTruthy());
      expect(within(dialog).getByRole('alert').textContent).not.toMatch(/already_in_household/);
    });
  });

  describe('leave household', () => {
    test('asks inline first with focus on Cancel, and Cancel returns focus', async () => {
      const u = userEvent.setup();
      wrap();
      await u.click(screen.getByRole('button', { name: 'Leave household' }));
      expect(m.leave).not.toHaveBeenCalled();
      expect(screen.getByText(/Leave The Khans\?/)).toBeTruthy();
      expect(screen.getByText(/You'll lose access to its bills right away\./)).toBeTruthy();
      const cancel = screen.getByRole('button', { name: 'Cancel' });
      expect(document.activeElement).toBe(cancel);
      await u.click(cancel);
      expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Leave household' }));
    });

    test('confirming leaves with the household id', async () => {
      const u = userEvent.setup();
      wrap();
      await u.click(screen.getByRole('button', { name: 'Leave household' }));
      await u.click(screen.getByRole('button', { name: 'Leave' }));
      expect(m.leave).toHaveBeenCalledWith('h1');
    });

    test('a successful leave moves focus to Create household once the household is gone', async () => {
      const u = userEvent.setup();
      const view = wrap();
      await u.click(screen.getByRole('button', { name: 'Leave household' }));
      await u.click(screen.getByRole('button', { name: 'Leave' }));
      m.household = null;
      view.rerender(
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <Settings userId="u1" />
          </MemoryRouter>
        </QueryClientProvider>,
      );
      await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: /Create household/ })));
    });

    test('last_owner shows the mapped copy and keeps the household', async () => {
      m.leave.mockRejectedValue(new Error('last_owner'));
      const u = userEvent.setup();
      wrap();
      await u.click(screen.getByRole('button', { name: 'Leave household' }));
      await u.click(screen.getByRole('button', { name: 'Leave' }));
      await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Make someone else an owner first.'));
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Leave household' }));
      expect(screen.getByRole('link', { name: /Household/ }).textContent).toContain('The Khans');
    });

    test('the sole member sees a note and no Leave button', () => {
      m.names = [{ profile_id: 'u1' }];
      wrap();
      expect(screen.getByText("You're the only member. You can delete the household from the Household screen.")).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Leave household' })).toBeNull();
    });

    test('is hidden without a household', () => {
      m.household = null;
      wrap();
      expect(screen.queryByRole('button', { name: 'Leave household' })).toBeNull();
    });
  });

  describe('export', () => {
    let blobs: Blob[];
    let clicked: { download: string; href: string }[];
    const revoke = vi.fn();
    beforeEach(() => {
      blobs = [];
      clicked = [];
      revoke.mockReset();
      URL.createObjectURL = (b: Blob | MediaSource) => {
        blobs.push(b as Blob);
        return 'blob:test';
      };
      URL.revokeObjectURL = revoke;
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        clicked.push({ download: this.download, href: this.href });
      });
      m.profile = { ...base, time_zone: 'America/Los_Angeles' };
    });
    const readText = (b: Blob) =>
      new Promise<string>((res) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.readAsText(b);
      });

    const readBytes = (b: Blob) =>
      new Promise<ArrayBuffer>((res) => {
        const r = new FileReader();
        r.onload = () => res(r.result as ArrayBuffer);
        r.readAsArrayBuffer(b);
      });

    test('sits above Keep history with its caption and downloads a dated CSV with a BOM and header', async () => {
      m.build.mockResolvedValue([
        { bill: 'Rent', scope: 'Household', category: 'Housing', dueDate: '2026-10-01', status: 'paid', expected: '1980.00', paymentAmount: '1980.00', paidOn: '2026-10-01', paidBy: 'Mom' },
      ]);
      const u = userEvent.setup();
      wrap();
      const exportRow = screen.getByRole('button', { name: /Export to spreadsheet/ });
      expect(exportRow.textContent).toContain('CSV of your bills and payments');
      const keep = screen.getByRole('button', { name: /Keep history for/ });
      expect(exportRow.compareDocumentPosition(keep) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      await u.click(exportRow);
      await waitFor(() => expect(clicked).toHaveLength(1));
      expect(m.build).toHaveBeenCalledWith('u1', endOfMonth(todayIn('America/Los_Angeles')));
      expect(clicked[0].download).toBe(`bills-${todayIn('America/Los_Angeles')}.csv`);
      expect(blobs[0].type).toBe('text/csv;charset=utf-8');
      const text = await readText(blobs[0]);
      // Reading as text strips the BOM, so check the raw bytes too.
      const bytes = new Uint8Array(await readBytes(blobs[0]));
      expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
      expect(text.startsWith('"Bill","Household or mine"')).toBe(true);
      expect(text).toContain('"Rent","Household"');
      await waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:test'));
    });

    test('shows Preparing, disables the row, and ignores a second tap', async () => {
      let finish: (v: unknown[]) => void = () => {};
      m.build.mockReturnValue(new Promise<unknown[]>((r) => (finish = r)));
      const u = userEvent.setup();
      wrap();
      await u.click(screen.getByRole('button', { name: /Export to spreadsheet/ }));
      const row = screen.getByRole('button', { name: /Export to spreadsheet/ }) as HTMLButtonElement;
      expect(row.textContent).toContain('Preparing…');
      expect(screen.getByRole('status').textContent).toBe('Preparing…');
      expect(row.disabled).toBe(true);
      await u.click(row);
      expect(m.build).toHaveBeenCalledTimes(1);
      finish([]);
      await waitFor(() => expect(clicked).toHaveLength(1));
      expect((screen.getByRole('button', { name: /Export to spreadsheet/ }) as HTMLButtonElement).disabled).toBe(false);
    });

    test('a failure shows calm copy and downloads nothing', async () => {
      m.build.mockRejectedValue(new Error('raw server text'));
      const u = userEvent.setup();
      wrap();
      await u.click(screen.getByRole('button', { name: /Export to spreadsheet/ }));
      await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
      expect(screen.getByRole('alert').textContent).toBe("Couldn't prepare your export. Please try again.");
      expect(blobs).toHaveLength(0);
      expect(clicked).toHaveLength(0);
      expect((screen.getByRole('button', { name: /Export to spreadsheet/ }) as HTMLButtonElement).disabled).toBe(false);
    });
  });

  test('shows no counts', () => {
    wrap();
    expect(document.body.textContent).not.toMatch(/\(\d+\)/);
  });
});
