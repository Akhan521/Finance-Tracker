import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const m = vi.hoisted(() => ({
  eqs: [] as unknown[][],
  tables: [] as string[],
  deleted: 0,
  rpc: [] as unknown[][],
  result: { error: null as unknown },
}));

vi.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => {
      m.tables.push(table);
      const chain = {
        delete: () => {
          m.deleted++;
          return chain;
        },
        eq: (...a: unknown[]) => {
          m.eqs.push(a);
          return chain;
        },
        then: (ok: (v: unknown) => unknown) => Promise.resolve(m.result).then(ok),
      };
      return chain;
    },
    rpc: (...a: unknown[]) => {
      m.rpc.push(a);
      return Promise.resolve({ data: 'new-id', error: m.result.error });
    },
  },
}));

import { useCreateHousehold, useLeaveHousehold } from './queries';

function setup() {
  const qc = new QueryClient();
  const spy = vi.spyOn(qc, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, spy, wrapper };
}

beforeEach(() => {
  m.eqs = [];
  m.tables = [];
  m.deleted = 0;
  m.rpc = [];
  m.result = { error: null };
});

const scoped = [
  ['entries', 'u1', 'household', 'h1', 2026, 1],
  ['entry', 'u1', 'e1'],
  ['entry-payments', 'u1', 'e1'],
  ['has-bills', 'u1', 'household', 'h1'],
  ['bill', 'u1', 'b1'],
  ['bill-history', 'u1', 'b1'],
  ['archived-bills', 'u1'],
  ['categories', 'u1', 'household', 'h1'],
  ['household-names', 'u1'],
];

describe('useLeaveHousehold', () => {
  test('deletes only my own membership row', async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useLeaveHousehold('u1'), { wrapper });
    await act(() => result.current.mutateAsync('h1'));
    expect(m.tables).toEqual(['memberships']);
    expect(m.deleted).toBe(1);
    expect(m.eqs).toEqual([
      ['profile_id', 'u1'],
      ['household_id', 'h1'],
    ]);
  });

  test('success removes household-scoped queries and refreshes household and profile', async () => {
    const { qc, spy, wrapper } = setup();
    for (const k of scoped) qc.setQueryData(k, 'x');
    qc.setQueryData(['entries', 'other', 'household', 'h1', 2026, 1], 'keep');
    const { result } = renderHook(() => useLeaveHousehold('u1'), { wrapper });
    await act(() => result.current.mutateAsync('h1'));
    for (const k of scoped) expect(qc.getQueryData(k)).toBeUndefined();
    expect(qc.getQueryData(['entries', 'other', 'household', 'h1', 2026, 1])).toBe('keep');
    expect(spy).toHaveBeenCalledWith({ queryKey: ['household', 'u1'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['profile', 'u1'] });
  });

  test('removal works while household-names has an active observer', async () => {
    const { qc, wrapper } = setup();
    qc.setQueryData(['household-names', 'u1'], 'x');
    const observer = renderHook(() => useQuery({ queryKey: ['household-names', 'u1'], queryFn: () => 'x', staleTime: Infinity }), { wrapper });
    const { result } = renderHook(() => useLeaveHousehold('u1'), { wrapper });
    await act(() => result.current.mutateAsync('h1'));
    expect(qc.getQueryData(['household-names', 'u1'])).toBeUndefined();
    observer.unmount();
  });

  test('a failure throws and leaves the cache alone', async () => {
    m.result = { error: new Error('last_owner') };
    const { qc, wrapper } = setup();
    for (const k of scoped) qc.setQueryData(k, 'x');
    const { result } = renderHook(() => useLeaveHousehold('u1'), { wrapper });
    await expect(act(() => result.current.mutateAsync('h1'))).rejects.toThrow('last_owner');
    for (const k of scoped) expect(qc.getQueryData(k)).toBe('x');
  });
});

describe('useCreateHousehold', () => {
  test('already_in_household refreshes household and profile', async () => {
    m.result = { error: new Error('already_in_household') };
    const { spy, wrapper } = setup();
    const { result } = renderHook(() => useCreateHousehold('u1'), { wrapper });
    await expect(act(() => result.current.mutateAsync({ name: 'Home', timeZone: 'UTC' }))).rejects.toThrow();
    expect(spy).toHaveBeenCalledWith({ queryKey: ['household', 'u1'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['profile', 'u1'] });
  });

  test('calls create_household and refreshes household data', async () => {
    const { spy, wrapper } = setup();
    const { result } = renderHook(() => useCreateHousehold('u1'), { wrapper });
    await act(() => result.current.mutateAsync({ name: 'Home', timeZone: 'America/Los_Angeles' }));
    expect(m.rpc).toEqual([['create_household', { p_name: 'Home', p_time_zone: 'America/Los_Angeles' }]]);
    const all = [
      'household', 'profile', 'entries', 'entry', 'entry-payments', 'has-bills', 'bill', 'bill-history',
      'archived-bills', 'categories', 'household-names',
    ];
    for (const key of all) {
      expect(spy).toHaveBeenCalledWith({ queryKey: [key, 'u1'] });
    }
  });
});
