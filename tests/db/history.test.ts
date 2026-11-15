import { randomUUID } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { addMember, newBill, newHousehold, newUser, sql, type TestUser } from '../helpers/db.ts';

type Row = {
  id: number;
  household_id: string | null;
  owner_id: string | null;
  bill_id: string | null;
  actor_id: string | null;
  kind: string;
  detail: Record<string, unknown>;
};

/** History rows the user can see for a bill, oldest first. */
async function billHistory(user: TestUser, billId: string): Promise<Row[]> {
  const { data, error } = await user.client
    .from('history')
    .select('*')
    .eq('bill_id', billId)
    .order('id');
  expect(error).toBeNull();
  return (data ?? []) as Row[];
}

/** Household-scope history the user can see, oldest first. */
async function householdHistory(user: TestUser, household: string): Promise<Row[]> {
  const { data, error } = await user.client
    .from('history')
    .select('*')
    .eq('household_id', household)
    .is('bill_id', null)
    .order('id');
  expect(error).toBeNull();
  return (data ?? []) as Row[];
}

async function entryFor(billId: string): Promise<{ id: string; due_date: string }> {
  const [e] = await sql`select id, due_date::text as due_date from public.entries
                        where bill_id = ${billId} order by due_date limit 1`;
  return e as { id: string; due_date: string };
}

