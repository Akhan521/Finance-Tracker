import { beforeEach, describe, expect, test, vi } from 'vitest';

type Row = Record<string, unknown>;
const m = vi.hoisted(() => ({
  data: {} as Record<string, Row[]>,
  ranges: [] as { table: string; from: number; to: number }[],
  names: [] as Row[],
  error: null as unknown,
  errorFrom: null as number | null,
  selects: [] as { table: string; sel: string }[],
  orders: [] as { table: string; col: string }[],
  ors: [] as string[],
}));

vi.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => {
      const chain: Record<string, unknown> = {
        select: (sel: string) => {
          m.selects.push({ table, sel });
          return chain;
        },
        order: (col: string) => {
          m.orders.push({ table, col });
          return chain;
        },
        or: (arg: string) => {
          m.ors.push(arg);
          return chain;
        },
        eq: () => chain,
        single: () => Promise.resolve({ data: m.data[table]?.[0] ?? null, error: m.error }),
        range: (from: number, to: number) => {
          m.ranges.push({ table, from, to });
          const failing = m.errorFrom !== null && from >= m.errorFrom;
          return Promise.resolve({
            data: failing ? null : (m.data[table] ?? []).slice(from, to + 1),
            error: failing || (m.errorFrom === null && m.error) ? (m.error ?? new Error('page failed')) : null,
          });
        },
      };
      return chain;
    },
    rpc: () => Promise.resolve({ data: m.names, error: m.error }),
  },
}));

import { buildExportRows } from './export';

const entry = (id: string, due: string, bill: string, scope: 'h' | 'm' = 'h', extra: Row = {}): Row => ({
  id, bill_id: `b-${bill}`, due_date: due, bill_name: bill, category_id: 'c1',
  household_id: scope === 'h' ? 'h1' : null, owner_id: scope === 'm' ? 'u1' : null,
  status: 'upcoming', target_cents: 198000, expected_cents: 198000,
  last4: '1234', pay_url: 'https://pay.example', nickname: 'Secret', ...extra,
});

beforeEach(() => {
  m.ranges = [];
  m.errorFrom = null;
  m.selects = [];
  m.orders = [];
  m.ors = [];
  m.error = null;
  m.names = [{ profile_id: 'u2', display_name: 'Dad' }];
  m.data = {
    profiles: [{ display_name: 'Mom' }],
    categories: [{ id: 'c1', name: 'Housing' }],
    entry_view: [],
    payments: [],
  };
});

