import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const m = vi.hoisted(() => ({
  inserts: [] as { table: string; row: unknown }[],
  membership: null as unknown,
}));

vi.mock('./supabase', () => {
  const from = (table: string) => {
    const chain: Record<string, unknown> = {
      insert: (row: unknown) => {
        m.inserts.push({ table, row });
        return chain;
      },
      select: () => chain,
      eq: () => chain,
      maybeSingle: () => Promise.resolve({ data: m.membership, error: null }),
      single: () => Promise.resolve({ data: { id: 'new', name: 'n', color: '#F7D9C4', is_credit_card: false }, error: null }),
      then: (ok: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(ok),
    };
    return chain;
  };
  return { supabase: { from } };
});

import { useCreateBill, useCreateCategory } from './queries';

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
});
