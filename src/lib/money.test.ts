import { expect, test } from 'vitest';
import { formatCents, parseCents } from './money';

test.each([
  ['1980', 198000],
  ['$1,980', 198000],
  [' 1980.5 ', 198050],
  ['0.01', 1],
  ['0.29', 29],
  ['19.99', 1999],
  ['999999.99', 99999999],
  ['1,000', 100000],
  ['$5', 500],
  ['5.', null],
  ['0.50', 50],
  ['007', 700],
  ['12,345.67', 1234567],
])('parseCents(%s)', (i, o) => expect(parseCents(i)).toBe(o));

test.each([
  '',
  '0',
  '-5',
  '12.345',
  'abc',
  '1e3',
  '1,98,0',
  '1000000',
  '1,0000',
  '$ 5', // a space after the dollar sign is refused, not guessed at
  '$$5',
  '0.00',
  '.5',
  '1,000,000.00',
  '5 0',
  '00,001',
  '0,500',
  '01,000',
])('parseCents rejects %s', (i) => expect(parseCents(i)).toBeNull());

test('formatCents', () => {
  expect(formatCents(198000)).toBe('$1,980');
  expect(formatCents(198050)).toBe('$1,980.50');
  expect(formatCents(5)).toBe('$0.05');
  expect(formatCents(0)).toBe('$0');
  expect(formatCents(99999999)).toBe('$999,999.99');
  expect(formatCents(100000000)).toBe('$1,000,000');
});
