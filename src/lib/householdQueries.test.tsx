import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const m = vi.hoisted(() => ({
  ops: [] as { table: string; op: string; payload?: unknown; eq: [string, unknown][]; returning?: boolean }[],
  memberships: [] as unknown[],
  names: [] as unknown[],
  household: null as unknown,
  calls: [] as unknown[],
  rpcError: null as unknown,
  rpcCalls: [] as unknown[][],
  invoke: null as unknown,
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
      is: (c: string, v: unknown) => {
        rec.eq.push([`is:${c}`, v]);
        return chain;
      },
      gt: (c: string) => {
        rec.eq.push([`gt:${c}`, 'x']);
        return chain;
      },
      order: (c: string, o: unknown) => {
        rec.eq.push([`order:${c}`, o]);
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
    supabase: {
      from,
      rpc: (...a: unknown[]) => {
        m.rpcCalls.push(a);
        return Promise.resolve(a[0] === 'delete_household' ? { data: null, error: m.rpcError } : { data: m.names, error: null });
      },
      functions: { invoke: (...a: unknown[]) => Promise.resolve(((m.calls = [a]), m.invoke)) },
    },
  };
});

import { FunctionsHttpError, FunctionsFetchError } from '@supabase/supabase-js';
import { errorMessage } from './errors';
import { useCancelInvite, useDeleteHousehold, useInvite, useMembers, usePendingInvites, useRemoveMember, useSetRole, useUpdateHousehold } from './queries';

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
  m.rpcError = null;
  m.rpcCalls = [];
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

  test('usePendingInvites asks for open, unexpired invites of my household, newest first', async () => {
    m.memberships = [{ id: 'i1', email: 'a@test.local', expires_at: 'x' }];
    const { result } = setup(() => usePendingInvites('u1'));
    await waitFor(() => expect(result.current.data).toBeTruthy());
    const op = m.ops.find((o) => o.table === 'invites')!;
    expect(op.eq).toEqual([
      ['household_id', 'h1'],
      ['is:accepted_at', null],
      ['is:cancelled_at', null],
      ['gt:expires_at', 'x'],
      ['order:created_at', { ascending: false }],
    ]);
  });

  test('usePendingInvites stays off for a member', async () => {
    m.household = { role: 'member', households: { id: 'h1', name: 'H', time_zone: 'UTC', retention_months: 36 } };
    setup(() => usePendingInvites('u1'));
    await new Promise((r) => setTimeout(r, 50));
    expect(m.ops.some((o) => o.table === 'invites')).toBe(false);
  });

  test('useCancelInvite sets cancelled_at on that invite and refreshes invites', async () => {
    const { result, spy } = setup(() => useCancelInvite('u1'));
    await result.current.mutateAsync('i1');
    const op = m.ops.find((o) => o.op === 'update')!;
    expect(op.table).toBe('invites');
    expect(Object.keys(op.payload as object)).toEqual(['cancelled_at']);
    expect(op.eq).toEqual([['id', 'i1']]);
    expect(spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey[0])).toContain('pending-invites');
  });

  test('useCancelInvite throws no_access on zero rows', async () => {
    m.written = [];
    const { result } = setup(() => useCancelInvite('u1'));
    await expect(result.current.mutateAsync('i1')).rejects.toThrow('no_access');
  });

  test('useInvite sends the email to the function and refreshes invites', async () => {
    m.invoke = { data: { ok: true }, error: null };
    const { result, spy } = setup(() => useInvite('u1'));
    await result.current.mutateAsync('a@test.local');
    expect(m.calls).toEqual([['invite', { body: { email: 'a@test.local' } }]]);
    expect(spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey[0])).toContain('pending-invites');
  });

  test.each(['already_invited', 'too_many_invites', 'bad_email', 'forbidden', 'email_failed'])(
    'useInvite maps the function error %s',
    async (key) => {
      m.invoke = {
        data: null,
        error: new FunctionsHttpError(new Response(JSON.stringify({ error: key }), { status: 400 })),
      };
      const { result } = setup(() => useInvite('u1'));
      const err = await result.current.mutateAsync('a@test.local').catch((e: unknown) => e);
      expect((err as Error).message).toBe(key);
      expect(errorMessage(err)).not.toBe('Something went wrong. Please try again.');
    },
  );

  test('useInvite maps a gateway 401 (no error key) to the sign-in copy', async () => {
    m.invoke = {
      data: null,
      error: new FunctionsHttpError(new Response(JSON.stringify({ code: 401, message: 'Invalid JWT' }), { status: 401 })),
    };
    const { result } = setup(() => useInvite('u1'));
    const err = await result.current.mutateAsync('a@test.local').catch((e: unknown) => e);
    expect(errorMessage(err)).toBe('Please sign in again.');
  });

  test('useInvite turns a network failure into calm generic copy', async () => {
    m.invoke = { data: null, error: new FunctionsFetchError(new Error('offline')) };
    const { result } = setup(() => useInvite('u1'));
    const err = await result.current.mutateAsync('a@test.local').catch((e: unknown) => e);
    expect(errorMessage(err)).toBe("We couldn't send that invite. Please try again.");
  });

  describe('useDeleteHousehold', () => {
    const seed = (qc: QueryClient) => {
      qc.setQueryData(['entries', 'u1', 'household', 'h1', 2026, 11], [1]);
      qc.setQueryData(['members', 'u1'], [1]);
      qc.setQueryData(['pending-invites', 'u1'], [1]);
      qc.setQueryData(['household-names', 'u1'], [1]);
      qc.setQueryData(['entries', 'u2', 'household', 'h1', 2026, 11], [1]);
    };
    let onDeleted: (() => void) | undefined;
    const withClient = () => {
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      seed(qc);
      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      );
      return { qc, ...renderHook(() => useDeleteHousehold('u1', onDeleted), { wrapper }) };
    };

    test('calls delete_household and drops every household-scoped cache for this person', async () => {
      const { qc, result } = withClient();
      await result.current.mutateAsync('h1');
      expect(m.rpcCalls).toEqual([['delete_household', { p_household: 'h1' }]]);
      expect(qc.getQueryData(['entries', 'u1', 'household', 'h1', 2026, 11])).toBeUndefined();
      expect(qc.getQueryData(['members', 'u1'])).toBeUndefined();
      expect(qc.getQueryData(['pending-invites', 'u1'])).toBeUndefined();
      expect(qc.getQueryData(['household-names', 'u1'])).toBeUndefined();
      // Another person's cache is untouched.
      expect(qc.getQueryData(['entries', 'u2', 'household', 'h1', 2026, 11])).toEqual([1]);
    });

    test('runs onDeleted before any cache is dropped', async () => {
      let during: unknown;
      onDeleted = () => {
        during = qc.getQueryData(['members', 'u1']);
      };
      const { qc, result } = withClient();
      await result.current.mutateAsync('h1');
      expect(during).toEqual([1]);
      expect(qc.getQueryData(['members', 'u1'])).toBeUndefined();
      onDeleted = undefined;
    });

    test('invalidates household and profile, without waiting for the refetch', async () => {
      const { qc, result } = withClient();
      const spy = vi.spyOn(qc, 'invalidateQueries').mockReturnValue(new Promise(() => {}));
      await result.current.mutateAsync('h1'); // would hang if it awaited the refetch
      const keysDone = spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey[0]);
      expect(keysDone).toEqual(expect.arrayContaining(['household', 'profile']));
    });

    test('a failure leaves the cache untouched', async () => {
      m.rpcError = { message: 'not_sole_owner' };
      const { qc, result } = withClient();
      await expect(result.current.mutateAsync('h1')).rejects.toBeTruthy();
      expect(qc.getQueryData(['members', 'u1'])).toEqual([1]);
      expect(qc.getQueryData(['entries', 'u1', 'household', 'h1', 2026, 11])).toEqual([1]);
    });
  });
});
