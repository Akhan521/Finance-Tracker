import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const m = vi.hoisted(() => ({
  inserts: [] as { table: string; row: unknown }[],
  calls: [] as unknown[][],
  updates: [] as { table: string; row: unknown; id: unknown }[],
  membership: null as unknown,
}));

vi.mock('./supabase', () => {
  const from = (table: string) => {
    const chain: Record<string, unknown> = {
      insert: (row: unknown) => {
        m.inserts.push({ table, row });
        return chain;
      },
      update: (row: unknown) => {
        const u = { table, row, id: undefined as unknown };
        m.updates.push(u);
        chain.eq = (_c: string, v: unknown) => {
          u.id = v;
          return chain;
        };
        return chain;
      },
      select: (...a: unknown[]) => {
        m.calls.push(['select', table, ...a]);
        return chain;
      },
      eq: (...a: unknown[]) => {
        m.calls.push(['eq', ...a]);
        return chain;
      },
      not: (...a: unknown[]) => {
        m.calls.push(['not', ...a]);
        return chain;
      },
      order: (...a: unknown[]) => {
        m.calls.push(['order', ...a]);
        return chain;
      },
      limit: (...a: unknown[]) => {
        m.calls.push(['limit', ...a]);
        return chain;
      },
      maybeSingle: () => Promise.resolve({ data: m.membership, error: null }),
      single: () => Promise.resolve({ data: { id: 'new', name: 'n', color: '#F7D9C4', is_credit_card: false }, error: null }),
      then: (ok: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(ok),
    };
    return chain;
  };
  return { supabase: { from } };
});

import { useArchiveBill, useArchivedBills, useBillHistory, useCreateBill, useCreateCategory, useRestoreBill } from './queries';

const bill = {
  household_id: 'h1', owner_id: null, category_id: 'c', name: 'Rent', usual_cents: 100, schedule: 'monthly' as const,
  every_weeks: null, anchor_date: '2026-12-01', nickname: null, last4: null, pay_url: null,
};

function setup() {
  const qc = new QueryClient();
  const spy = vi.spyOn(qc, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, spy, wrapper };
}

describe('real inserts', () => {
  beforeEach(() => {
    m.inserts = [];
    m.updates = [];
    m.calls = [];
    m.membership = { role: 'owner', households: { id: 'h1', name: 'H', time_zone: 'UTC', retention_months: 36 } };
  });

  test('a household category sends exactly four keys, owner_id null', async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useCreateCategory('u1'), { wrapper });
    await waitFor(() => expect(result.current).toBeTruthy());
    // Wait for the household to load.
    await new Promise((r) => setTimeout(r, 20));
    await act(() => result.current.mutateAsync({ name: 'Pets', color: '#F7D9C4', scope: 'household' }));
    const row = m.inserts[0].row as Record<string, unknown>;
    expect(Object.keys(row).sort()).toEqual(['color', 'household_id', 'name', 'owner_id']);
    expect(row.household_id).toBe('h1');
    expect(row.owner_id).toBeNull();
  });

  test('a personal category sends owner_id and a null household_id', async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useCreateCategory('u1'), { wrapper });
    await act(() => result.current.mutateAsync({ name: 'Pets', color: '#F7D9C4', scope: 'mine' }));
    const row = m.inserts[0].row as Record<string, unknown>;
    expect(Object.keys(row).sort()).toEqual(['color', 'household_id', 'name', 'owner_id']);
    expect(row.household_id).toBeNull();
    expect(row.owner_id).toBe('u1');
  });

  test('a household category with no household throws and sends nothing', async () => {
    m.membership = null;
    const { wrapper } = setup();
    const { result } = renderHook(() => useCreateCategory('u1'), { wrapper });
    await expect(
      act(() => result.current.mutateAsync({ name: 'Pets', color: '#F7D9C4', scope: 'household' })),
    ).rejects.toThrow();
    expect(m.inserts).toHaveLength(0);
  });

  test('creating a category invalidates the categories prefix', async () => {
    const { spy, wrapper } = setup();
    const { result } = renderHook(() => useCreateCategory('u1'), { wrapper });
    await act(() => result.current.mutateAsync({ name: 'Pets', color: '#F7D9C4', scope: 'mine' }));
    expect(spy).toHaveBeenCalledWith({ queryKey: ['categories'] });
  });

  test('a bill insert passes the 11 keys through and refreshes entries and has-bills', async () => {
    const { spy, wrapper } = setup();
    const { result } = renderHook(() => useCreateBill('u1'), { wrapper });
    await act(() => result.current.mutateAsync(bill));
    expect(m.inserts[0].table).toBe('bills');
    expect(m.inserts[0].row).toEqual(bill);
    expect(Object.keys(m.inserts[0].row as object)).toHaveLength(11);
    expect(spy).toHaveBeenCalledWith({ queryKey: ['entries', 'u1'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['has-bills', 'u1'] });
  });

  test('archive sends exactly archived_at as an ISO time, and refreshes everything', async () => {
    const { spy, wrapper } = setup();
    const { result } = renderHook(() => useArchiveBill('u1'), { wrapper });
    await act(() => result.current.mutateAsync('b1'));
    expect(m.updates).toHaveLength(1);
    expect(m.updates[0].table).toBe('bills');
    expect(m.updates[0].id).toBe('b1');
    const row = m.updates[0].row as { archived_at: string };
    expect(Object.keys(row)).toEqual(['archived_at']);
    expect(new Date(row.archived_at).toISOString()).toBe(row.archived_at);
    for (const key of [
      ['entries', 'u1'], ['entry', 'u1'], ['has-bills', 'u1'],
      ['bill', 'u1', 'b1'], ['bill-history', 'u1', 'b1'], ['archived-bills', 'u1'],
    ]) expect(spy).toHaveBeenCalledWith({ queryKey: key });
  });

  test('restore sends exactly archived_at null', async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useRestoreBill('u1'), { wrapper });
    await act(() => result.current.mutateAsync('b1'));
    expect(m.updates[0].row).toEqual({ archived_at: null });
  });

  test('bill history is filtered to the bill, newest first, limited to 100', async () => {
    const { wrapper } = setup();
    renderHook(() => useBillHistory('u1', 'b1'), { wrapper });
    await waitFor(() => expect(m.calls.some((c) => c[0] === 'limit')).toBe(true));
    expect(m.calls).toContainEqual(['select', 'history', '*']);
    expect(m.calls).toContainEqual(['eq', 'bill_id', 'b1']);
    expect(m.calls).toContainEqual(['order', 'id', { ascending: false }]);
    expect(m.calls).toContainEqual(['limit', 100]);
  });

  test('archived bills filter on archived_at not null, by name, with no scope filter', async () => {
    const { wrapper } = setup();
    renderHook(() => useArchivedBills('u1'), { wrapper });
    await waitFor(() => expect(m.calls.some((c) => c[0] === 'order')).toBe(true));
    expect(m.calls).toContainEqual(['not', 'archived_at', 'is', null]);
    expect(m.calls).toContainEqual(['order', 'name']);
    expect(m.calls.filter((c) => c[0] === 'eq')).toEqual([]);
  });
});
