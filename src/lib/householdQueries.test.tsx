import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const m = vi.hoisted(() => ({
  ops: [] as { table: string; op: string; payload?: unknown; eq: [string, unknown][]; returning?: boolean }[],
  memberships: [] as unknown[],
  names: [] as unknown[],
  household: null as unknown,
  written: [{ x: 1 }] as unknown[],
}));

vi.mock('./supabase', () => {
  const from = (table: string) => {
    const rec = { table, op: 'select', payload: undefined as unknown, eq: [] as [string, unknown][], returning: false };
    m.ops.push(rec);
    const chain: Record<string, unknown> = {
      update: (p: unknown) => {
        rec.op = 'update';
        rec.payload = p;
        return chain;
      },
      delete: () => {
        rec.op = 'delete';
        return chain;
      },
      select: () => {
        if (rec.op !== 'select') rec.returning = true;
        return chain;
      },
      eq: (c: string, v: unknown) => {
        rec.eq.push([c, v]);
        return chain;
      },
      maybeSingle: () => Promise.resolve({ data: m.household, error: null }),
      then: (ok: (v: unknown) => unknown) =>
        Promise.resolve({ data: rec.op === 'select' ? m.memberships : rec.returning ? m.written : null, error: null }).then(ok),
    };
    return chain;
  };
  return {
    supabase: { from, rpc: () => Promise.resolve({ data: m.names, error: null }) },
  };
});

import { useMembers, useRemoveMember, useSetRole, useUpdateHousehold } from './queries';

function setup<T>(hook: () => T) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const spy = vi.spyOn(qc, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { ...renderHook(hook, { wrapper }), spy };
}

beforeEach(() => {
  m.ops = [];
  m.memberships = [];
  m.names = [];
  m.written = [{ x: 1 }];
  m.household = { role: 'owner', households: { id: 'h1', name: 'H', time_zone: 'UTC', retention_months: 36 } };
});

describe('household management queries', () => {
  test('useSetRole updates only role, filtered by household and profile', async () => {
    const { result, spy } = setup(() => useSetRole('u1'));
    await result.current.mutateAsync({ householdId: 'h1', profileId: 'u2', role: 'owner' });
    const op = m.ops.find((o) => o.op === 'update')!;
    expect(op.table).toBe('memberships');
    expect(op.payload).toEqual({ role: 'owner' });
    expect(op.eq).toEqual([['household_id', 'h1'], ['profile_id', 'u2']]);
    const keysDone = spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey[0]);
    expect(keysDone).toEqual(expect.arrayContaining(['members', 'household-names', 'household']));
  });

  test('useRemoveMember deletes by household and profile', async () => {
    const { result, spy } = setup(() => useRemoveMember('u1'));
    await result.current.mutateAsync({ householdId: 'h1', profileId: 'u2' });
    const op = m.ops.find((o) => o.op === 'delete')!;
    expect(op.table).toBe('memberships');
    expect(op.eq).toEqual([['household_id', 'h1'], ['profile_id', 'u2']]);
    const keysDone = spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey[0]);
    expect(keysDone).toEqual(expect.arrayContaining(['members', 'household-names', 'household']));
  });

  test('useUpdateHousehold patches only retention_months', async () => {
    const { result, spy } = setup(() => useUpdateHousehold('u1'));
    await result.current.mutateAsync({ householdId: 'h1', retention_months: null });
    const op = m.ops.find((o) => o.op === 'update')!;
    expect(op.table).toBe('households');
    expect(op.payload).toEqual({ retention_months: null });
    expect(op.eq).toEqual([['id', 'h1']]);
    expect(spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey[0])).toContain('household');
  });

  test.each([
    ['useSetRole', () => useSetRole('u1'), { householdId: 'h1', profileId: 'u2', role: 'owner' }],
    ['useRemoveMember', () => useRemoveMember('u1'), { householdId: 'h1', profileId: 'u2' }],
    ['useUpdateHousehold', () => useUpdateHousehold('u1'), { householdId: 'h1', retention_months: 12 }],
  ] as const)('%s throws no_access when RLS filters the write to zero rows', async (_n, hook, vars) => {
    m.written = [];
    const { result, spy } = setup(hook as () => { mutateAsync: (v: unknown) => Promise<unknown> });
    await expect(result.current.mutateAsync(vars)).rejects.toThrow('no_access');
    expect(spy).not.toHaveBeenCalled();
  });

  test('useMembers joins roles with names', async () => {
    m.memberships = [
      { profile_id: 'a', role: 'member' },
      { profile_id: 'b', role: 'owner' },
      { profile_id: 'c', role: 'member' },
    ];
    m.names = [
      { profile_id: 'a', display_name: 'Zed' },
      { profile_id: 'b', display_name: 'Mo' },
      { profile_id: 'c', display_name: 'Amy' },
    ];
    const { result } = setup(() => useMembers('u1'));
    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(result.current.data).toEqual([
      { profile_id: 'a', role: 'member', display_name: 'Zed' },
      { profile_id: 'b', role: 'owner', display_name: 'Mo' },
      { profile_id: 'c', role: 'member', display_name: 'Amy' },
    ]);
    const sel = m.ops.find((o) => o.op === 'select' && o.table === 'memberships' && o.eq[0]?.[0] === 'household_id')!;
    expect(sel.eq).toEqual([['household_id', 'h1']]);
  });
});
