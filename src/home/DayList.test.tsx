import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { EntryRow } from '../lib/totals';

vi.mock('../bills/PaySheet', () => ({
  default: ({ entryId, onClose }: { entryId: string; onClose: () => void }) => (
    <div role="dialog" aria-label="pay">
      pay sheet for {entryId}
      <button onClick={onClose}>close pay</button>
    </div>
  ),
}));

import DayList from './DayList';

const row = (id: string, status: EntryRow['status'], cents: number, name: string, day = '2026-10-18'): EntryRow => ({
  id, dueDate: day, status, targetCents: cents, paidCents: 0, categoryId: 'c', billName: name,
});
const rows = [
  row('a', 'overdue', 6000, 'Water'),
  row('b', 'paid', 198000, 'Rent'),
  row('c', 'upcoming', 1250, 'Phone'),
  row('d', 'upcoming', 999, 'Other day', '2026-10-19'),
];
const show = (onClose = vi.fn()) =>
  render(<DayList userId="u1" day="2026-10-18" entries={rows} onClose={onClose} />);

afterEach(cleanup);

describe('DayList', () => {
  test('shows the date and only that day\'s bills with amount and a status word', () => {
    show();
    expect(screen.getByRole('dialog', { name: /Sunday, October 18/ })).toBeTruthy();
    expect(screen.getByText('Water')).toBeTruthy();
    expect(screen.getByText('$60')).toBeTruthy();
    expect(screen.getByText('$1,980')).toBeTruthy();
    expect(screen.getByText('overdue')).toBeTruthy();
    expect(screen.getByText('paid')).toBeTruthy();
    expect(screen.getByText('upcoming')).toBeTruthy();
    expect(screen.queryByText('Other day')).toBeNull();
  });

  test('the status span carries no global status-* class', () => {
    const { baseElement } = show();
    const span = [...baseElement.querySelectorAll('span')].find((e) => e.textContent === 'overdue') as HTMLElement;
    expect(span.className).not.toMatch(/(^|\s)status-/);
    expect(baseElement.querySelector('[class*="status-"]:not([class*="day-status-"])')).toBeNull();
  });

  test('shows no counts anywhere (text, aria-labels, titles)', () => {
    const { baseElement } = show();
    const text = baseElement.textContent ?? '';
    const labels = [...baseElement.querySelectorAll('[aria-label],[title]')]
      .map((e) => `${e.getAttribute('aria-label') ?? ''} ${e.getAttribute('title') ?? ''}`)
      .join(' ');
    expect(text.replace(/\$[\d,.]+/g, '').replace(/October 18/, '')).not.toMatch(/\d/);
    expect(labels).not.toMatch(/\d/);
    expect(`${text} ${labels}`).not.toMatch(/\b(bills?|items?|entries|due)\b.*\d|\d+\s*(bills?|items?|due)/i);
  });

  test('tapping a bill opens the pay sheet; closing it returns to the list', async () => {
    show();
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: /Water/ }));
    expect(screen.getByText(/pay sheet for a/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Rent/ })).toBeNull();
    await u.click(screen.getByRole('button', { name: 'close pay' }));
    expect(screen.queryByText(/pay sheet for/)).toBeNull();
    expect(screen.getByRole('button', { name: /Rent/ })).toBeTruthy();
  });

  test('Escape closes the list once, not while the pay sheet is on top', async () => {
    const onClose = vi.fn();
    show(onClose);
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: /Water/ }));
    await u.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    await u.click(screen.getByRole('button', { name: 'close pay' }));
    await u.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('a day with nothing due says so quietly', () => {
    render(<DayList userId="u1" day="2026-10-20" entries={rows} onClose={vi.fn()} />);
    expect(screen.getByText('Nothing due.')).toBeTruthy();
  });

  test('bill names render as text', () => {
    const { container } = render(
      <DayList userId="u1" day="2026-10-18" entries={[row('x', 'upcoming', 100, '<i>hi</i>')]} onClose={vi.fn()} />,
    );
    expect(container.querySelector('i')).toBeNull();
    expect(screen.getByText('<i>hi</i>')).toBeTruthy();
  });
});
