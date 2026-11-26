import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { EntryRow } from '../lib/totals';

const m = vi.hoisted(() => ({
  profile: {} as unknown,
  household: {} as unknown,
  entries: [] as unknown[] | undefined,
  hasBills: true,
  entriesByView: {} as Record<string, unknown[] | undefined>,
  categories: undefined as unknown[] | undefined,
  categoriesError: false,
  categoryScopes: [] as string[],
  setLastView: vi.fn(),
  monthArgs: [] as unknown[][],
}));

vi.mock('../lib/supabase', () => ({ supabase: { auth: { signOut: vi.fn() } } }));
vi.mock('../lib/queries', () => ({
  useProfile: () => ({ data: m.profile }),
  useMyHousehold: () => ({ data: m.household }),
  useMonthEntries: (...args: unknown[]) => {
    m.monthArgs.push(args);
    const data = (args[1] as string) in m.entriesByView ? m.entriesByView[args[1] as string] : m.entries;
    return { data, isSuccess: !!data, isError: false };
  },
  useHasBills: () => ({ data: m.hasBills }),
  useCategories: (_u: string, scope: string) => {
    m.categoryScopes.push(scope);
    return { data: m.categoriesError ? undefined : m.categories, isError: m.categoriesError };
  },
  useSetLastView: () => ({ mutate: m.setLastView }),
}));
// Fixed "now": 2026-10-05 03:00 UTC. Los Angeles is still Oct 4, Auckland is Oct 5 (16:00).
vi.mock('../lib/calendar', async (orig) => {
  const real = await orig<typeof import('../lib/calendar')>();
  return { ...real, todayIn: (tz: string) => real.todayIn(tz, new Date('2026-10-05T03:00:00Z')) };
});

import Home from './Home';

const entry: EntryRow = {
  id: 'e', dueDate: '2026-10-04', status: 'upcoming', targetCents: 5000, paidCents: 0, categoryId: 'c', billName: 'Rent',
};
const wrap = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <Home userId="u1" />
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe('Home', () => {
  beforeEach(() => {
    m.profile = { last_view: 'household', time_zone: 'Pacific/Auckland' };
    m.household = { households: { id: 'h1', time_zone: 'America/Los_Angeles' } };
    m.entries = [entry];
    m.hasBills = true;
    m.categories = [{ id: 'c', name: 'Housing', color: '#f7d9c4', is_credit_card: false }];
    m.categoryScopes = [];
    m.entriesByView = {};
    m.categoriesError = false;
    m.monthArgs = [];
    m.setLastView.mockReset();
  });
  afterEach(cleanup);

  test('opens on the last used view and the scope\'s own today', () => {
    const { container } = wrap();
    expect(screen.getByRole('button', { name: 'Household' }).getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('.day-today')?.textContent).toBe('4');
  });

  test('Mine uses the personal time zone for today', async () => {
    const { container } = wrap();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Mine' }));
    expect(container.querySelector('.day-today')?.textContent).toBe('5');
  });

  test('the Household/Mine switch is hidden with no household, and the view is Mine', () => {
    m.household = null;
    wrap();
    expect(screen.queryByRole('button', { name: 'Household' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mine' })).toBeNull();
    expect(m.monthArgs.at(-1)?.[1]).toBe('mine');
  });

  test('switching saves the last view', async () => {
    wrap();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Mine' }));
    expect(m.setLastView).toHaveBeenCalledWith('mine');
    expect(screen.getByRole('button', { name: 'Mine' }).getAttribute('aria-pressed')).toBe('true');
  });

  test('the arrows change the month, and the year shows only off the current year', async () => {
    wrap();
    const user = userEvent.setup();
    expect(screen.getByRole('heading').textContent).toBe('October');
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByRole('heading').textContent).toBe('September');
    await user.click(screen.getByRole('button', { name: 'Next month' }));
    await user.click(screen.getByRole('button', { name: 'Next month' }));
    await user.click(screen.getByRole('button', { name: 'Next month' }));
    await user.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByRole('heading').textContent).toBe('January 2027');
    expect(m.monthArgs.at(-1)?.slice(2)).toEqual([2027, 1]);
  });

  test('the toggle swaps the calendar for the donut and hides the totals row', async () => {
    wrap();
    expect(document.querySelector('.totals')).not.toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Chart view' }));
    expect(screen.getByText('left of $50')).toBeTruthy();
    expect(screen.getByText('Housing')).toBeTruthy();
    expect(document.querySelector('.totals')).toBeNull();
    expect(screen.queryByRole('button', { name: /October 4/ })).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Calendar view' }));
    expect(document.querySelector('.totals')).not.toBeNull();
  });

  test('the donut follows Household/Mine and keeps the month arrows', async () => {
    wrap();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Chart view' }));
    expect(m.categoryScopes.at(-1)).toBe('household');
    await user.click(screen.getByRole('button', { name: 'Mine' }));
    expect(m.categoryScopes.at(-1)).toBe('mine');
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(m.monthArgs.at(-1)?.slice(1)).toEqual(['mine', 2026, 9]);
  });

  test('after a scope switch, the old scope rows never render (donut or calendar) while the new ones load', async () => {
    m.entriesByView = { mine: undefined }; // the new scope has no data yet (no stale placeholder)
    wrap();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Chart view' }));
    expect(screen.getByText('Housing')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Mine' }));
    expect(screen.queryByText('Other')).toBeNull();
    expect(screen.queryByText('Housing')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Calendar view' }));
    expect(document.querySelector('.totals')).toBeNull();
  });

  test('a categories error shows a quiet line, not grey Other slices', async () => {
    m.categoriesError = true;
    wrap();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Chart view' }));
    expect(screen.getByRole('alert').textContent).toBe("Couldn't load categories.");
    expect(screen.queryByText('Other')).toBeNull();
    expect(document.body.textContent).not.toContain('left of');
  });

  test('the donut shows nothing while the first load is pending, and a quiet line for an empty month', async () => {
    m.entries = undefined;
    wrap();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Chart view' }));
    expect(document.body.textContent).not.toContain('$0');
    expect(screen.queryByText('Nothing due this month.')).toBeNull();
    cleanup();
    m.entries = [];
    wrap();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Chart view' }));
    expect(screen.getByText('Nothing due this month.')).toBeTruthy();
  });

  test('with no bills at all, offers the first bill and shows no count', () => {
    m.hasBills = false;
    m.entries = [];
    wrap();
    expect(screen.getByRole('link', { name: 'Add your first bill' }).getAttribute('href')).toBe('/bills/new');
    expect(document.body.textContent).not.toMatch(/\b\d+ bills?\b/i);
  });

  test('links to add a bill and to settings', () => {
    wrap();
    expect(screen.getByRole('link', { name: 'Add a bill' }).getAttribute('href')).toBe('/bills/new');
    expect(screen.getByRole('link', { name: 'Settings' }).getAttribute('href')).toBe('/settings');
  });

  test('while entries load, shows no empty-month note and no zero totals', () => {
    m.entries = undefined;
    wrap();
    expect(document.body.textContent).not.toContain('Nothing due');
    expect(document.body.textContent).not.toContain('$0');
  });

  test('the previous arrow from January goes to December of the year before', async () => {
    wrap();
    const user = userEvent.setup();
    for (let i = 0; i < 9; i++) await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByRole('heading').textContent).toBe('January');
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByRole('heading').textContent).toBe('December 2025');
  });

  test('no longer renders Sign out (Settings owns it)', () => {
    wrap();
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
  });
});
