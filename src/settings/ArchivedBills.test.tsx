import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const m = vi.hoisted(() => ({ bills: [] as unknown[], restore: vi.fn() }));

vi.mock('../lib/supabase', () => ({ supabase: { auth: { signOut: vi.fn() } } }));
vi.mock('../lib/queries', () => ({
  useArchivedBills: () => ({ data: m.bills, isPending: false, isError: false }),
  useRestoreBill: () => ({ mutateAsync: m.restore }),
}));

import ArchivedBills from './ArchivedBills';

const b = (id: string, name: string, scope: 'h' | 'm') => ({
  id, name, household_id: scope === 'h' ? 'h1' : null, owner_id: scope === 'm' ? 'u1' : null,
  categories: { name: 'Utilities', color: '#fbefb5' },
});
const wrap = () =>
  render(
    <MemoryRouter>
      <ArchivedBills userId="u1" />
    </MemoryRouter>,
  );

beforeEach(() => m.restore.mockReset().mockResolvedValue(undefined));
afterEach(cleanup);

describe('ArchivedBills', () => {
  test('lists bills by scope with Restore, which clears archived_at', async () => {
    m.bills = [b('1', 'Old gym', 'h'), b('2', 'Hobby box', 'm')];
    const u = userEvent.setup();
    wrap();
    expect(screen.getByText('Household')).toBeTruthy();
    expect(screen.getByText('Just mine')).toBeTruthy();
    expect(screen.getByText('Old gym')).toBeTruthy();
    const buttons = screen.getAllByRole('button', { name: /Restore/ });
    expect(buttons).toHaveLength(2);
    await u.click(buttons[0]);
    expect(m.restore).toHaveBeenCalledWith('1');
    expect(screen.getByRole('heading', { name: 'Archived bills' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Settings/ }).getAttribute('href')).toBe('/settings');
  });

  test('renders only the non-empty sections, with no counts', () => {
    m.bills = [b('2', 'Hobby box', 'm')];
    wrap();
    expect(screen.queryByText('Household')).toBeNull();
    expect(screen.getByText('Just mine')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\(\d+\)|\b\d+ (bills?|archived)\b/i);
  });

  test('empty state', () => {
    m.bills = [];
    wrap();
    expect(screen.getByText('No archived bills.')).toBeTruthy();
  });
});
