export type Status = 'paid' | 'overdue' | 'upcoming';

export type EntryRow = {
  id: string;
  dueDate: string;
  status: Status;
  targetCents: number;
  paidCents: number;
  categoryId: string;
  billName: string;
};

export type DonutSlice = {
  categoryId: string;
  name: string;
  color: string;
  sizeCents: number;
  paidCents: number;
  overdueCents: number;
  owedCents: number;
};

const FALLBACK = { name: 'Other', color: '#9ca3af' };
const owed = (r: EntryRow) => Math.max(r.targetCents - r.paidCents, 0);

/** The most urgent status of a day: overdue, then upcoming, then paid. */
export function dayStatus(statuses: Status[]): Status | null {
  if (statuses.includes('overdue')) return 'overdue';
  if (statuses.includes('upcoming')) return 'upcoming';
  if (statuses.includes('paid')) return 'paid';
  return null;
}

export function monthTotals(rows: EntryRow[]): { paidCents: number; overdueCents: number; leftCents: number } {
  const t = { paidCents: 0, overdueCents: 0, leftCents: 0 };
  for (const r of rows) {
    t.paidCents += r.paidCents;
    if (r.status === 'overdue') t.overdueCents += owed(r);
    else if (r.status === 'upcoming') t.leftCents += owed(r);
  }
  return t;
}

export function donutSlices(
  rows: EntryRow[],
  categories: Map<string, { name: string; color: string }>,
): DonutSlice[] {
  const by = new Map<string, DonutSlice>();
  for (const r of rows) {
    let s = by.get(r.categoryId);
    if (!s) {
      const c = categories.get(r.categoryId) ?? FALLBACK;
      s = { categoryId: r.categoryId, name: c.name, color: c.color, sizeCents: 0, paidCents: 0, overdueCents: 0, owedCents: 0 };
      by.set(r.categoryId, s);
    }
    s.sizeCents += Math.max(r.paidCents, r.targetCents);
    s.paidCents += r.paidCents;
    if (r.status === 'overdue') {
      s.overdueCents += owed(r);
      s.owedCents += owed(r);
    } else if (r.status === 'upcoming') {
      s.owedCents += owed(r);
    }
  }
  return [...by.values()]
    .filter((s) => s.sizeCents > 0)
    .sort((a, b) => b.sizeCents - a.sizeCents || a.name.localeCompare(b.name, 'en'));
}

export function donutCenter(slices: DonutSlice[]): { leftCents: number; totalCents: number } {
  return {
    leftCents: slices.reduce((n, s) => n + s.owedCents, 0),
    totalCents: slices.reduce((n, s) => n + s.sizeCents, 0),
  };
}
