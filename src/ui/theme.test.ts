/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

// Read as plain text: Vitest's CSS handling empties a `?raw` css import.
const css = readFileSync(join(import.meta.dirname, 'theme.css'), 'utf8');

// Tokens are read from theme.css itself, so this test cannot drift from it.
function token(name: string): string {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\b`));
  if (!m) throw new Error(`--${name} not found in theme.css`);
  return m[1];
}

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

const FILLS = [
  'cream', 'surface',
  'sage', 'sage-pale', 'rose', 'rose-pale', 'butter', 'butter-pale',
  'cat-housing', 'cat-car', 'cat-utilities', 'cat-insurance', 'cat-credit-card', 'cat-internet-phone',
];

describe('theme contrast (WCAG AA 4.5:1 for text)', () => {
  test('the luminance function is right', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
  });

  test('every expected token exists', () => {
    for (const n of [...FILLS, 'ink', 'muted', 'line', 'field-border', 'focus', 'danger']) expect(() => token(n)).not.toThrow();
  });

  test('the six category colours match the seeded categories', () => {
    const expected: Record<string, string> = {
      'cat-housing': '#F7D9C4', 'cat-car': '#CFE3F7', 'cat-utilities': '#FBEFB5',
      'cat-insurance': '#D9D2F0', 'cat-credit-card': '#F5CBD6', 'cat-internet-phone': '#CDEBDD',
    };
    for (const [k, v] of Object.entries(expected)) expect(token(k).toLowerCase()).toBe(v.toLowerCase());
  });

  test.each(FILLS)('--ink on --%s', (fill) => {
    expect(contrast(token('ink'), token(fill))).toBeGreaterThanOrEqual(4.5);
  });

  test.each(['cream', 'surface'])('--muted on --%s', (fill) => {
    expect(contrast(token('muted'), token(fill))).toBeGreaterThanOrEqual(4.5);
  });

  test('--cream on --ink (button text)', () => {
    expect(contrast(token('cream'), token('ink'))).toBeGreaterThanOrEqual(4.5);
  });

  test('--link on --cream and --surface', () => {
    for (const f of ['cream', 'surface']) expect(contrast(token('link'), token(f))).toBeGreaterThanOrEqual(4.5);
  });

  test('--danger on --cream and --surface', () => {
    for (const f of ['cream', 'surface']) expect(contrast(token('danger'), token(f))).toBeGreaterThanOrEqual(4.5);
  });

  test('--field-border (control border) is at least 3:1 on --cream', () => {
    expect(contrast(token('field-border'), token('cream'))).toBeGreaterThanOrEqual(3);
  });
});
