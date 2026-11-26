import { describe, expect, test } from 'vitest';
import { deepen } from './deepen';

const lum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
};
const dist = (a: string, b: string) => {
  const x = parseInt(a.slice(1), 16);
  const y = parseInt(b.slice(1), 16);
  return Math.hypot(((x >> 16) & 255) - ((y >> 16) & 255), ((x >> 8) & 255) - ((y >> 8) & 255), (x & 255) - (y & 255));
};

// Seeded category colours and the mockup's deep shades.
const seeded: [string, string][] = [
  ['#f7d9c4', '#f2b98c'],
  ['#cfe3f7', '#9cc9e8'],
  ['#fbefb5', '#f5d86a'],
  ['#d9d2f0', '#b9a6e0'],
  ['#f5cbd6', '#eb9db5'],
  ['#cdebdd', '#9fd3b9'],
];

describe('deepen', () => {
  test('returns a valid #RRGGBB that is darker than the input', () => {
    for (const [light] of seeded) {
      const d = deepen(light);
      expect(d).toMatch(/^#[0-9a-f]{6}$/);
      expect(lum(d)).toBeLessThan(lum(light) - 15);
    }
  });

  test('lands near the mockup deep shades for the seeded colours', () => {
    for (const [light, deep] of seeded) expect(dist(deepen(light), deep)).toBeLessThan(30);
  });

  test('greys stay neutral, and black stays valid', () => {
    for (const grey of ['#808080', '#ffffff', '#000000', '#d0d0d0']) {
      const d = deepen(grey);
      expect(d).toMatch(/^#[0-9a-f]{6}$/);
      expect(d.slice(1, 3)).toBe(d.slice(3, 5));
      expect(d.slice(3, 5)).toBe(d.slice(5, 7));
    }
  });

  test('accepts uppercase hex', () => {
    expect(deepen('#F7D9C4')).toBe(deepen('#f7d9c4'));
  });

  test('leaves a non-hex value alone', () => {
    expect(deepen('red')).toBe('red');
  });
});
