import { expect, test } from 'vitest';
import { dayStatus, donutCenter, donutSlices, monthTotals, type EntryRow } from './totals';

function row(over: Partial<EntryRow> = {}): EntryRow {
  return {
    id: 'e1',
    dueDate: '2026-10-05',
    status: 'upcoming',
    targetCents: 10000,
    paidCents: 0,
    categoryId: 'c1',
    billName: 'Bill',
    ...over,
  };
}

const cats = new Map([
  ['c1', { name: 'Housing', color: '#111111' }],
  ['c2', { name: 'Cards', color: '#222222' }],
]);

test('dayStatus picks the most urgent', () => {
  expect(dayStatus(['paid', 'overdue', 'upcoming'])).toBe('overdue');
  expect(dayStatus(['paid', 'upcoming'])).toBe('upcoming');
  expect(dayStatus(['paid', 'paid'])).toBe('paid');
  expect(dayStatus([])).toBeNull();
});

test('totals: paid sums payments; overdue and left sum what is still owed', () => {
  expect(
    monthTotals([
      row({ status: 'paid', targetCents: 10000, paidCents: 10000 }),
      row({ status: 'overdue', targetCents: 5000, paidCents: 2000 }), // card paid part of its minimum
      row({ status: 'upcoming', targetCents: 7000, paidCents: 0 }),
    ]),
  ).toEqual({ paidCents: 12000, overdueCents: 3000, leftCents: 7000 });
});

test('totals: overpaying never goes negative; empty is zero', () => {
  expect(monthTotals([row({ status: 'overdue', targetCents: 100, paidCents: 500 })])).toEqual({
    paidCents: 500,
    overdueCents: 0,
    leftCents: 0,
  });
  expect(monthTotals([])).toEqual({ paidCents: 0, overdueCents: 0, leftCents: 0 });
});

const mixed = [
  row({ id: 'a', categoryId: 'c1', status: 'paid', targetCents: 10000, paidCents: 12000 }),
  row({ id: 'b', categoryId: 'c1', status: 'overdue', targetCents: 5000, paidCents: 2000 }),
  row({ id: 'c', categoryId: 'c2', status: 'upcoming', targetCents: 7000, paidCents: 0 }),
];

test('donut slice size is max(paid, target) per entry; center is owed of total', () => {
  const slices = donutSlices(mixed, cats);
  expect(slices).toEqual([
    { categoryId: 'c1', name: 'Housing', color: '#111111', sizeCents: 17000, paidCents: 14000, owedCents: 3000, overdueCents: 3000 },
    { categoryId: 'c2', name: 'Cards', color: '#222222', sizeCents: 7000, paidCents: 0, owedCents: 7000, overdueCents: 0 },
  ]);
  expect(donutCenter(slices)).toEqual({ leftCents: 10000, totalCents: 24000 });
});

test('donut center left equals monthTotals overdue + left', () => {
  const t = monthTotals(mixed);
  expect(donutCenter(donutSlices(mixed, cats)).leftCents).toBe(t.overdueCents + t.leftCents);
});

test('donut keeps a category missing from the map under a neutral fallback', () => {
  const slices = donutSlices([row({ categoryId: 'gone', targetCents: 900 })], cats);
  expect(slices).toHaveLength(1);
  expect(slices[0].categoryId).toBe('gone');
  expect(slices[0].name).toBe('Other');
  expect(slices[0].color).toMatch(/^#[0-9a-f]{6}$/i);
  expect(slices[0].sizeCents).toBe(900);
});

test('donut omits zero-size slices and sorts largest first, then by name', () => {
  const c = new Map([
    ['z', { name: 'Zed', color: '#1' }],
    ['a', { name: 'Alpha', color: '#2' }],
    ['b', { name: 'Big', color: '#3' }],
    ['n', { name: 'None', color: '#4' }],
  ]);
  const slices = donutSlices(
    [
      row({ categoryId: 'z', targetCents: 500 }),
      row({ categoryId: 'a', targetCents: 500 }),
      row({ categoryId: 'b', targetCents: 900 }),
      row({ categoryId: 'n', targetCents: 0, paidCents: 0 }),
    ],
    c,
  );
  expect(slices.map((s) => s.name)).toEqual(['Big', 'Alpha', 'Zed']);
  expect(donutCenter([])).toEqual({ leftCents: 0, totalCents: 0 });
});

test('a paid row with a partial payment adds only what was paid and owes nothing', () => {
  const rows = [row({ status: 'paid', targetCents: 19800, paidCents: 5000 })];
  expect(monthTotals(rows)).toEqual({ paidCents: 5000, overdueCents: 0, leftCents: 0 });
  expect(donutSlices(rows, cats)).toEqual([
    { categoryId: 'c1', name: 'Housing', color: '#111111', sizeCents: 19800, paidCents: 5000, owedCents: 0, overdueCents: 0 },
  ]);
});