describe('change history', () => {
  test('creating, editing, archiving and restoring a bill is recorded with old and new values', async () => {
    const user = await newUser();
    const household = await newHousehold(user);
    const bill = await newBill(user, { scope: 'household', household, usualCents: 198000 });

    const created = await billHistory(user, bill.id);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      kind: 'bill_created',
      detail: {},
      household_id: household,
      owner_id: null,
      bill_id: bill.id,
      actor_id: user.id,
    });

    const edit = await user.client.from('bills').update({ usual_cents: 200000 }).eq('id', bill.id);
    expect(edit.error).toBeNull();
    const rename = await user.client
      .from('bills')
      .update({ name: 'Rent', nickname: 'Home' })
      .eq('id', bill.id);
    expect(rename.error).toBeNull();

    const arch = await user.client
      .from('bills')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', bill.id);
    expect(arch.error).toBeNull();
    const rest = await user.client.from('bills').update({ archived_at: null }).eq('id', bill.id);
    expect(rest.error).toBeNull();

    const rows = await billHistory(user, bill.id);
    expect(rows.map((r) => r.kind)).toEqual([
      'bill_created',
      'bill_changed',
      'bill_changed',
      'bill_changed',
      'bill_archived',
      'bill_restored',
    ]);
    expect(rows[1]!.detail).toEqual({ field: 'usual_cents', old: 198000, new: 200000 });
    const name = rows.slice(2, 4).map((r) => r.detail);
    expect(name).toContainEqual({ field: 'name', old: 'Test bill', new: 'Rent' });
    expect(name).toContainEqual({ field: 'nickname', old: null, new: 'Home' });
    for (const r of rows) expect(r.actor_id).toBe(user.id);
  });

  test('a last4 change is recorded without the digits', async () => {
    const user = await newUser();
    const bill = await newBill(user, { scope: 'personal' });
    const a = await user.client.from('bills').update({ last4: '4821' }).eq('id', bill.id);
    expect(a.error).toBeNull();
    const b = await user.client.from('bills').update({ last4: '7390' }).eq('id', bill.id);
    expect(b.error).toBeNull();
    const c = await user.client
      .from('bills')
      .update({ pay_url: 'https://pay.example.com/secret-token' })
      .eq('id', bill.id);
    expect(c.error).toBeNull();

    const rows = (await billHistory(user, bill.id)).filter((r) => r.kind === 'bill_changed');
    expect(rows.map((r) => r.detail)).toEqual([
      { field: 'last4' },
      { field: 'last4' },
      { field: 'pay_url' },
    ]);
    const text = JSON.stringify(rows);
    for (const secret of ['4821', '7390', 'secret-token', 'pay.example.com']) {
      expect(text).not.toContain(secret);
    }
    // A no-op update (same last4) records nothing.
    const same = await user.client.from('bills').update({ last4: '7390' }).eq('id', bill.id);
    expect(same.error).toBeNull();
    expect((await billHistory(user, bill.id)).filter((r) => r.kind === 'bill_changed')).toHaveLength(3);
  });

  test('payments added and removed are recorded', async () => {
    const user = await newUser();
    const household = await newHousehold(user);
    const bill = await newBill(user, { scope: 'household', household, schedule: 'once' });
    const entry = await entryFor(bill.id);

    const ins = await user.client
      .from('payments')
      .insert({ entry_id: entry.id, amount_cents: 1980, paid_on: '2026-11-01' })
      .select('id')
      .single();
    expect(ins.error).toBeNull();
    const del = await user.client.from('payments').delete().eq('id', ins.data!.id);
    expect(del.error).toBeNull();

    const rows = (await billHistory(user, bill.id)).filter((r) => r.kind.startsWith('payment_'));
    const expected = { amount_cents: 1980, paid_on: '2026-11-01', due_date: entry.due_date };
    expect(rows.map((r) => r.kind)).toEqual(['payment_added', 'payment_removed']);
    expect(rows[0]!.detail).toEqual(expected);
    expect(rows[1]!.detail).toEqual(expected);
    for (const r of rows) {
      expect(r).toMatchObject({ actor_id: user.id, household_id: household, owner_id: null, bill_id: bill.id });
    }
  });

  test('joins, leaves, removals, invites and role changes are recorded on the household', async () => {
    const owner = await newUser();
    const household = await newHousehold(owner);
    const m1 = await newUser();
    const m2 = await newUser();

    // The creator's own membership.
    let rows = await householdHistory(owner, household);
    expect(rows.map((r) => [r.kind, r.detail])).toEqual([['member_joined', { profile_id: owner.id }]]);

    // Invite then cancel.
    const inv = await owner.client
      .from('invites')
      .insert({ household_id: household, email: ` ${m2.email.toUpperCase()} ` })
      .select('id')
      .single();
    expect(inv.error).toBeNull();
    const cancel = await owner.client
      .from('invites')
      .update({ cancelled_at: new Date().toISOString() })
      .eq('id', inv.data!.id);
    expect(cancel.error).toBeNull();

    // Join, role change, removal.
    await addMember(household, owner, m1);
    const promote = await owner.client
      .from('memberships')
      .update({ role: 'owner' })
      .eq('household_id', household)
      .eq('profile_id', m1.id);
    expect(promote.error).toBeNull();
    await addMember(household, owner, m2);
    const remove = await owner.client
      .from('memberships')
      .delete()
      .eq('household_id', household)
      .eq('profile_id', m2.id);
    expect(remove.error).toBeNull();
    // A member leaving (m1 is an owner and the other owner remains).
    const leave = await m1.client
      .from('memberships')
      .delete()
      .eq('household_id', household)
      .eq('profile_id', m1.id);
    expect(leave.error).toBeNull();

    rows = await householdHistory(owner, household);
    const simple = rows.map((r) => [r.kind, r.detail, r.actor_id]);
    expect(simple).toEqual([
      ['member_joined', { profile_id: owner.id }, owner.id],
      ['invite_sent', { email: m2.email }, owner.id],
      ['invite_cancelled', { email: m2.email }, owner.id],
      ['invite_sent', { email: m1.email }, owner.id],
      ['member_joined', { profile_id: m1.id }, m1.id],
      ['role_changed', { profile_id: m1.id, old: 'member', new: 'owner' }, owner.id],
      ['invite_sent', { email: m2.email }, owner.id],
      ['member_joined', { profile_id: m2.id }, m2.id],
      ['member_removed', { profile_id: m2.id }, owner.id],
      ['member_left', { profile_id: m1.id }, m1.id],
    ]);
    for (const r of rows) expect(r.household_id).toBe(household);
  });

  test('invite history is visible to owners only; members still see joins', async () => {
    const owner = await newUser();
    const household = await newHousehold(owner);
    const member = await newUser();
    const outsider = await newUser();
    await addMember(household, owner, member);
    const inv = await owner.client
      .from('invites')
      .insert({ household_id: household, email: outsider.email })
      .select('id')
      .single();
    expect(inv.error).toBeNull();
    const cancel = await owner.client
      .from('invites')
      .update({ cancelled_at: new Date().toISOString() })
      .eq('id', inv.data!.id);
    expect(cancel.error).toBeNull();

    const ownerKinds = (await householdHistory(owner, household)).map((r) => r.kind);
    expect(ownerKinds.filter((k) => k === 'invite_sent')).toHaveLength(2);
    expect(ownerKinds).toContain('invite_cancelled');

    const memberRows = await householdHistory(member, household);
    const kinds = memberRows.map((r) => r.kind);
    expect(kinds).not.toContain('invite_sent');
    expect(kinds).not.toContain('invite_cancelled');
    expect(kinds.filter((k) => k === 'member_joined')).toHaveLength(2);
    // The invited address appears nowhere in what the member can read.
    expect(JSON.stringify(memberRows)).not.toContain(outsider.email);

    // Direct filters cannot reach them either.
    const direct = await member.client
      .from('history')
      .select('id')
      .in('kind', ['invite_sent', 'invite_cancelled']);
    expect(direct.error).toBeNull();
    expect(direct.data).toEqual([]);
  });

  test('household history follows membership: a former member loses access', async () => {
    const owner = await newUser();
    const household = await newHousehold(owner);
    const member = await newUser();
    await addMember(household, owner, member);
    const bill = await newBill(member, { scope: 'household', household });

    expect((await billHistory(member, bill.id)).length).toBeGreaterThan(0);
    expect((await householdHistory(member, household)).length).toBeGreaterThan(0);

    const leave = await member.client
      .from('memberships')
      .delete()
      .eq('household_id', household)
      .eq('profile_id', member.id);
    expect(leave.error).toBeNull();

    expect(await billHistory(member, bill.id)).toEqual([]);
    const all = await member.client.from('history').select('id').eq('household_id', household);
    expect(all.error).toBeNull();
    expect(all.data).toEqual([]);
    // The household still sees it, including the leave.
    const still = await householdHistory(owner, household);
    expect(still.map((r) => r.kind)).toContain('member_left');
  });

  test('personal bill history is visible only to its owner', async () => {
    const alice = await newUser();
    const bob = await newUser();
    const household = await newHousehold(alice);
    await addMember(household, alice, bob);
    const bill = await newBill(alice, { scope: 'personal', schedule: 'once' });
    await alice.client.from('bills').update({ usual_cents: 5000 }).eq('id', bill.id);
    const entry = await entryFor(bill.id);
    const pay = await alice.client
      .from('payments')
      .insert({ entry_id: entry.id, amount_cents: 900, paid_on: '2026-11-01' });
    expect(pay.error).toBeNull();

    const mine = await billHistory(alice, bill.id);
    expect(mine.map((r) => r.kind)).toEqual(['bill_created', 'bill_changed', 'payment_added']);
    expect(mine[2]).toMatchObject({ owner_id: alice.id, household_id: null, actor_id: alice.id });
    for (const r of mine) {
      expect(r).toMatchObject({ owner_id: alice.id, household_id: null });
    }

    // A housemate sees nothing, by bill or by owner.
    expect(await billHistory(bob, bill.id)).toEqual([]);
    const byOwner = await bob.client.from('history').select('id').eq('owner_id', alice.id);
    expect(byOwner.error).toBeNull();
    expect(byOwner.data).toEqual([]);
    const byKind = await bob.client.from('history').select('id').eq('kind', 'payment_added');
    expect(byKind.error).toBeNull();
    expect(byKind.data).toEqual([]);
  });

  test('clients cannot write or edit history', async () => {
    const user = await newUser();
    const household = await newHousehold(user);
    const bill = await newBill(user, { scope: 'household', household });
    const [row] = await billHistory(user, bill.id);

    const ins = await user.client
      .from('history')
      .insert({ household_id: household, kind: 'bill_created', actor_id: user.id });
    expect(ins.error?.code).toBe('42501');
    const upd = await user.client.from('history').update({ kind: 'bill_archived' }).eq('id', row!.id);
    expect(upd.error?.code).toBe('42501');
    const del = await user.client.from('history').delete().eq('id', row!.id);
    expect(del.error?.code).toBe('42501');

    const after = await billHistory(user, bill.id);
    expect(after).toEqual([row]);
  });

  test('deleting a household with history leaves no orphans and does not fail', async () => {
    const owner = await newUser();
    const household = await newHousehold(owner);
    const member = await newUser();
    await addMember(household, owner, member);
    const bill = await newBill(member, { scope: 'household', household, schedule: 'once' });
    const entry = await entryFor(bill.id);
    const pay = await member.client
      .from('payments')
      .insert({ entry_id: entry.id, amount_cents: 500, paid_on: '2026-11-01' });
    expect(pay.error).toBeNull();
    const inv = await owner.client
      .from('invites')
      .insert({ household_id: household, email: `${randomUUID()}@test.local` });
    expect(inv.error).toBeNull();

    const [{ n }] = await sql`select count(*)::int n from public.history where household_id = ${household}`;
    expect(n).toBeGreaterThan(0);

    await sql`delete from public.households where id = ${household}`;

    const [left] = await sql`
      select count(*)::int n from public.history
      where household_id = ${household} or bill_id = ${bill.id}`;
    expect(left!.n).toBe(0);
  });

  test('deleting a user with a personal bill and a household membership succeeds', async () => {
    const owner = await newUser();
    const household = await newHousehold(owner);
    const member = await newUser();
    await addMember(household, owner, member);
    const personal = await newBill(member, { scope: 'personal', schedule: 'once' });
    const entry = await entryFor(personal.id);
    const pay = await member.client
      .from('payments')
      .insert({ entry_id: entry.id, amount_cents: 700, paid_on: '2026-11-01' });
    expect(pay.error).toBeNull();
    const shared = await newBill(member, { scope: 'household', household, schedule: 'once' });
    const sharedEntry = await entryFor(shared.id);
    const hpay = await member.client
      .from('payments')
      .insert({ entry_id: sharedEntry.id, amount_cents: 300, paid_on: '2026-11-01' })
      .select('id')
      .single();
    expect(hpay.error).toBeNull();
    const [before] = await sql`
      select count(*)::int n from public.history where owner_id = ${member.id} or bill_id = ${personal.id}`;
    expect(before!.n).toBeGreaterThan(0);

    await sql`delete from auth.users where id = ${member.id}`;

    const [mine] = await sql`
      select count(*)::int n from public.history where owner_id = ${member.id} or bill_id = ${personal.id}`;
    expect(mine!.n).toBe(0);
    // Household history survives, with the departed actor cleared.
    const rows = await householdHistory(owner, household);
    expect(rows.length).toBeGreaterThan(0);
    const [b] = await sql`select count(*)::int n from public.history where bill_id = ${shared.id}`;
    expect(b!.n).toBe(2);
    const [pp] = await sql`select paid_by from public.payments where id = ${hpay.data!.id}`;
    expect(pp!.paid_by).toBeNull();
    const [orphans] = await sql`
      select count(*)::int n from public.history where actor_id = ${member.id}`;
    expect(orphans!.n).toBe(0);
  });
});
