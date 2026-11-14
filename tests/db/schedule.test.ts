import { describe, expect, test } from 'vitest';
import { addMember, newBill, newHousehold, newUser, sql } from '../helpers/db.ts';

/** Today's date for a scope, read from the database's own clock and rules. */
async function scopeToday(household: string | null, owner: string | null): Promise<string> {
  const [r] = await sql`select public.scope_today(${household}::uuid, ${owner}::uuid)::text as t`;
  return r!.t as string;
}

async function sqlDate(expr: string, base: string): Promise<string> {
  const [r] = await sql.unsafe(`select (${expr})::date::text as v`, [base]);
  return r!.v as string;
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function due(schedule: string, every: number | null, anchor: string, from: string, through: string) {
  const rows = await sql`
    select d::text from public.due_dates(${schedule}, ${every}::int, ${anchor}::date, ${from}::date, ${through}::date) d
    order by d`;
  return rows.map((r) => r.d as string);
}

async function entriesOf(bill: string) {
  const rows = await sql`
    select id, due_date::text as due_date, expected_cents::int as expected_cents, minimum_cents::int as minimum_cents
    from public.entries where bill_id = ${bill} order by due_date`;
  return rows as unknown as {
    id: string;
    due_date: string;
    expected_cents: number;
    minimum_cents: number | null;
  }[];
}

type BillOpts = Omit<NonNullable<Parameters<typeof newBill>[1]>, 'scope' | 'household' | 'anchor'>;

/**
 * A household bill whose anchor is `offsetDays` from the household's today,
 * read from the database right after the household is created.
 */
async function householdBill(opts: BillOpts & { offsetDays?: number } = {}) {
  const { offsetDays = 0, ...rest } = opts;
  const user = await newUser();
  const household = await newHousehold(user);
  const today = await scopeToday(household, null);
  const bill = await newBill(user, {
    ...rest,
    scope: 'household',
    household,
    anchor: addDays(today, offsetDays),
  });
  return { user, household, bill, today };
}

describe('due_dates', () => {
  test('monthly on the 31st falls on the last day of short months', async () => {
    expect(await due('monthly', null, '2027-01-31', '2027-01-31', '2027-04-30')).toEqual([
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
      '2027-04-30',
    ]);
  });

  test('monthly on the 29th in a leap year', async () => {
    expect(await due('monthly', null, '2028-01-29', '2028-01-29', '2028-03-29')).toEqual([
      '2028-01-29',
      '2028-02-29',
      '2028-03-29',
    ]);
    // Not a leap year: February clamps to the 28th.
    expect(await due('monthly', null, '2027-01-29', '2027-02-01', '2027-03-31')).toEqual([
      '2027-02-28',
      '2027-03-29',
    ]);
  });

  test('yearly on Feb 29 falls on Feb 28 in other years', async () => {
    expect(await due('yearly', null, '2028-02-29', '2028-01-01', '2032-12-31')).toEqual([
      '2028-02-29',
      '2029-02-28',
      '2030-02-28',
      '2031-02-28',
      '2032-02-29',
    ]);
  });

  test('every 2 weeks steps 14 days from the anchor', async () => {
    expect(await due('weeks', 2, '2027-01-04', '2027-01-04', '2027-02-15')).toEqual([
      '2027-01-04',
      '2027-01-18',
      '2027-02-01',
      '2027-02-15',
    ]);
    // A later window keeps the same rhythm, and never goes before the anchor.
    expect(await due('weeks', 2, '2027-01-04', '2027-01-20', '2027-02-14')).toEqual(['2027-02-01']);
    expect(await due('weeks', 2, '2027-01-04', '2026-12-01', '2027-01-10')).toEqual(['2027-01-04']);
  });

  test('once yields only the anchor', async () => {
    expect(await due('once', null, '2027-05-10', '2027-01-01', '2028-01-01')).toEqual(['2027-05-10']);
    expect(await due('once', null, '2027-05-10', '2027-05-11', '2028-01-01')).toEqual([]);
    expect(await due('once', null, '2027-05-10', '2027-01-01', '2027-05-09')).toEqual([]);
  });
});

describe('scope_today', () => {
  test('uses the household zone, else the owner zone, else UTC', async () => {
    const user = await newUser();
    const h = await newHousehold(user);
    await sql`update public.households set time_zone = 'Pacific/Kiritimati' where id = ${h}`;
    await sql`update public.profiles set time_zone = 'Pacific/Pago_Pago' where id = ${user.id}`;
    const [exp] = await sql`
      select (now() at time zone 'Pacific/Kiritimati')::date::text as kiri,
             (now() at time zone 'Pacific/Pago_Pago')::date::text as pago,
             (now() at time zone 'UTC')::date::text as utc`;
    // Kiritimati is a day ahead of Pago Pago at every hour.
    expect(exp!.kiri).not.toBe(exp!.pago);
    expect(await scopeToday(h, user.id)).toBe(exp!.kiri);
    expect(await scopeToday(null, user.id)).toBe(exp!.pago);
    expect(await scopeToday(null, null)).toBe(exp!.utc);
  });
});

describe('stored entries', () => {
  test('a new bill gets entries 12 months ahead and none before its due date', async () => {
    // Anchored exactly at today: the last entry must be exactly today + 12 months.
    const { bill, today } = await householdBill({ usualCents: 4321 });
    const horizon = await sqlDate(`$1::date + interval '12 months'`, today);
    const rows = await entriesOf(bill.id);
    expect(rows[0]?.due_date).toBe(today);
    expect(rows.at(-1)?.due_date).toBe(horizon);
    expect(rows).toHaveLength(13);
    expect(rows.every((r) => r.expected_cents === 4321)).toBe(true);

    // Future anchor: nothing before it.
    const later = await householdBill({ offsetDays: 3 });
    const lr = await entriesOf(later.bill.id);
    expect(lr[0]?.due_date).toBe(addDays(later.today, 3));
    expect(lr.every((r) => r.due_date >= addDays(later.today, 3))).toBe(true);

    // A personal bill uses the owner's own time zone for "today".
    const owner = await newUser();
    await sql`update public.profiles set time_zone = 'Pacific/Auckland' where id = ${owner.id}`;
    const nzToday = await scopeToday(null, owner.id);
    const personal = await newBill(owner, { scope: 'personal', anchor: nzToday });
    const nzHorizon = await sqlDate(`$1::date + interval '12 months'`, nzToday);
    const pr = await entriesOf(personal.id);
    expect(pr[0]?.due_date).toBe(nzToday);
    expect(pr.at(-1)?.due_date).toBe(nzHorizon);
  });

  test('a new bill back-fills at most one month before today', async () => {
    const user = await newUser();
    const household = await newHousehold(user);
    const today = await scopeToday(household, null);
    const floor = await sqlDate(`$1::date - interval '1 month'`, today);

    // An absurd anchor cannot create thousands of rows.
    const cat = await user.client
      .from('categories')
      .select('id')
      .eq('household_id', household)
      .eq('name', 'Housing')
      .single();
    const ins = await user.client
      .from('bills')
      .insert({
        household_id: household,
        category_id: cat.data!.id,
        name: 'Ancient weekly',
        usual_cents: 1000,
        schedule: 'weeks',
        every_weeks: 1,
        anchor_date: '0001-01-01',
      })
      .select('id')
      .single();
    expect(ins.error).toBeNull();
    const oldRows = await entriesOf(ins.data!.id);
    expect(oldRows.length).toBeGreaterThan(0);
    expect(oldRows.length).toBeLessThanOrEqual(58);
    expect(oldRows[0]!.due_date >= floor).toBe(true);

    // A just-missed bill still appears, so it shows as overdue.
    const missedDate = addDays(today, -10);
    const missed = await newBill(user, { scope: 'household', household, anchor: missedDate });
    const missedRows = await entriesOf(missed.id);
    expect(missedRows[0]?.due_date).toBe(missedDate);
  });

  test('changing the schedule replaces only untouched future entries', async () => {
    // A credit card bill, so a future entry can carry a saved minimum.
    const { user, bill, today } = await householdBill({ offsetDays: -45, categoryName: 'Credit card' });
    const before = await entriesOf(bill.id);
    const past = before.filter((r) => r.due_date < today);
    const future = before.filter((r) => r.due_date >= today);
    expect(past.length).toBeGreaterThanOrEqual(1);
    expect(future.length).toBeGreaterThanOrEqual(12);

    const touched = future[2]!;
    const save = await user.client
      .from('entries')
      .update({ minimum_cents: 2500 })
      .eq('id', touched.id)
      .select();
    expect(save.error).toBeNull();
    expect(save.data).toHaveLength(1);

    const newAnchor = addDays(today, 1);
    const upd = await user.client
      .from('bills')
      .update({ schedule: 'weeks', every_weeks: 2, anchor_date: newAnchor })
      .eq('id', bill.id)
      .select();
    expect(upd.error).toBeNull();
    expect(upd.data).toHaveLength(1);

    const after = await entriesOf(bill.id);
    const afterIds = new Set(after.map((r) => r.id));
    // Past entries survive untouched; nothing is back-filled before today.
    expect(past.every((r) => afterIds.has(r.id))).toBe(true);
    expect(after.filter((r) => r.due_date < today).map((r) => r.id).sort()).toEqual(
      past.map((r) => r.id).sort(),
    );
    // The future entry with a saved minimum survives, minimum intact.
    expect(after.find((r) => r.id === touched.id)?.minimum_cents).toBe(2500);
    // Untouched future entries are gone (new ones have new ids).
    for (const r of future) {
      if (r.id !== touched.id) expect(afterIds.has(r.id)).toBe(false);
    }
    // New entries follow the new schedule from the new anchor.
    const fresh = after.filter((r) => !past.some((p) => p.id === r.id) && r.id !== touched.id);
    expect(fresh[0]?.due_date).toBe(newAnchor);
    expect(fresh.slice(0, 3).map((r) => r.due_date)).toEqual([
      newAnchor,
      addDays(newAnchor, 14),
      addDays(newAnchor, 28),
    ]);
    // Task 6 adds the case this one cannot yet cover: a future entry with a payment survives too.
  });

  test('changing the schedule never back-fills past dates', async () => {
    // Future anchor, so there are no past entries to begin with.
    const { user, bill, today } = await householdBill({ offsetDays: 5 });
    expect((await entriesOf(bill.id)).filter((r) => r.due_date < today)).toEqual([]);

    const upd = await user.client
      .from('bills')
      .update({ schedule: 'weeks', every_weeks: 1, anchor_date: addDays(today, -30) })
      .eq('id', bill.id)
      .select();
    expect(upd.error).toBeNull();

    const after = await entriesOf(bill.id);
    expect(after.filter((r) => r.due_date < today)).toEqual([]);
    // Weekly from today - 30 lands on today + 5 first (5 weeks later), never earlier.
    expect(after[0]?.due_date).toBe(addDays(today, 5));
  });

  test('archiving removes untouched future entries; restoring brings them back from today', async () => {
    const { user, bill, today } = await householdBill({ offsetDays: -45 });
    const before = await entriesOf(bill.id);
    const past = before.filter((r) => r.due_date < today);
    const futureDates = before.filter((r) => r.due_date >= today).map((r) => r.due_date);
    expect(past.length).toBeGreaterThanOrEqual(1);
    expect(futureDates.length).toBeGreaterThanOrEqual(12);

    const arch = await user.client
      .from('bills')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', bill.id)
      .select();
    expect(arch.error).toBeNull();
    const archived = await entriesOf(bill.id);
    expect(archived.map((r) => r.id)).toEqual(past.map((r) => r.id));

    const rest = await user.client.from('bills').update({ archived_at: null }).eq('id', bill.id).select();
    expect(rest.error).toBeNull();
    const restored = await entriesOf(bill.id);
    // Past entries are not regenerated or changed; the future comes back.
    expect(restored.filter((r) => r.due_date < today).map((r) => r.id)).toEqual(past.map((r) => r.id));
    expect(restored.filter((r) => r.due_date >= today).map((r) => r.due_date)).toEqual(futureDates);
  });

  test('a new usual amount updates only future entries', async () => {
    const { user, bill, today } = await householdBill({ offsetDays: -20, usualCents: 1980 });
    const before = await entriesOf(bill.id);
    expect(before.some((r) => r.due_date < today)).toBe(true);

    const upd = await user.client.from('bills').update({ usual_cents: 2500 }).eq('id', bill.id).select();
    expect(upd.error).toBeNull();

    const after = await entriesOf(bill.id);
    expect(after.map((r) => r.id)).toEqual(before.map((r) => r.id));
    for (const r of after) {
      expect(r.expected_cents).toBe(r.due_date < today ? 1980 : 2500);
    }
    // Task 6 adds "and no payments" with a paid future entry that keeps its amount.
  });

  test('clients cannot insert or delete entries', async () => {
    const owner = await newUser();
    const stranger = await newUser();
    const h = await newHousehold(owner);
    const bill = await newBill(owner, { scope: 'household', household: h });
    const [entry] = await entriesOf(bill.id);

    // Not vacuous: the owner sees the entries; a non-member sees none.
    const own = await owner.client.from('entries').select().eq('bill_id', bill.id);
    expect(own.error).toBeNull();
    expect(own.data!.length).toBeGreaterThan(0);
    const other = await stranger.client.from('entries').select().eq('bill_id', bill.id);
    expect(other.error).toBeNull();
    expect(other.data).toEqual([]);

    const ins = await owner.client
      .from('entries')
      .insert({ bill_id: bill.id, due_date: '2040-01-01', expected_cents: 100 });
    expect(ins.error?.code).toBe('42501');

    const del = await owner.client.from('entries').delete().eq('id', entry!.id);
    expect(del.error?.code).toBe('42501');
    expect(await entriesOf(bill.id)).toContainEqual(expect.objectContaining({ id: entry!.id }));

    // A non-member cannot update another household's entry either.
    const upd = await stranger.client.from('entries').update({ statement_cents: 1 }).eq('id', entry!.id).select();
    expect(upd.error).toBeNull();
    expect(upd.data).toEqual([]);

    // The generators are internal.
    const gen = await owner.client.rpc('generate_entries', { p_bill: bill.id, p_from: '2020-01-01' });
    expect(gen.error?.code).toBe('42501');
    const ext = await owner.client.rpc('extend_entries');
    expect(ext.error?.code).toBe('42501');

    // Members of the household do see the entries.
    const member = await newUser();
    await addMember(h, owner, member);
    const seen = await member.client.from('entries').select().eq('bill_id', bill.id);
    expect(seen.data!.length).toBe(own.data!.length);
  });

  test('minimum and statement can be saved on credit card entries only', async () => {
    const user = await newUser();
    const h = await newHousehold(user);
    const card = await newBill(user, { scope: 'household', household: h, categoryName: 'Credit card' });
    const plain = await newBill(user, { scope: 'household', household: h });
    const [cardEntry] = await entriesOf(card.id);
    const [plainEntry] = await entriesOf(plain.id);

    const ok = await user.client
      .from('entries')
      .update({ minimum_cents: 3500, statement_cents: 120000 })
      .eq('id', cardEntry!.id)
      .select();
    expect(ok.error).toBeNull();
    expect(ok.data).toHaveLength(1);
    expect(ok.data![0]).toMatchObject({ minimum_cents: 3500, statement_cents: 120000 });

    const badMin = await user.client.from('entries').update({ minimum_cents: 3500 }).eq('id', plainEntry!.id).select();
    expect(badMin.error?.message).toContain('not_credit_card');
    const badStmt = await user.client.from('entries').update({ statement_cents: 3500 }).eq('id', plainEntry!.id).select();
    expect(badStmt.error?.message).toContain('not_credit_card');

    const [row] = await sql`select minimum_cents, statement_cents from public.entries where id = ${plainEntry!.id}`;
    expect(row).toMatchObject({ minimum_cents: null, statement_cents: null });
  });
});
