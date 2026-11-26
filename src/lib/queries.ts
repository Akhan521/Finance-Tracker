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
  entry: (userId: string, entryId: string) => ['entry', userId, entryId] as const,
  entryPayments: (userId: string, entryId: string) => ['entry-payments', userId, entryId] as const,
  bill: (userId: string, billId: string) => ['bill', userId, billId] as const,
  billHistory: (userId: string, billId: string) => ['bill-history', userId, billId] as const,
  archivedBills: (userId: string) => ['archived-bills', userId] as const,
  householdNames: (userId: string) => ['household-names', userId] as const,
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

export type EntryDetail = {
  id: string;
  billId: string;
  dueDate: string;
  status: Status;
  expectedCents: number;
  minimumCents: number | null;
  statementCents: number | null;
  paidCents: number;
  targetCents: number;
  isCreditCard: boolean;
  householdId: string | null;
  ownerId: string | null;
  billName: string;
  usualCents: number;
  payUrl: string | null;
  categoryName: string;
  categoryColor: string;
};

// One entry with what the pay sheet needs from its bill and category.
export function useEntry(userId: string, entryId: string) {
  return useQuery({
    queryKey: keys.entry(userId, entryId),
    queryFn: async (): Promise<EntryDetail> => {
      const { data: e, error } = await supabase.from('entry_view').select('*').eq('id', entryId).single();
      if (error) throw error;
      const { data: b, error: billError } = await supabase
        .from('bills')
        .select('name, usual_cents, pay_url, is_credit_card, household_id, owner_id, categories(name, color)')
        .eq('id', e.bill_id)
        .single();
      if (billError) throw billError;
      return {
        id: e.id,
        billId: e.bill_id,
        dueDate: e.due_date,
        status: (e.status ?? 'upcoming') as Status,
        expectedCents: e.expected_cents,
        minimumCents: e.minimum_cents,
        statementCents: e.statement_cents,
        paidCents: e.paid_cents ?? 0,
        targetCents: e.target_cents ?? e.expected_cents,
        isCreditCard: b.is_credit_card,
        householdId: b.household_id,
        ownerId: b.owner_id,
        billName: b.name,
        usualCents: b.usual_cents,
        payUrl: b.pay_url,
        categoryName: b.categories?.name ?? '',
        categoryColor: b.categories?.color ?? '',
      };
    },
  });
}

export type PaymentRow = { id: string; amount_cents: number; paid_on: string; paid_by: string | null };

// The payments recorded against an entry, newest first.
export function useEntryPayments(userId: string, entryId: string) {
  return useQuery({
    queryKey: keys.entryPayments(userId, entryId),
    queryFn: async (): Promise<PaymentRow[]> => {
      const { data, error } = await supabase
        .from('payments')
        .select('id, amount_cents, paid_on, paid_by')
        .eq('entry_id', entryId)
        .order('paid_on', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// Names of the household's members, for "who paid". Only fetched when needed.
export function useHouseholdNames(userId: string, enabled: boolean) {
  return useQuery({
    queryKey: keys.householdNames(userId),
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('household_names');
      if (error) throw error;
      return data ?? [];
    },
  });
}

// Every write refreshes the calendar rows and totals (the whole 'entries' prefix
// for this person) plus the entry's own entry and payments.
function refreshEntry(qc: ReturnType<typeof useQueryClient>, userId: string, entryId: string) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ['entries', userId] }),
    qc.invalidateQueries({ queryKey: keys.entry(userId, entryId) }),
    qc.invalidateQueries({ queryKey: keys.entryPayments(userId, entryId) }),
  ]);
}

// paid_by is set by the database to whoever is signed in; it is never sent.
export function useAddPayment(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { entryId: string; amountCents: number; paidOn: string }) => {
      const { error } = await supabase
        .from('payments')
        .insert({ entry_id: v.entryId, amount_cents: v.amountCents, paid_on: v.paidOn });
      if (error) throw error;
    },
    onSuccess: (_d, v) => refreshEntry(qc, userId, v.entryId),
  });
}

export function useRemovePayment(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { paymentId: string; entryId: string }) => {
      const { error } = await supabase.from('payments').delete().eq('id', v.paymentId);
      if (error) throw error;
    },
    onSuccess: (_d, v) => refreshEntry(qc, userId, v.entryId),
  });
}

// Saves this cycle's figures on a credit card entry. null clears a figure.
export function useSaveCardFigures(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { entryId: string; minimumCents: number | null; statementCents: number | null }) => {
      const { error } = await supabase
        .from('entries')
        .update({ minimum_cents: v.minimumCents, statement_cents: v.statementCents })
        .eq('id', v.entryId);
      if (error) throw error;
    },
    onSuccess: (_d, v) => refreshEntry(qc, userId, v.entryId),
  });
}

// Only the columns a client may change (not scope, the card flag or archiving,
// which has its own hooks).
export type BillPatch = Omit<
  Database['public']['Tables']['bills']['Update'],
  'id' | 'created_at' | 'household_id' | 'owner_id' | 'is_credit_card' | 'archived_at'