describe('buildExportRows', () => {
  test('one row per payment, an empty-payment row, names, and amounts as decimals', async () => {
    m.data.entry_view = [entry('e1', '2026-10-01', 'Rent'), entry('e2', '2026-10-05', 'Gym', 'm')];
    m.data.payments = [
      { entry_id: 'e1', amount_cents: 100000, paid_on: '2026-10-01', paid_by: 'u2' },
      { entry_id: 'e1', amount_cents: 98000, paid_on: '2026-10-02', paid_by: 'u1' },
    ];
    const rows = await buildExportRows('u1', '2026-10-31');
    expect(rows).toEqual([
      { bill: 'Rent', scope: 'Household', category: 'Housing', dueDate: '2026-10-01', status: 'upcoming', expected: '1980.00', paymentAmount: '1000.00', paidOn: '2026-10-01', paidBy: 'Dad' },
      { bill: 'Rent', scope: 'Household', category: 'Housing', dueDate: '2026-10-01', status: 'upcoming', expected: '1980.00', paymentAmount: '980.00', paidOn: '2026-10-02', paidBy: 'Mom' },
      { bill: 'Gym', scope: 'Mine', category: 'Housing', dueDate: '2026-10-05', status: 'upcoming', expected: '1980.00', paymentAmount: '', paidOn: '', paidBy: '' },
    ]);
  });

  test('a null or unknown payer is Former member', async () => {
    m.data.entry_view = [entry('e1', '2026-10-01', 'Rent')];
    m.data.payments = [
      { entry_id: 'e1', amount_cents: 100, paid_on: '2026-10-01', paid_by: null },
      { entry_id: 'e1', amount_cents: 200, paid_on: '2026-10-02', paid_by: 'gone' },
    ];
    const rows = await buildExportRows('u1', '2026-10-31');
    expect(rows.map((r) => r.paidBy)).toEqual(['Former member', 'Former member']);
  });

  test('sorts by due date then bill name', async () => {
    m.data.entry_view = [entry('e1', '2026-10-05', 'B'), entry('e2', '2026-10-01', 'Z'), entry('e3', '2026-10-05', 'A')];
    const rows = await buildExportRows('u1', '2026-10-31');
    expect(rows.map((r) => r.bill)).toEqual(['Z', 'A', 'B']);
  });

  test('never includes last4, pay_url, nickname or ids', async () => {
    m.data.entry_view = [entry('e1', '2026-10-01', 'Rent')];
    m.data.payments = [{ entry_id: 'e1', amount_cents: 100, paid_on: '2026-10-01', paid_by: 'u1' }];
    const text = JSON.stringify(await buildExportRows('u1', '2026-10-31'));
    expect(text).not.toMatch(/1234|pay\.example|Secret|e1|b-Rent|u1|h1/);
  });

  test('pages every select and joins the pages', async () => {
    m.data.entry_view = Array.from({ length: 1001 }, (_, i) =>
      entry(`e${i}`, '2026-10-01', `Bill ${String(i).padStart(4, '0')}`),
    );
    const rows = await buildExportRows('u1', '2026-10-31');
    expect(rows).toHaveLength(1001);
    const pages = m.ranges.filter((r) => r.table === 'entry_view');
    expect(pages).toEqual([
      { table: 'entry_view', from: 0, to: 999 },
      { table: 'entry_view', from: 1000, to: 1999 },
    ]);
  });

  test('selects only safe columns, orders every paged table by id, and cuts off by month keeping pre-payments', async () => {
    await buildExportRows('u1', '2026-10-31');
    for (const { sel } of m.selects) expect(sel).not.toMatch(/last4|pay_url|nickname|\*/);
    for (const table of ['entry_view', 'categories', 'payments']) {
      expect(m.orders).toContainEqual({ table, col: 'id' });
    }
    expect(m.ors).toEqual(['due_date.lte.2026-10-31,paid_cents.gt.0']);
  });

  test('exactly one full page makes one more, empty request and stops', async () => {
    m.data.entry_view = Array.from({ length: 1000 }, (_, i) => entry(`e${i}`, '2026-10-01', `B${i}`));
    const rows = await buildExportRows('u1', '2026-10-31');
    expect(rows).toHaveLength(1000);
    expect(m.ranges.filter((r) => r.table === 'entry_view')).toEqual([
      { table: 'entry_view', from: 0, to: 999 },
      { table: 'entry_view', from: 1000, to: 1999 },
    ]);
  });

  test('an error on page 2 rejects', async () => {
    m.data.entry_view = Array.from({ length: 1500 }, (_, i) => entry(`e${i}`, '2026-10-01', `B${i}`));
    m.errorFrom = 1000;
    await expect(buildExportRows('u1', '2026-10-31')).rejects.toBeTruthy();
  });

  test('a household member with an empty name shows Former member', async () => {
    m.names = [{ profile_id: 'u2', display_name: '' }];
    m.data.entry_view = [entry('e1', '2026-10-01', 'Rent')];
    m.data.payments = [{ entry_id: 'e1', amount_cents: 100, paid_on: '2026-10-01', paid_by: 'u2' }];
    const rows = await buildExportRows('u1', '2026-10-31');
    expect(rows[0].paidBy).toBe('Former member');
  });

  test('a database error throws', async () => {
    m.error = new Error('boom');
    await expect(buildExportRows('u1', '2026-10-31')).rejects.toThrow('boom');
  });
});
