import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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
});
