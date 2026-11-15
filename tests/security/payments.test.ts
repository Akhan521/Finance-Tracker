import { describe, expect, test } from 'vitest';
import { addMember, anonClient, newBill, newHousehold, newUser, sql } from '../helpers/db.ts';

async function entryOf(bill: string): Promise<string> {
  const [e] = await sql`select id from public.entries where bill_id = ${bill} order by due_date limit 1`;
  return e!.id as string;
}

const row = (entry: string) => ({ entry_id: entry, amount_cents: 1500, paid_on: '2027-01-01' });

describe('payments', () => {
  test("a member cannot see or add payments on another member's personal bill", async () => {
    const a = await newUser();
    const b = await newUser();
    const h = await newHousehold(a);
    await addMember(h, a, b);
    const bill = await newBill(a, { scope: 'personal' });
    const entry = await entryOf(bill.id);

    const mine = await a.client.from('payments').insert(row(entry)).select();
    expect(mine.error).toBeNull();
    expect(mine.data).toHaveLength(1);
    // Not vacuous: the owner sees it.
    expect((await a.client.from('payments').select().eq('entry_id', entry)).data).toHaveLength(1);

    const read = await b.client.from('payments').select().eq('entry_id', entry);
    expect(read.error).toBeNull();
    expect(read.data).toEqual([]);

    const ins = await b.client.from('payments').insert(row(entry));
    expect(ins.error?.code).toBe('42501');

    const [c] = await sql`select count(*)::int n from public.payments where entry_id = ${entry}`;
    expect(c!.n).toBe(1);

    const anon = await anonClient().from('payments').select();
    expect(anon.error?.code).toBe('42501');
  });

  test('paid_by is always the caller, even if the client sends someone else', async () => {
    const a = await newUser();
    const b = await newUser();
    const h = await newHousehold(a);
    await addMember(h, a, b);
    const bill = await newBill(a, { scope: 'household', household: h });
    const entry = await entryOf(bill.id);

    const bad = await a.client.from('payments').insert({ ...row(entry), paid_by: b.id });
    expect(bad.error?.code).toBe('42501');

    const ok = await a.client
      .from('payments')
      .insert({ ...row(entry), paid_on: '2027-01-02' })
      .select('paid_by')
      .single();
    expect(ok.error).toBeNull();
    expect(ok.data?.paid_by).toBe(a.id);

    const viaB = await b.client.from('payments').insert(row(entry)).select('paid_by').single();
    expect(viaB.data?.paid_by).toBe(b.id);

    // No update path.
    const upd = await a.client.from('payments').update({ amount_cents: 1 }).eq('entry_id', entry);
    expect(upd.error?.code).toBe('42501');
  });

  test('a member can undo a household payment; a stranger cannot', async () => {
    const a = await newUser();
    const b = await newUser();
    const stranger = await newUser();
    const h = await newHousehold(a);
    await addMember(h, a, b);
    const bill = await newBill(a, { scope: 'household', household: h });
    const entry = await entryOf(bill.id);
    const made = await a.client.from('payments').insert(row(entry)).select('id').single();
    const id = made.data!.id;

    const no = await stranger.client.from('payments').delete().eq('id', id).select();
    expect(no.error).toBeNull();
    expect(no.data).toEqual([]);
    const [still] = await sql`select count(*)::int n from public.payments where id = ${id}`;
    expect(still!.n).toBe(1);

    const yes = await b.client.from('payments').delete().eq('id', id).select();
    expect(yes.error).toBeNull();
    expect(yes.data).toHaveLength(1);
    const [gone] = await sql`select count(*)::int n from public.payments where id = ${id}`;
    expect(gone!.n).toBe(0);
  });

  test('entry_view hides personal entries from other members', async () => {
    const a = await newUser();
    const b = await newUser();
    const h = await newHousehold(a);
    await addMember(h, a, b);
    const bill = await newBill(a, { scope: 'personal' });
    const entry = await entryOf(bill.id);
    const shared = await newBill(a, { scope: 'household', household: h });

    expect((await a.client.from('entry_view').select().eq('id', entry)).data).toHaveLength(1);

    const read = await b.client.from('entry_view').select().eq('bill_id', bill.id);
    expect(read.error).toBeNull();
    expect(read.data).toEqual([]);
    // Household entries stay visible to b.
    expect((await b.client.from('entry_view').select().eq('bill_id', shared.id)).data!.length).toBeGreaterThan(0);

    const anon = await anonClient().from('entry_view').select();
    expect(anon.error?.code).toBe('42501');
  });

  test('a stranger and a former member cannot see, add, or delete household payments', async () => {
    const a = await newUser();
    const b = await newUser();
    const stranger = await newUser();
    const h = await newHousehold(a);
    await addMember(h, a, b);
    const bill = await newBill(a, { scope: 'household', household: h });
    const entry = await entryOf(bill.id);
    const made = await a.client.from('payments').insert(row(entry)).select('id').single();
    const id = made.data!.id;

    // Not vacuous: a current member sees it. Then b leaves for real.
    expect((await b.client.from('payments').select().eq('id', id)).data).toHaveLength(1);
    const leave = await b.client.from('memberships').delete().eq('household_id', h).eq('profile_id', b.id);
    expect(leave.error).toBeNull();
    const [m] = await sql`select count(*)::int n from public.memberships where profile_id = ${b.id}`;
    expect(m!.n).toBe(0);

    for (const who of [stranger, b]) {
      const read = await who.client.from('payments').select().eq('id', id);
      expect(read.error).toBeNull();
      expect(read.data).toEqual([]);

      const ins = await who.client.from('payments').insert(row(entry));
      expect(ins.error?.code).toBe('42501');

      const del = await who.client.from('payments').delete().eq('id', id).select();
      expect(del.error).toBeNull();
      expect(del.data).toEqual([]);
      const [c] = await sql`select count(*)::int n from public.payments where entry_id = ${entry}`;
      expect(c!.n).toBe(1);
    }
  });
});
