import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import type { Database } from './database.types';
import type { EntryRow, Status } from './totals';

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type ProfileChanges = Database['public']['Tables']['profiles']['Update'];

// Held in React Query's memory only. Nothing is written to any other cache.
export const keys = {
  profile: (userId: string) => ['profile', userId] as const,
  household: (userId: string) => ['household', userId] as const,
  invites: (userId: string) => ['invites', userId] as const,
  monthEntries: (userId: string, view: View, householdId: string | null, year: number, month: number) =>
    ['entries', userId, view, householdId, year, month] as const,
  hasBills: (userId: string, view: View, householdId: string | null) =>
    ['has-bills', userId, view, householdId] as const,
};

export type View = 'household' | 'mine';

export function useProfile(userId: string) {
  return useQuery({
    queryKey: keys.profile(userId),
    queryFn: async (): Promise<Profile> => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateProfile(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (changes: ProfileChanges) => {
      const { error } = await supabase.from('profiles').update(changes).eq('id', userId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.profile(userId) }),
  });
}

// The person's household, or null if they have none.
export function useMyHousehold(userId: string) {
  return useQuery({
    queryKey: keys.household(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('memberships')
        .select('role, households(id, name, time_zone, retention_months)')
        .eq('profile_id', userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useMyInvites(userId: string) {
  return useQuery({
    queryKey: keys.invites(userId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_invites');
      if (error) throw error;
      return data;
    },
  });
}

export function useAcceptInvite(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (inviteId: string) => {
      const { data, error } = await supabase.rpc('accept_invite', { p_invite: inviteId });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: keys.household(userId) }),
        qc.invalidateQueries({ queryKey: keys.invites(userId) }),
      ]);
    },
  });
}

const pad = (n: number) => String(n).padStart(2, '0');

// The household id of the person's membership, or null.
function householdIdOf(data: ReturnType<typeof useMyHousehold>['data']): string | null {
  return data?.households?.id ?? null;
}

/**
 * Entries due in a month for one scope. Household means the household's
 * bills; Mine means the person's own personal bills. Never mixed.
 */
export function useMonthEntries(userId: string, view: View, year: number, month: number) {
  const householdId = householdIdOf(useMyHousehold(userId).data);
  return useQuery({
    queryKey: keys.monthEntries(userId, view, householdId, year, month),
    enabled: view === 'mine' || !!householdId,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<EntryRow[]> => {
      const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
      let q = supabase
        .from('entry_view')
        .select('id, due_date, status, target_cents, paid_cents, category_id, bill_name')
        .is('archived_at', null)
        .gte('due_date', `${year}-${pad(month)}-01`)
        .lt('due_date', `${next.y}-${pad(next.m)}-01`)
        .order('due_date');
      q = view === 'household' ? q.eq('household_id', householdId ?? '') : q.eq('owner_id', userId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        dueDate: r.due_date,
        status: r.status as Status,
        targetCents: r.target_cents ?? 0,
        paidCents: r.paid_cents ?? 0,
        categoryId: r.category_id,
        billName: r.bill_name,
      }));
    },
  });
}

// Whether the person has any bills at all in this scope. The count is never shown.
// Archived bills count on purpose: someone who has had bills shouldn't see "Add your first bill".
export function useHasBills(userId: string, view: View) {
  const householdId = householdIdOf(useMyHousehold(userId).data);
  return useQuery({
    queryKey: keys.hasBills(userId, view, householdId),
    enabled: view === 'mine' || !!householdId,
    queryFn: async (): Promise<boolean> => {
      let q = supabase.from('bills').select('id', { count: 'exact', head: true });
      q = view === 'household' ? q.eq('household_id', householdId ?? '') : q.eq('owner_id', userId);
      const { count, error } = await q;
      if (error) throw error;
      return (count ?? 0) > 0;
    },
  });
}

// Remembers the last view so the app reopens on it. Takes the view to save.
export function useSetLastView(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (view: View) => {
      const { error } = await supabase.from('profiles').update({ last_view: view }).eq('id', userId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.profile(userId) }),
  });
}
