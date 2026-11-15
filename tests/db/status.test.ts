import { describe, expect, test } from 'vitest';
import { newBill, newHousehold, newUser, sql, type TestUser } from '../helpers/db.ts';

/** The same expression scope_today uses, computed in SQL. */
async function localDate(ts: string, tz: string): Promise<string> {
  const [r] = await sql`select (${ts}::timestamptz at time zone ${tz})::date::text as d`;
  return r!.d as string;
}

async function today(household: string): Promise<string> {
  const [r] = await sql`select public.scope_today(${household}::uuid, null)::text as t`;
  return r!.t as string;
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const rule = async (isCard: boolean, min: number | null, paid: number, due: string, now: string) => {
  const [r] = await sql`
    select public.status_rule(${isCard}, ${min}::bigint, ${paid}::bigint, ${due}::date, ${now}::date) s`;
  return r!.s as string;
};

/** One household entry due `offsetDays` from the household's today. */
async function setup(opts: { card?: boolean; offsetDays?: number; usualCents?: number } = {}) {
  const user = await newUser();
  const household = await newHousehold(user);
  const t = await today(household);
  const bill = await newBill(user, {
    scope: 'household',
    household,
    usualCents: opts.usualCents ?? 10000,
    categoryName: opts.card ? 'Credit card' : 'Housing',
    anchor: addDays(t, opts.offsetDays ?? 0),
    schedule: 'once',
  });
  const [e] = await sql`select id from public.entries where bill_id = ${bill.id}`;
  return { user, household, bill, entry: e!.id as string, today: t };
}

async function pay(user: TestUser, entry: string, cents: number) {
  const r = await user.client
    .from('payments')
    .insert({ entry_id: entry, amount_cents: cents, paid_on: '2027-01-01' });
  expect(r.error).toBeNull();
}

async function view(user: TestUser, entry: string) {
  const r = await user.client.from('entry_view').select().eq('id', entry).single();
  expect(r.error).toBeNull();
  return r.data!;
}

describe('entry status', () => {
  test('a regular bill is paid after any payment', async () => {
    expect(await rule(false, null, 0, '2027-03-10', '2027-03-01')).toBe('upcoming');
    expect(await rule(false, null, 1, '2027-03-10', '2027-03-01')).toBe('paid');
    expect(await rule(false, null, 1, '2027-03-10', '2027-04-01')).toBe('paid');
    expect(await rule(false, null, 0, '2027-03-10', '2027-04-01')).toBe('overdue');

    const s = await setup({ offsetDays: 3 });
    expect((await view(s.user, s.entry)).status).toBe('upcoming');
    await pay(s.user, s.entry, 100);
    const v = await view(s.user, s.entry);
    expect(v.status).toBe('paid');
    expect(v.paid_cents).toBe(100);
  });

  test('a credit card with a minimum is paid only once payments reach it', async () => {
    expect(await rule(true, 5000, 3000, '2027-03-10', '2027-03-01')).toBe('upcoming');
    expect(await rule(true, 5000, 3000, '2027-03-10', '2027-03-11')).toBe('overdue');
    expect(await rule(true, 5000, 5000, '2027-03-10', '2027-03-11')).toBe('paid');
    // A minimum is ignored for non-cards.
    expect(await rule(false, 5000, 3000, '2027-03-10', '2027-03-01')).toBe('paid');

    const s = await setup({ card: true, offsetDays: -2 });
    const [b] = await sql`select is_credit_card from public.bills where id = ${s.bill.id}`;
    expect(b!.is_credit_card).toBe(true);
    const upd = await s.user.client
      .from('entries')
      .update({ minimum_cents: 5000 })
      .eq('id', s.entry)
      .select();
    expect(upd.error).toBeNull();
    expect(upd.data).toHaveLength(1);

    await pay(s.user, s.entry, 3000);
    let v = await view(s.user, s.entry);
    expect(v.status).toBe('overdue');
    expect(v.paid_cents).toBe(3000);
    await pay(s.user, s.entry, 2000);
    v = await view(s.user, s.entry);
    expect(v.status).toBe('paid');
    expect(v.paid_cents).toBe(5000);
  });

  test('a credit card with no minimum is paid after any payment', async () => {
    expect(await rule(true, null, 0, '2027-03-10', '2027-03-01')).toBe('upcoming');
    expect(await rule(true, null, 1, '2027-03-10', '2027-03-01')).toBe('paid');

    const s = await setup({ card: true, offsetDays: 2 });
    expect((await view(s.user, s.entry)).status).toBe('upcoming');
    await pay(s.user, s.entry, 500);
    expect((await view(s.user, s.entry)).status).toBe('paid');
  });

  test('overdue starts the day after the due date in the household time zone', async () => {
    const r = (t: string) => sql`select public.status_rule(false, null, 0, '2027-03-10', ${t}) s`;
    const la = 'America/Los_Angeles';
    // US daylight time starts Mar 14, 2027, so Mar 10-11 is still PST (UTC-8).
    expect(await r(await localDate('2027-03-11T07:30:00Z', la))).toEqual([{ s: 'upcoming' }]); // 23:30 PST Mar 10
    expect(await r(await localDate('2027-03-11T08:30:00Z', la))).toEqual([{ s: 'overdue' }]); // 00:30 PST Mar 11
  });

  test('target_cents is the minimum for cards that have one, else expected', async () => {
    const card = await setup({ card: true, usualCents: 20000 });
    expect((await view(card.user, card.entry)).target_cents).toBe(20000);
    const set = await card.user.client.from('entries').update({ minimum_cents: 5000 }).eq('id', card.entry);
    expect(set.error).toBeNull();
    const cv = await view(card.user, card.entry);
    expect(cv.target_cents).toBe(5000);
    expect(cv.expected_cents).toBe(20000);

    const plain = await setup({ usualCents: 7000 });
    const pv = await view(plain.user, plain.entry);
    expect(pv.target_cents).toBe(7000);
    expect(pv.minimum_cents).toBeNull();
  });

  test("entry_view uses the household's own time zone for a real entry", async () => {
    // Kiritimati (UTC+14) is always ahead of Pago Pago (UTC-11), at every hour.
    const run = async (tz: string) => {
      const user = await newUser();
      const created = await user.client.rpc('create_household', { p_name: 'Zone', p_time_zone: tz });
      expect(created.error).toBeNull();
      const household = created.data!;
      const bill = await newBill(user, { scope: 'household', household, schedule: 'once' });
      const [e] = await sql`
        update public.entries
        set due_date = (now() at time zone 'Pacific/Pago_Pago')::date
        where bill_id = ${bill.id} returning id`;
      return (await view(user, e!.id as string)).status;
    };
    expect(await run('Pacific/Kiritimati')).toBe('overdue');
    expect(await run('Pacific/Pago_Pago')).toBe('upcoming');
  });
});
