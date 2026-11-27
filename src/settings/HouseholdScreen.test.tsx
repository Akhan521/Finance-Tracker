import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
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
  del: vi.fn(),
  afterDelete: undefined as undefined | (() => void),
  exportRun: vi.fn(),
  exportState: { exporting: false, error: '', ready: true },
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
  useDeleteHousehold: (_u: string, onDeleted?: () => void) => ({
    mutateAsync: async (id: string) => {
      await m.del(id);
      onDeleted?.();
      m.afterDelete?.();
    },
  }),
}));
vi.mock('./useCsvExport', () => ({
  useCsvExport: () => ({ ...m.exportState, run: m.exportRun }),
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

function SettingsProbe() {
  const { state } = useLocation();
  return (
    <>
      <p>SETTINGS PAGE</p>
      <p data-testid="state">{JSON.stringify(state)}</p>
    </>
  );
}

const wrap = () =>
  render(
    <MemoryRouter initialEntries={['/settings/household']}>
      <Routes>
        <Route path="/settings/household" element={<HouseholdScreen userId="u1" />} />
        <Route path="/settings" element={<SettingsProbe />} />
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
  m.del.mockReset().mockResolvedValue(undefined);
  m.afterDelete = undefined;
  m.exportRun.mockReset();
  m.exportState = { exporting: false, error: '', ready: true };
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

    test('a sole owner sees Delete household instead of Leave', () => {
      m.members = [{ profile_id: 'u1', role: 'owner', display_name: 'Alex' }];
      wrap();
      expect(screen.queryByRole('button', { name: 'Leave household' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Delete household' })).toBeTruthy();
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

  describe('delete household', () => {
    const solo = () => {
      m.members = [{ profile_id: 'u1', role: 'owner', display_name: 'Alex' }];
    };
    const openPanel = async (u: ReturnType<typeof userEvent.setup>) => {
      await u.click(screen.getByRole('button', { name: 'Delete household' }));
      return screen.getByRole('group', { name: /Delete The Khans\?/ });
    };

    test('the row shows only for a sole owner, in place of the note', () => {
      solo();
      wrap();
      expect(screen.getByRole('button', { name: 'Delete household' })).toBeTruthy();
      expect(screen.queryByText(/You're the only member\./)).toBeNull();
    });

    test('no row with other members, for a sole non-owner, or a member', () => {
      wrap();
      expect(screen.queryByRole('button', { name: 'Delete household' })).toBeNull();
      cleanup();
      m.household = hh('member');
      solo();
      m.members = [{ profile_id: 'u1', role: 'member', display_name: 'Alex' }];
      wrap();
      expect(screen.queryByRole('button', { name: 'Delete household' })).toBeNull();
      expect(screen.getByText(/You're the only member\./)).toBeTruthy();
    });

    test('the panel warns, offers Export first and a typed confirm, with focus in the field', async () => {
      solo();
      const u = userEvent.setup();
      wrap();
      const panel = await openPanel(u);
      expect(
        within(panel).getByText("Deleting The Khans permanently removes all its bills, payments and history. This can't be undone."),
      ).toBeTruthy();
      expect(within(panel).getByRole('button', { name: 'Export first' })).toBeTruthy();
      const field = within(panel).getByLabelText('Type The Khans to confirm');
      expect(document.activeElement).toBe(field);
      // A visible label, and it is the field's accessible name.
      expect(within(panel).getByText('Type The Khans to confirm').tagName).toBe('SPAN');
      expect(within(panel).getByRole('textbox', { name: 'Type The Khans to confirm' })).toBe(field);
      expect(field.getAttribute('aria-label')).toBeNull();
      expect(document.body.textContent).not.toMatch(/\d+ (bills?|members?|payments?)\b/i);
    });

    test('Delete stays disabled until the exact name is typed (case-sensitive)', async () => {
      solo();
      const u = userEvent.setup();
      wrap();
      const panel = await openPanel(u);
      const del = within(panel).getByRole('button', { name: 'Delete household' }) as HTMLButtonElement;
      const field = within(panel).getByLabelText('Type The Khans to confirm');
      expect(del.disabled).toBe(true);
      await u.type(field, 'the khans');
      expect(del.disabled).toBe(true);
      await u.clear(field);
      await u.type(field, '  The Khans ');
      expect(del.disabled).toBe(false);
    });

    test('Export first runs the shared export', async () => {
      solo();
      const u = userEvent.setup();
      wrap();
      const panel = await openPanel(u);
      await u.click(within(panel).getByRole('button', { name: 'Export first' }));
      expect(m.exportRun).toHaveBeenCalledTimes(1);
    });

    test('Cancel closes the panel and returns focus to the row', async () => {
      solo();
      const u = userEvent.setup();
      wrap();
      const panel = await openPanel(u);
      await u.click(within(panel).getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByRole('group', { name: /Delete The Khans/ })).toBeNull();
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Delete household' }));
      expect(m.del).not.toHaveBeenCalled();
    });

    test('deleting calls the household id once, then goes to Settings with a one-shot flag', async () => {
      solo();
      const u = userEvent.setup();
      wrap();
      const panel = await openPanel(u);
      await u.type(within(panel).getByLabelText('Type The Khans to confirm'), 'The Khans');
      const del = within(panel).getByRole('button', { name: 'Delete household' });
      await u.dblClick(del);
      expect(m.del).toHaveBeenCalledTimes(1);
      expect(m.del).toHaveBeenCalledWith('h1');
      await waitFor(() => expect(screen.getByText('SETTINGS PAGE')).toBeTruthy());
      expect(JSON.parse(screen.getByTestId('state').textContent!)).toEqual({ householdDeleted: true });
    });

    test("never shows \"You're not in a household.\" after a successful delete", async () => {
      solo();
      m.afterDelete = () => {
        m.household = null; // the caches drop right after the screen has started leaving
      };
      let seen = false;
      const obs = new MutationObserver(() => {
        if (document.body.textContent?.includes("You're not in a household.")) seen = true;
      });
      obs.observe(document.body, { childList: true, subtree: true, characterData: true });
      const u = userEvent.setup();
      wrap();
      const panel = await openPanel(u);
      await u.type(within(panel).getByLabelText('Type The Khans to confirm'), 'The Khans');
      await u.click(within(panel).getByRole('button', { name: 'Delete household' }));
      await waitFor(() => expect(screen.getByText('SETTINGS PAGE')).toBeTruthy());
      await new Promise((r) => setTimeout(r, 20));
      obs.disconnect();
      expect(seen).toBe(false);
      expect(screen.queryByText("You're not in a household.")).toBeNull();
    });

    test('the warning describes the field, and the controls lock while deleting', async () => {
      let done!: () => void;
      m.del.mockReturnValue(new Promise<void>((r) => (done = r)));
      solo();
      const u = userEvent.setup();
      wrap();
      const panel = await openPanel(u);
      const field = within(panel).getByLabelText('Type The Khans to confirm') as HTMLInputElement;
      expect(document.getElementById(field.getAttribute('aria-describedby')!)!.textContent).toMatch(/permanently removes/);
      await u.type(field, 'The Khans');
      await u.click(within(panel).getByRole('button', { name: 'Delete household' }));
      expect(field.disabled).toBe(true);
      expect((within(panel).getByRole('button', { name: 'Export first' }) as HTMLButtonElement).disabled).toBe(true);
      done();
      await waitFor(() => expect(screen.getByText('SETTINGS PAGE')).toBeTruthy());
    });

    test('a failed delete moves focus back to the confirm field', async () => {
      m.del.mockRejectedValue(new Error('not_sole_owner'));
      solo();
      const u = userEvent.setup();
      wrap();
      const panel = await openPanel(u);
      const field = within(panel).getByLabelText('Type The Khans to confirm');
      await u.type(field, 'The Khans');
      await u.click(within(panel).getByRole('button', { name: 'Delete household' }));
      await waitFor(() => expect(within(panel).getByRole('alert')).toBeTruthy());
      await waitFor(() => expect(document.activeElement).toBe(field));
    });

    test('not_sole_owner shows calm copy and keeps the panel and household', async () => {
      m.del.mockRejectedValue(new Error('not_sole_owner'));
      solo();
      const u = userEvent.setup();
      wrap();
      const panel = await openPanel(u);
      await u.type(within(panel).getByLabelText('Type The Khans to confirm'), 'The Khans');
      await u.click(within(panel).getByRole('button', { name: 'Delete household' }));
      await waitFor(() =>
        expect(within(screen.getByRole('group', { name: /Delete The Khans/ })).getByRole('alert').textContent).toBe(
          "You can only delete a household when you're its only member.",
        ),
      );
      expect(screen.queryByText('SETTINGS PAGE')).toBeNull();
      expect(screen.getByRole('heading', { level: 1, name: 'The Khans' })).toBeTruthy();
    });
  });
});
