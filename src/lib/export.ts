import type { ExportRow } from './csv';
import { centsToDecimal } from './money';
import { supabase } from './supabase';
import type { Status } from './totals';

const PAGE = 1000; // matches the API's max_rows; we never rely on its silent cap

/** Read every row of a query, one page at a time, until a short page. */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

/**
 * Everything the person can see (RLS scopes it to their personal bills and
 * their current household), one row per payment, or one row with empty
 * payment columns for an entry nobody has paid. Archived bills are included.
 * Entries due after `through` (an ISO date, the end of this month) are left out
 * unless they have a payment, since a pre-payment is a real record.
 * Only the columns below are read, so last4, pay link, nickname and ids
 * can never reach the file.
 */
export async function buildExportRows(userId: string, through: string): Promise<ExportRow[]> {
  const [entries, categories, payments, names, me] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from('entry_view')
        .select('id, due_date, bill_name, household_id, category_id, status, target_cents, expected_cents')
        .or(`due_date.lte.${through},paid_cents.gt.0`)
        .order('due_date')
        .order('id')
        .range(from, to),
    ),
    fetchAll((from, to) => supabase.from('categories').select('id, name').order('id').range(from, to)),
    fetchAll((from, to) =>
      supabase
        .from('payments')
        .select('entry_id, amount_cents, paid_on, paid_by')
        .order('paid_on')
        .order('id')
        .range(from, to),
    ),
    supabase.rpc('household_names'),
    supabase.from('profiles').select('display_name').eq('id', userId).single(),
  ]);
  if (names.error) throw names.error;
  if (me.error) throw me.error;

  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const payer = new Map((names.data ?? []).map((n) => [n.profile_id, n.display_name]));
  if (me.data?.display_name) payer.set(userId, me.data.display_name);
  const byEntry = new Map<string, typeof payments>();
  for (const p of payments) {
    const list = byEntry.get(p.entry_id);
    if (list) list.push(p);
    else byEntry.set(p.entry_id, [p]);
  }

  const rows: ExportRow[] = [];
  for (const e of entries) {
    const base = {
      bill: e.bill_name,
      scope: e.household_id ? ('Household' as const) : ('Mine' as const),
      category: categoryName.get(e.category_id) ?? '',
      dueDate: e.due_date,
      status: (e.status ?? 'upcoming') as Status,
      expected: centsToDecimal(e.target_cents ?? e.expected_cents),
    };
    const paid = byEntry.get(e.id) ?? [];
    if (paid.length === 0) {
      rows.push({ ...base, paymentAmount: '', paidOn: '', paidBy: '' });
    }
    for (const p of paid) {
      rows.push({
        ...base,
        paymentAmount: centsToDecimal(p.amount_cents),
        paidOn: p.paid_on,
        paidBy: (p.paid_by && payer.get(p.paid_by)) || 'Former member',
      });
    }
  }
  return rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.bill.localeCompare(b.bill));
}
