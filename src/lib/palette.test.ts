/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { CATEGORY_PALETTE } from './palette';

const css = readFileSync(join(import.meta.dirname, '../ui/theme.css'), 'utf8');
const ink = css.match(/--ink:\s*(#[0-9a-fA-F]{6})\b/)?.[1] ?? '';

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('category palette', () => {
  test('has twelve uniquely named, uniquely coloured entries', () => {
    expect(CATEGORY_PALETTE).toHaveLength(12);
    expect(new Set(CATEGORY_PALETTE.map((p) => p.name)).size).toBe(12);
    expect(new Set(CATEGORY_PALETTE.map((p) => p.color)).size).toBe(12);
  });

  test('every value is an upper-case #RRGGBB the database accepts', () => {
    for (const p of CATEGORY_PALETTE) expect(p.color).toMatch(/^#[0-9A-F]{6}$/);
  });

  test.each(CATEGORY_PALETTE.map((p) => [p.name, p.color]))('--ink on %s (%s) reaches 4.5:1', (_n, color) => {
    expect(ink).not.toBe('');
    expect(contrast(ink, color)).toBeGreaterThanOrEqual(4.5);
  });
});
