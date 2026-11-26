import { describe, expect, test } from 'vitest';
import { arcPath, layoutSlices } from './arcs';

const opts = { gapDeg: 2, capDeg: 7, minDeg: 4 };
const slot = (a: { slotStart: number; slotEnd: number }) => a.slotEnd - a.slotStart;

describe('layoutSlices', () => {
  test('slots add up to a full turn and follow size', () => {
    const l = layoutSlices([{ size: 300, paid: 0 }, { size: 100, paid: 0 }], opts);
    expect(l.reduce((n, a) => n + slot(a), 0)).toBeCloseTo(360, 6);
    expect(slot(l[0])).toBeCloseTo(270, 6);
    expect(l[0].slotStart).toBe(0);
    expect(l[1].slotStart).toBeCloseTo(l[0].slotEnd, 6);
  });

  test('a tiny slice still gets the minimum and the rest shrink to fit', () => {
    const l = layoutSlices([{ size: 100000, paid: 0 }, { size: 1, paid: 0 }, { size: 100000, paid: 0 }], opts);
    expect(slot(l[1])).toBeGreaterThanOrEqual(4);
    expect(l.reduce((n, a) => n + slot(a), 0)).toBeCloseTo(360, 6);
  });

  test('visible arcs leave a gap once the round caps are counted', () => {
    const l = layoutSlices([{ size: 1, paid: 0 }, { size: 1, paid: 0 }, { size: 1, paid: 0 }], opts);
    for (let i = 0; i < l.length; i++) {
      const a = l[i];
      const b = l[(i + 1) % l.length];
      const visibleEnd = a.owed!.to + opts.capDeg;
      const nextStart = b.paid ? b.paid.from : b.owed!.from;
      const gap = ((nextStart - opts.capDeg - visibleEnd + 360) % 360);
      expect(gap).toBeCloseTo(2, 6);
    }
  });

  test('splits a slice into a paid part then an owed part, omitting empty parts', () => {
    const [a, b, c] = layoutSlices(
      [{ size: 100, paid: 25 }, { size: 100, paid: 100 }, { size: 100, paid: 0 }],
      opts,
    );
    expect(a.paid && a.owed).toBeTruthy();
    expect(a.paid!.to).toBeCloseTo(a.owed!.from, 6);
    expect((a.paid!.to - a.paid!.from) / (a.owed!.to - a.paid!.from)).toBeCloseTo(0.25, 6);
    expect(b.owed).toBeNull();
    expect(b.paid).not.toBeNull();
    expect(c.paid).toBeNull();
    expect(c.owed).not.toBeNull();
  });

  test('a single slice fills the whole ring with no gap or caps', () => {
    const [a] = layoutSlices([{ size: 500, paid: 500 }], opts);
    expect(a.paid).toEqual({ from: 0, to: 360 });
    expect(a.owed).toBeNull();
  });

  test('a slice too small to hold its caps collapses to a dot', () => {
    const l = layoutSlices([{ size: 1000, paid: 0 }, { size: 1, paid: 0 }], opts);
    const dot = l[1].owed!;
    expect(dot.to - dot.from).toBeCloseTo(0, 6);
  });
});

describe('small slices', () => {
  test('with the real minimum, every drawn segment including caps stays inside its slot', () => {
    const o = { gapDeg: 2, capDeg: 6.5, minDeg: 2 * 6.5 + 2 + 3 };
    const l = layoutSlices(
      [{ size: 100000, paid: 0 }, { size: 3000, paid: 1000 }, { size: 2000, paid: 0 }, { size: 1000, paid: 1000 }, { size: 90000, paid: 0 }],
      o,
    );
    expect(l.reduce((n, a) => n + slot(a), 0)).toBeCloseTo(360, 6);
    for (const a of l) {
      expect(slot(a)).toBeGreaterThanOrEqual(o.minDeg - 1e-9);
      const start = (a.paid ?? a.owed)!.from - o.capDeg;
      const end = (a.owed ?? a.paid)!.to + o.capDeg;
      expect(start).toBeGreaterThanOrEqual(a.slotStart + o.gapDeg / 2 - 1e-9);
      expect(end).toBeLessThanOrEqual(a.slotEnd - o.gapDeg / 2 + 1e-9);
    }
  });
});

describe('arcPath', () => {
  test('a normal arc is one A command', () => {
    const d = arcPath(90, 90, 62, 0, 90);
    expect(d.match(/A/g)).toHaveLength(1);
    expect(d.startsWith('M 90 28')).toBe(true);
  });

  test('0 to 90 degrees ends at the 3 o\'clock point', () => {
    expect(arcPath(90, 90, 62, 0, 90)).toBe('M 90 28 A 62 62 0 0 1 152 90');
  });

  test('a full circle is split so the arc has distinct end points', () => {
    const d = arcPath(90, 90, 62, 0, 360);
    expect(d.match(/A/g)!.length).toBeGreaterThanOrEqual(2);
  });
});