>;

// Every bill write refreshes the calendar, the pay sheet, the bill itself, its
// history (the triggers add rows) and the archived list.
function refreshBill(qc: ReturnType<typeof useQueryClient>, userId: string, billId: string) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ['entries', userId] }),
    qc.invalidateQueries({ queryKey: ['entry', userId] }),
    qc.invalidateQueries({ queryKey: ['has-bills', userId] }),
    qc.invalidateQueries({ queryKey: keys.bill(userId, billId) }),
    qc.invalidateQueries({ queryKey: keys.billHistory(userId, billId) }),
    qc.invalidateQueries({ queryKey: keys.archivedBills(userId) }),
  ]);
}

export function useUpdateBill(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { billId: string; patch: BillPatch }) => {
      const { error } = await supabase.from('bills').update(v.patch).eq('id', v.billId);
      if (error) throw error;
    },
    // Entries show their bill's name and usual amount, so every cached entry is refreshed.
    onSuccess: (_d, v) => refreshBill(qc, userId, v.billId),
  });
}

// Archiving and restoring send exactly one column, so history records one event.
function useSetArchived(userId: string, archivedAt: () => string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (billId: string) => {
      const { error } = await supabase.from('bills').update({ archived_at: archivedAt() }).eq('id', billId);
      if (error) throw error;
    },
    onSuccess: (_d, billId) => refreshBill(qc, userId, billId),
  });
}

export const useArchiveBill = (userId: string) => useSetArchived(userId, () => new Date().toISOString());
export const useRestoreBill = (userId: string) => useSetArchived(userId, () => null);

export type BillDetail = Database['public']['Tables']['bills']['Row'] & {
  categories: { name: string; color: string } | null;
};

// One bill with its category, or null when it doesn't exist or isn't visible.
export function useBill(userId: string, billId: string) {
  return useQuery({
    queryKey: keys.bill(userId, billId),
    queryFn: async (): Promise<BillDetail | null> => {
      const { data, error } = await supabase
        .from('bills')
        .select('*, categories(name, color)')
        .eq('id', billId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export type HistoryRow = Database['public']['Tables']['history']['Row'];

// A bill's history, newest first.
export function useBillHistory(userId: string, billId: string) {
  return useQuery({
    queryKey: keys.billHistory(userId, billId),
    queryFn: async (): Promise<HistoryRow[]> => {
      const { data, error } = await supabase
        .from('history')
        .select('*')
        .eq('bill_id', billId)
        .order('id', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
}

// Every archived bill the person can see (both scopes), by name.
export function useArchivedBills(userId: string) {
  return useQuery({
    queryKey: keys.archivedBills(userId),
    queryFn: async (): Promise<BillDetail[]> => {
      const { data, error } = await supabase
        .from('bills')
        .select('*, categories(name, color)')
        .not('archived_at', 'is', null)
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export type CategoryRow = { id: string; name: string; color: string; is_credit_card: boolean };

// The categories of one scope: the household's shared ones, or the person's own.
export function useCategories(userId: string, scope: View) {
  const householdId = householdIdOf(useMyHousehold(userId).data);
  return useQuery({
    queryKey: ['categories', userId, scope, scope === 'household' ? householdId : null],
    enabled: scope === 'mine' || !!householdId,
    queryFn: async (): Promise<CategoryRow[]> => {
      let q = supabase.from('categories').select('id, name, color, is_credit_card');
      q = scope === 'household' ? q.eq('household_id', householdId ?? '') : q.eq('owner_id', userId);
      const { data, error } = await q.order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

// Inserts only the granted columns. The new row is returned so it can be selected.
// Exactly one of household_id and owner_id is ever set.
export function useCreateCategory(userId: string) {
  const qc = useQueryClient();
  const householdId = householdIdOf(useMyHousehold(userId).data);
  return useMutation({
    mutationFn: async (v: { name: string; color: string; scope: View }): Promise<CategoryRow> => {
      if (v.scope === 'household' && !householdId) throw new Error('forbidden');
      const { data, error } = await supabase
        .from('categories')
        .insert({
          household_id: v.scope === 'household' ? householdId : null,
          owner_id: v.scope === 'mine' ? userId : null,
          name: v.name,
          color: v.color,
        })
        .select('id, name, color, is_credit_card')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  });
}

// Exactly the columns a client may insert (never the card flag or archived_at).
export type NewBillInput = {
  household_id: string | null;
  owner_id: string | null;
  category_id: string;
  name: string;
  usual_cents: number;
  schedule: 'monthly' | 'weeks' | 'yearly' | 'once';
  every_weeks: number | null;
  anchor_date: string;
  nickname: string | null;
  last4: string | null;
  pay_url: string | null;
};

export function useCreateBill(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewBillInput) => {
      const { error } = await supabase.from('bills').insert(input);
      if (error) throw error;
    },
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ['entries', userId] }),
        qc.invalidateQueries({ queryKey: ['has-bills', userId] }),
      ]),
  });
}
