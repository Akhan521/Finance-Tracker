import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import type { EntryRow } from '../lib/totals';
import DonutView from './DonutView';

const row = (id: string, cat: string, status: EntryRow['status'], target: number, paid: number): EntryRow => ({
  id, dueDate: '2026-10-05', status, targetCents: target, paidCents: paid, categoryId: cat, billName: `Bill ${id}`,
});
const cats = new Map([
  ['house', { name: 'Housing', color: '#f7d9c4' }],
  ['util', { name: 'Utilities', color: '#fbefb5' }],
  ['net', { name: 'Internet', color: '#cdebdd' }],
]);
// Housing $2,000 fully paid. Utilities $278: paid $135, $60 overdue, $83 upcoming. Internet $100 upcoming.
const rows: EntryRow[] = [
  row('a', 'house', 'paid', 200000, 200000),
  row('b', 'util', 'paid', 13500, 13500),
  row('c', 'util', 'overdue', 6000, 0),
  row('d', 'util', 'upcoming', 8300, 0),
  row('e', 'net', 'upcoming', 10000, 0),
];

afterEach(cleanup);
const view = (r: EntryRow[] = rows, c = cats) => render(<DonutView rows={r} categories={c} />);
const items = () => screen.getAllByRole('listitem');

describe('DonutView', () => {
  test('the center reads "$X left of $Y"', () => {
    view();
    expect(screen.getByText('$243')).toBeTruthy();
    expect(screen.getByText('left of $2,378')).toBeTruthy();
  });

  test('one legend row per category, in size order, with the paid or owed form', () => {
    view();
    const li = items();
    expect(li).toHaveLength(3);
    expect(li[0].textContent).toContain('Housing');
    expect(li[0].textContent).toContain('$2,000 · paid');
    expect(li[1].textContent).toContain('Utilities');
    expect(li[1].textContent).toContain('$60 overdue');
    expect(li[1].textContent).toContain('$143 of $278 left');
    expect(li[2].textContent).toContain('Internet');
    expect(li[2].textContent).not.toContain('overdue');
    expect(li[2].textContent).toContain('$100 of $100 left');
  });

  test('each slice has one solid path and one pale path', () => {
    const { container } = view();
    expect(container.querySelectorAll('path[data-part="paid"]')).toHaveLength(2); // Housing, Utilities
    expect(container.querySelectorAll('path[data-part="owed"]')).toHaveLength(2); // Utilities, Internet
    const utilPaid = container.querySelector('path[data-category="util"][data-part="paid"]')!;
    const utilOwed = container.querySelector('path[data-category="util"][data-part="owed"]')!;
    expect(utilPaid.getAttribute('stroke-opacity')).toBeNull();
    expect(utilPaid.getAttribute('stroke')).not.toBe('#fbefb5');
    expect(utilOwed.getAttribute('stroke')).toBe('#fbefb5');
    expect(utilOwed.getAttribute('stroke-opacity')).toBeNull();
    expect(utilPaid.getAttribute('stroke-linecap')).toBe('round');
    expect(utilPaid.getAttribute('fill')).toBe('none');
  });

  test('when everything owed is overdue, only the overdue amount shows', () => {
    view([row('a', 'net', 'overdue', 8600, 0)]);
    const text = items()[0].textContent!;
    expect(text).toContain('$86 overdue');
    expect(text).not.toContain('left');
  });

  test('a fully paid slice has no pale path', () => {
    const { container } = view();
    expect(container.querySelector('path[data-category="house"][data-part="owed"]')).toBeNull();
    expect(container.querySelector('path[data-category="house"][data-part="paid"]')).not.toBeNull();
  });

  test('a tiny slice still renders', () => {
    const { container } = view([row('a', 'house', 'paid', 10000000, 10000000), row('b', 'net', 'upcoming', 1, 0)]);
    expect(container.querySelector('path[data-category="net"]')).not.toBeNull();
    expect(items()).toHaveLength(2);
  });

  test('a single category fills the ring', () => {
    const { container } = view([row('a', 'house', 'paid', 5000, 5000)]);
    const p = container.querySelector('path[data-category="house"][data-part="paid"]')!;
    expect(p.getAttribute('d')).toMatch(/A.*A/);
    expect(p.getAttribute('d')).not.toContain('NaN');
    expect(items()).toHaveLength(1);
  });

  test('a long amount in the center gets a smaller size class', () => {
    const { container } = view([row('a', 'house', 'upcoming', 123456789, 0)]);
    expect(container.querySelector('.donut-center b')!.className).toBe('donut-sm');
    cleanup();
    const small = view([row('a', 'house', 'upcoming', 5000, 0)]);
    expect(small.container.querySelector('.donut-center b')!.className).toBe('donut-lg');
  });

  test('the ring is hidden from assistive tech and the legend is a list', () => {
    const { container } = view();
    expect(container.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByRole('list')).toBeTruthy();
  });

  test('shows no counts anywhere', () => {
    const { container } = view();
    expect(container.textContent).not.toMatch(/\b\d+ (bills?|items?|entries)\b/i);
    expect(container.innerHTML).not.toMatch(/title=|aria-label="[^"]*\d+ bill/i);
  });

  test('an empty month says so quietly and draws no ring', () => {
    const { container } = view([]);
    expect(screen.getByText('Nothing due this month.')).toBeTruthy();
    expect(container.querySelector('svg')).toBeNull();
  });

  test('unknown categories fall back to Other', () => {
    view(rows, new Map());
    expect(within(screen.getByRole('list')).getAllByText('Other').length).toBeGreaterThan(0);
  });
});
