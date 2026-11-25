import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { EntryRow } from '../lib/totals';
import CalendarView from './CalendarView';
import Totals from './Totals';

const row = (id: string, dueDate: string, status: EntryRow['status'], target: number, paid: number): EntryRow => ({
  id, dueDate, status, targetCents: target, paidCents: paid, categoryId: 'c', billName: `Bill ${id}`,
});

// Paid $120 total, overdue owes $30, upcoming owes $70.
const rows: EntryRow[] = [
  row('a', '2026-10-05', 'paid', 11500, 11500),
  row('b', '2026-10-05', 'overdue', 3000, 0),
  row('c', '2026-10-12', 'upcoming', 7000, 0),
  row('d', '2026-10-20', 'paid', 500, 500),
];

const view = (props: Partial<Parameters<typeof CalendarView>[0]> = {}) =>
  render(
    <MemoryRouter>
      <CalendarView year={2026} month={10} today="2026-10-21" entries={rows} onSelectDay={vi.fn()} {...props} />
    </MemoryRouter>,
  );

afterEach(cleanup);

describe('CalendarView', () => {
  test('a day with paid and overdue entries is filled overdue', () => {
    view();
    const day = screen.getByRole('button', { name: 'October 5, overdue' });
    expect(day.className).toContain('status-overdue');
    expect(screen.getByRole('button', { name: 'October 12, upcoming' }).className).toContain('status-upcoming');
    expect(screen.getByRole('button', { name: 'October 20, paid' }).className).toContain('status-paid');
  });

  test('today is outlined, even with no entries', () => {
    const { container } = view();
    const today = container.querySelector('.day-today');
    expect(today?.textContent).toBe('21');
    expect(container.querySelectorAll('.day-today')).toHaveLength(1);
  });

  test('days without entries are not buttons', () => {
    view();
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  test('tapping a day reports its date', async () => {
    const onSelectDay = vi.fn();
    view({ onSelectDay });
    await userEvent.setup().click(screen.getByRole('button', { name: 'October 12, upcoming' }));
    expect(onSelectDay).toHaveBeenCalledWith('2026-10-12');
  });

  test('no bill count appears in text, aria-labels, or titles', () => {
    const { container } = render(
      <MemoryRouter>
        <CalendarView year={2026} month={10} today="2026-10-21" entries={rows} onSelectDay={vi.fn()} />
        <Totals entries={rows} />
      </MemoryRouter>,
    );
    const texts = [container.textContent ?? ''];
    for (const el of container.querySelectorAll('[aria-label]')) texts.push(el.getAttribute('aria-label') ?? '');
    for (const el of container.querySelectorAll('[title]')) texts.push(el.getAttribute('title') ?? '');
    for (const t of texts) expect(t).not.toMatch(/\b\d+ bills?\b/i);
    for (const el of container.querySelectorAll('[aria-label]'))
      expect(el.getAttribute('aria-label')).not.toMatch(/\d+\s*(bill|due|entr)/i);
    expect(container.querySelectorAll('[title]')).toHaveLength(0);
  });

  test('says nothing is due under a still-visible grid', () => {
    const { container } = view({ entries: [] });
    expect(screen.getByText('Nothing due this month.')).toBeTruthy();
    expect(container.querySelectorAll('.day').length).toBe(31);
  });

  test('stays quiet about it when entries exist', () => {
    view();
    expect(screen.queryByText('Nothing due this month.')).toBeNull();
  });
});

describe('Totals', () => {
  test('shows paid, overdue and left, each exactly once', () => {
    const { container } = render(<Totals entries={rows} />);
    const text = (container.textContent ?? '').replace(/\s+/g, ' ');
    for (const t of ['$120 paid', '$30 overdue', '$70 left']) expect(text.split(t)).toHaveLength(2);
  });
});
