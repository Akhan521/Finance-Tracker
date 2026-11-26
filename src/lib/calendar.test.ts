import { describe, expect, test } from 'vitest';
import { endOfMonth, formatDay, monthGrid, todayIn } from './calendar';

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

// 2026-10-05 02:30 UTC is still Oct 4 at 7:30 pm in Los Angeles (UTC-7) and already Oct 5 in Tokyo.
test('todayIn is behind UTC for a western zone', () =>
  expect(todayIn('America/Los_Angeles', new Date('2026-10-05T02:30:00Z'))).toBe('2026-10-04'));

test('todayIn is ahead of UTC for an eastern zone', () =>
  expect(todayIn('Pacific/Auckland', new Date('2026-10-04T20:00:00Z'))).toBe('2026-10-05'));

test('todayIn matches UTC when the zone agrees', () =>
  expect(todayIn('UTC', new Date('2026-12-31T23:59:00Z'))).toBe('2026-12-31'));

test('todayIn falls back to UTC for an invalid zone', () =>
  expect(todayIn('Not/AZone', new Date('2026-10-05T02:30:00Z'))).toBe('2026-10-05'));

describe('formatDay', () => {
  test('formats in three styles without zone drift', () => {
    expect(formatDay('2026-10-18')).toBe('Sun, Oct 18');
    expect(formatDay('2026-10-18', 'long')).toBe('Sunday, October 18');
    expect(formatDay('2026-10-18', 'date')).toBe('Oct 18');
  });
});

test.each([
  ['2024-02-10', '2024-02-29'],
  ['2025-02-01', '2025-02-28'],
  ['2026-12-15', '2026-12-31'],
  ['2026-04-30', '2026-04-30'],
  ['2026-01-01', '2026-01-31'],
])('endOfMonth(%s) is %s', (iso, end) => {
  expect(endOfMonth(iso)).toBe(end);
});
