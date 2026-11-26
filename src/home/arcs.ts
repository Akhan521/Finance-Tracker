// Pure arc maths for the category donut. Angles are in degrees, 0 at the top,
// clockwise. Every slice owns a "slot" of the ring; its stroked arcs sit
// inside the slot, pulled in so that the gap between neighbouring slices is
// still visible after the round line caps (which stick out by capDeg).

export type SliceInput = { size: number; paid: number };
export type Span = { from: number; to: number };
export type SliceLayout = { slotStart: number; slotEnd: number; paid: Span | null; owed: Span | null };
export type LayoutOptions = {
  gapDeg: number; // visible space between two slices
  capDeg: number; // how far a round cap extends past the end of its arc
  minDeg: number; // smallest slot any slice gets
};

/** Slot sizes: proportional to size, none below minDeg, the rest scaled so the total is 360. */
function slotSizes(sizes: number[], minDeg: number): number[] {
  const n = sizes.length;
  if (n * minDeg >= 360) return sizes.map(() => 360 / n);
  const fixed = new Set<number>();
  for (;;) {
    const free = sizes.reduce((sum, s, i) => (fixed.has(i) ? sum : sum + s), 0);
    const room = 360 - fixed.size * minDeg;
    const grow = fixed.size < n && free > 0 ? room / free : 0;
    const next = sizes.findIndex((s, i) => !fixed.has(i) && s * grow < minDeg);
    if (next === -1) return sizes.map((s, i) => (fixed.has(i) ? minDeg : s * grow));
    fixed.add(next);
  }
}

export function layoutSlices(slices: SliceInput[], opts: LayoutOptions): SliceLayout[] {
  if (slices.length === 0) return [];
  const only = slices.length === 1;
  const gap = only ? 0 : opts.gapDeg;
  const cap = only ? 0 : opts.capDeg;
  const slots = slotSizes(slices.map((s) => s.size), opts.minDeg);
  let at = 0;
  return slices.map((s, i) => {
    const slotStart = at;
    const slotEnd = i === slices.length - 1 ? 360 : at + slots[i];
    at = slotEnd;
    let from = slotStart + gap / 2 + cap;
    let to = slotEnd - gap / 2 - cap;
    if (to < from) from = to = (slotStart + slotEnd) / 2; // too small for its caps: a dot
    const share = s.size > 0 ? Math.min(Math.max(s.paid / s.size, 0), 1) : 0;
    const mid = from + (to - from) * share;
    return {
      slotStart,
      slotEnd,
      paid: share > 0 ? { from, to: mid } : null,
      owed: share < 1 ? { from: mid, to } : null,
    };
  });
}

const point = (cx: number, cy: number, r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return `${round(cx + r * Math.sin(a))} ${round(cy - r * Math.cos(a))}`;
};
const round = (n: number) => Math.round(n * 100) / 100;

/** An SVG path along the circle. An arc over 180 degrees (or a full circle) is split, since one A cannot span 360. */
export function arcPath(cx: number, cy: number, r: number, from: number, to: number): string {
  // A dot is a 0.01 degree arc: it only shows because of the round line caps. A zero-length path would draw nothing.
  const end = Math.max(to, from + 0.01);
  const parts = end - from > 180 ? 2 : 1;
  let d = `M ${point(cx, cy, r, from)}`;
  for (let i = 1; i <= parts; i++) {
    d += ` A ${r} ${r} 0 0 1 ${point(cx, cy, r, from + ((end - from) * i) / parts)}`;
  }
  return d;
}
