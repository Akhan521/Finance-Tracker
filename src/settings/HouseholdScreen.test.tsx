import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const m = vi.hoisted(() => ({
  household: undefined as unknown,
  members: undefined as unknown,
  membersState: {} as Record<string, unknown>,
  setRole: vi.fn(),
  remove: vi.fn(),
  updateHh: vi.fn(),
  leave: vi.fn(),
  invites: [] as unknown[],
  invite: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock('../lib/queries', () => ({
  useMyHousehold: () => ({ data: m.household }),
  useMembers: () => ({ data: m.members, isError: false, ...m.membersState }),
  useHouseholdNames: (_u: string, enabled: boolean) => ({
    data: enabled ? (m.members as unknown[] | undefined) : undefined,
  }),
  useSetRole: () => ({ mutateAsync: m.setRole }),
  useRemoveMember: () => ({ mutateAsync: m.remove }),
  useUpdateHousehold: () => ({ mutateAsync: m.updateHh }),
  useLeaveHousehold: () => ({ mutateAsync: m.leave }),
  usePendingInvites: () => ({ data: m.invites, isError: false }),
  useInvite: () => ({ mutateAsync: m.invite }),
  useCancelInvite: () => ({ mutateAsync: m.cancel }),
}));

import HouseholdScreen from './HouseholdScreen';

const hh = (role: string) => ({
  role,
  households: { id: 'h1', name: 'The Khans', time_zone: 'UTC', retention_months: 36 },
});
const people = [
  { profile_id: 'u3', role: 'member', display_name: 'Zed' },
  { profile_id: 'u2', role: 'member', display_name: 'Sam' },
  { profile_id: 'u1', role: 'owner', display_name: 'Alex' },
  { profile_id: 'u4', role: 'owner', display_name: null },
];

const wrap = () =>
  render(
    <MemoryRouter initialEntries={['/settings/household']}>
      <Routes>
        <Route path="/settings/household" element={<HouseholdScreen userId="u1" />} />
        <Route path="/settings" element={<p>SETTINGS PAGE</p>} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  m.household = hh('owner');
  m.members = people.map((p) => ({ ...p }));
  m.membersState = {};
  m.setRole.mockReset().mockResolvedValue(undefined);
  m.remove.mockReset().mockResolvedValue(undefined);
  m.updateHh.mockReset().mockResolvedValue(undefined);
  m.leave.mockReset().mockResolvedValue(undefined);
  m.invites = [];
  m.invite.mockReset().mockResolvedValue(undefined);
  m.cancel.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('HouseholdScreen', () => {
  test('top bar links back to Settings and shows the household name', () => {
    wrap();
    expect(screen.getByRole('heading', { level: 1, name: 'The Khans' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Settings/ }).getAttribute('href')).toBe('/settings');
  });

  test('without a household it says so calmly', () => {
    m.household = null;
    wrap();
    expect(screen.getByText("You're not in a household.")).toBeTruthy();
    expect(screen.getByRole('link', { name: /Settings/ }).getAttribute('href')).toBe('/settings');
  });

  test('members show labels, (you), owners first then by name, and no counts', () => {
    wrap();
    const group = screen.getByRole('heading', { name: 'Members' }).closest('section') as HTMLElement;
    const text = (group.textContent ?? '').replace(/\s+/g, ' ');
    expect(text.indexOf('Alex (you)')).toBeGreaterThan(-1);
    expect(text.indexOf('Alex (you)')).toBeLessThan(text.indexOf('Unnamed'));
    expect(text.indexOf('Unnamed')).toBeLessThan(text.indexOf('Sam'));
    expect(text.indexOf('Sam')).toBeLessThan(text.indexOf('Zed'));
    expect(within(group).getAllByText('Owner')).toHaveLength(2);
    expect(within(group).getAllByText('Member')).toHaveLength(2);
    expect(document.body.textContent).not.toMatch(/\d+ members?/i);
  });

  test('an owner opens another member and sees Make owner and Remove', async () => {
    const u = userEvent.setup();
    wrap();
    await u.click(screen.getByRole('button', { name: 'Sam, Member' }));
    const dialog = screen.getByRole('dialog', { name: 'Sam' });
    expect(within(dialog).getByRole('button', { name: 'Make owner' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Remove from household' })).toBeTruthy();
  });

  test('your own row is not tappable', () => {
    wrap();
    expect(screen.queryByRole('button', { name: /Alex/ })).toBeNull();
  });

  test('a member sees no actions and no Keep history row', () => {
    m.household = hh('member');
    wrap();
    expect(screen.getByText('Sam')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Sam/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Keep history for/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Leave household' })).toBeTruthy();
  });

  test('Make owner sends role owner for that membership', async () => {
    const u = userEvent.setup();
    wrap();
    await u.click(screen.getByRole('button', { name: 'Sam, Member' }));
    await u.click(screen.getByRole('button', { name: 'Make owner' }));
    expect(m.setRole).toHaveBeenCalledWith({ householdId: 'h1', profileId: 'u2', role: 'owner' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  test('Make member sends role member for an owner', async () => {
    const u = userEvent.setup();
    wrap();
    await u.click(screen.getByRole('button', { name: 'Unnamed, Owner' }));
    await u.click(screen.getByRole('button', { name: 'Make member' }));
    expect(m.setRole).toHaveBeenCalledWith({ householdId: 'h1', profileId: 'u4', role: 'member' });
  });

  test('Remove asks inline first, then removes the target only', async () => {
    const u = userEvent.setup();
    wrap();
    await u.click(screen.getByRole('button', { name: 'Sam, Member' }));
    await u.click(screen.getByRole('button', { name: 'Remove from household' }));
    expect(m.remove).not.toHaveBeenCalled();
    expect(screen.getByText(/Remove Sam\?/)).toBeTruthy();
    expect(screen.getByText(/They'll lose access to the household's bills right away\./)).toBeTruthy();
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(document.activeElement).toBe(cancel);
    await u.click(cancel);
    expect(m.remove).not.toHaveBeenCalled();
    await u.click(screen.getByRole('button', { name: 'Remove from household' }));
    await u.click(screen.getByRole('button', { name: 'Remove' }));
    expect(m.remove).toHaveBeenCalledWith({ householdId: 'h1', profileId: 'u2' });
    expect(m.remove).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  test('last_owner shows the mapped copy in the sheet', async () => {
    m.setRole.mockRejectedValue(new Error('last_owner'));
    const u = userEvent.setup();
    wrap();
    await u.click(screen.getByRole('button', { name: 'Unnamed, Owner' }));
    await u.click(screen.getByRole('button', { name: 'Make member' }));
    const dialog = screen.getByRole('dialog');
    await waitFor(() => expect(within(dialog).getByRole('alert').textContent).toBe('Make someone else an owner first.'));
  });

  describe('Keep history for', () => {
    test('saves each choice to the household', async () => {
      const cases: [string, number | null][] = [
        ['1 year', 12],
        ['2 years', 24],
        ['3 years', 36],
        ['5 years', 60],
        ['Never', null],
      ];
      for (const [label, value] of cases) {
        const u = userEvent.setup();
        m.updateHh.mockClear();
        const view = wrap();
        expect(screen.getByText('Household bills')).toBeTruthy();
        await u.click(screen.getByRole('button', { name: /Keep history for/ }));
        await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: label }));
        expect(m.updateHh).toHaveBeenCalledWith({ householdId: 'h1', retention_months: value });
        view.unmount();
      }
    });

    test('reverts and shows an error when saving fails', async () => {
      m.updateHh.mockRejectedValue(new Error('forbidden'));
      const u = userEvent.setup();
      wrap();
      await u.click(screen.getByRole('button', { name: /Keep history for/ }));
      await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: '1 year' }));
      await waitFor(() => expect(screen.getByRole('alert').textContent).toBe("You don't have access to do that."));
      expect(screen.getByRole('button', { name: /Keep history for/ }).textContent).toContain('3 years');
    });

    test('is disabled while saving', async () => {
      let done!: () => void;
      m.updateHh.mockReturnValue(new Promise<void>((r) => (done = r)));
      const u = userEvent.setup();
      wrap();
      await u.click(screen.getByRole('button', { name: /Keep history for/ }));
      await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: '5 years' }));
      const row = screen.getByRole('button', { name: /Keep history for/ }) as HTMLButtonElement;
      expect(row.disabled).toBe(true);
      expect(row.textContent).toContain('5 years');
      done();
      await waitFor(() => expect(row.disabled).toBe(false));
    });
  });

  describe('Leave', () => {
    test('confirms inline, leaves, and goes to Settings', async () => {
      const u = userEvent.setup();
      wrap();
      await u.click(screen.getByRole('button', { name: 'Leave household' }));
      expect(m.leave).not.toHaveBeenCalled();
      expect(screen.getByText(/Leave The Khans\?/)).toBeTruthy();
      await u.click(screen.getByRole('button', { name: 'Leave' }));
      expect(m.leave).toHaveBeenCalledWith('h1');
      await waitFor(() => expect(screen.getByText('SETTINGS PAGE')).toBeTruthy());
    });

    test('a sole member sees the note and no Leave button', () => {
      m.members = [{ profile_id: 'u1', role: 'owner', display_name: 'Alex' }];
      wrap();
      expect(screen.queryByRole('button', { name: 'Leave household' })).toBeNull();
      expect(screen.getByText(/You're the only member\./)).toBeTruthy();
    });
  });

  describe('invites', () => {
    const open = [
      { id: 'i1', email: 'mom@test.local', expires_at: '2026-12-03T20:00:00Z' },
      { id: 'i2', email: 'dad@test.local', expires_at: '2026-12-04T09:00:00Z' },
    ];

    test('an owner sees pending invites with expiry and Cancel, plus the invite row, and no counts', () => {
      m.invites = open;
      wrap();
      const group = screen.getByRole('heading', { name: 'Pending invites' }).closest('section') as HTMLElement;
      expect(within(group).getByText('mom@test.local')).toBeTruthy();
      expect(within(group).getByText('Expires Dec 3')).toBeTruthy();
      expect(within(group).getByText('Expires Dec 4')).toBeTruthy();
      expect(within(group).getAllByRole('button', { name: /^Cancel invite for/ })).toHaveLength(2);
      expect(within(group).getByRole('button', { name: '+ Invite someone by email' })).toBeTruthy();
      expect(document.body.textContent).not.toMatch(/\d+ (pending|invites?)/i);
    });

    test('with no pending invites only the invite row shows', () => {
      wrap();
      const group = screen.getByRole('heading', { name: 'Pending invites' }).closest('section') as HTMLElement;
      expect(within(group).getAllByRole('button')).toHaveLength(1);
      expect(group.textContent).not.toMatch(/no (pending )?invites/i);
    });

    test('a member sees no invites section', () => {
      m.household = hh('member');
      m.invites = open;
      wrap();
      expect(screen.queryByRole('heading', { name: 'Pending invites' })).toBeNull();
      expect(screen.queryByText('mom@test.local')).toBeNull();
      expect(screen.queryByRole('button', { name: /Invite someone/ })).toBeNull();
    });

    test('Cancel cancels that invite without a confirm', async () => {
      m.invites = open;
      const u = userEvent.setup();
      wrap();
      await u.click(screen.getByRole('button', { name: 'Cancel invite for dad@test.local' }));
      expect(m.cancel).toHaveBeenCalledWith('i2');
    });

    test('a failed cancel shows the message', async () => {
      m.invites = open;
      m.cancel.mockRejectedValue(new Error('no_access'));
      const u = userEvent.setup();
      wrap();
      await u.click(screen.getByRole('button', { name: 'Cancel invite for dad@test.local' }));
      await waitFor(() => expect(screen.getByRole('alert').textContent).toBe("You can't do that anymore. Refresh and try again."));
    });

    test('sending closes the sheet and says so quietly', async () => {
      const u = userEvent.setup();
      wrap();
      await u.click(screen.getByRole('button', { name: '+ Invite someone by email' }));
      const dialog = screen.getByRole('dialog', { name: 'Invite someone' });
      const field = within(dialog).getByRole('textbox', { name: 'Email address' }) as HTMLInputElement;
      expect(field.type).toBe('email');
      expect(field.autocomplete).toBe('off');
      await u.type(field, 'new@test.local');
      await u.click(within(dialog).getByRole('button', { name: 'Send invite' }));
      expect(m.invite).toHaveBeenCalledWith('new@test.local');
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Invite someone' })).toBeNull());
      expect(screen.getByRole('status').textContent).toBe('Invite sent to new@test.local.');
    });

    test.each([
      ['already_invited', 'That person already has an invite.'],
      ['too_many_invites', 'There are already a lot of open invites. Cancel one first.'],
      ['bad_email', 'Please enter a valid email address.'],
      ['forbidden', "You don't have access to do that."],
      ['email_failed', "We couldn't send that invite email. Please try again."],
    ])('%s shows calm copy in the sheet', async (key, copy) => {
      m.invite.mockRejectedValue(new Error(key));
      const u = userEvent.setup();
      wrap();
      await u.click(screen.getByRole('button', { name: '+ Invite someone by email' }));
      const dialog = screen.getByRole('dialog');
      await u.type(within(dialog).getByRole('textbox', { name: 'Email address' }), 'x@test.local');
      await u.click(within(dialog).getByRole('button', { name: 'Send invite' }));
      await waitFor(() => expect(within(dialog).getByRole('alert').textContent).toBe(copy));
      expect(screen.getByRole('dialog')).toBeTruthy();
    });

    test.each(['a,b@c.de', '<a@b.cd>', 'a b@c.de', '"q"a@b.cd', 'nodot@host'])(
      'a bad address %s is refused in the sheet before sending',
      async (bad) => {
        const u = userEvent.setup();
        wrap();
        await u.click(screen.getByRole('button', { name: '+ Invite someone by email' }));
        const dialog = screen.getByRole('dialog');
        const field = within(dialog).getByRole('textbox', { name: 'Email address' }) as HTMLInputElement;
        // type=email inputs reject some of these in jsdom; set the value directly.
        fireEvent.change(field, { target: { value: bad } });
        fireEvent.submit(field.closest('form')!);
        expect(within(dialog).getByRole('alert').textContent).toBe('Please enter a valid email address.');
        expect(m.invite).not.toHaveBeenCalled();
      },
    );

    test('a malformed address disables Send and shows a hint', async () => {
      const u = userEvent.setup();
      wrap();
      await u.click(screen.getByRole('button', { name: '+ Invite someone by email' }));
      const dialog = screen.getByRole('dialog');
      const field = within(dialog).getByRole('textbox', { name: 'Email address' });
      const send = within(dialog).getByRole('button', { name: 'Send invite' }) as HTMLButtonElement;
      expect(send.disabled).toBe(true);
      expect(within(dialog).queryByText(/like name@example\.com/)).toBeNull();
      await u.type(field, 'a,riley@test.local');
      expect(send.disabled).toBe(true);
      expect(within(dialog).getByText('Enter an email address like name@example.com.')).toBeTruthy();
      expect(field.getAttribute('aria-invalid')).toBe('true');
      expect(field.getAttribute('aria-describedby')).toBe(within(dialog).getByText(/like name@example/).id);
      expect(dialog.querySelector('form')!.noValidate).toBe(true);
      await u.clear(field);
      await u.type(field, 'riley@test.local');
      expect(send.disabled).toBe(false);
      expect(within(dialog).queryByText(/like name@example\.com/)).toBeNull();
    });

    test('a double submit sends once', async () => {
      let done!: () => void;
      m.invite.mockReturnValue(new Promise<void>((r) => (done = r)));
      const u = userEvent.setup();
      wrap();
      await u.click(screen.getByRole('button', { name: '+ Invite someone by email' }));
      const dialog = screen.getByRole('dialog');
      await u.type(within(dialog).getByRole('textbox', { name: 'Email address' }), 'x@test.local{Enter}{Enter}');
      await u.click(within(dialog).getByRole('button', { name: 'Send invite' }));
      expect(m.invite).toHaveBeenCalledTimes(1);
      done();
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Invite someone' })).toBeNull());
    });
  });
});
