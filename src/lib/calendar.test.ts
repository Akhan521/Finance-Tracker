import { expect, test } from 'vitest';
import { monthGrid } from './calendar';

test('Oct 2026 grid starts on Thursday the 1st', () =>
  expect(monthGrid(2026, 10)[0]).toEqual([null, null, null, null, '2026-10-01', '2026-10-02', '2026-10-03']));

test('every week has 7 cells and Oct 2026 ends with trailing nulls', () => {
  const g = monthGrid(2026, 10);
  expect(g.every((w) => w.length === 7)).toBe(true);
  expect(g).toHaveLength(5);
  expect(g[4]).toEqual(['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31']);
});

test('a month starting on Sunday has no leading nulls (Feb 2026, 4 rows)', () => {
  const g = monthGrid(2026, 2);
  expect(g[0][0]).toBe('2026-02-01');
  expect(g).toHaveLength(4);
  expect(g[3][6]).toBe('2026-02-28');
});

test('a month starting on Saturday has six leading nulls (Aug 2026, 6 rows)', () => {
  const g = monthGrid(2026, 8);
  expect(g[0]).toEqual([null, null, null, null, null, null, '2026-08-01']);
  expect(g).toHaveLength(6);
  expect(g[5]).toEqual(['2026-08-30', '2026-08-31', null, null, null, null, null]);
});

test('February has 29 days in a leap year and 28 otherwise', () => {
  const days = (y: number) => monthGrid(y, 2).flat().filter((c) => c !== null);
  expect(days(2024)).toHaveLength(29);
  expect(days(2024).at(-1)).toBe('2024-02-29');
  expect(days(2025)).toHaveLength(28);
  expect(days(2100)).toHaveLength(28);
});

test('December and January pad month numbers', () => {
  expect(monthGrid(2026, 12).flat().filter(Boolean).at(-1)).toBe('2026-12-31');
  expect(monthGrid(2026, 1).flat().find(Boolean)).toBe('2026-01-01');
});
