import { describe, expect, test } from 'vitest';
import type { TablesInsert } from '../../src/lib/database.types.ts';
import { addMember, newBill, newHousehold, newUser, sql, type TestUser } from '../helpers/db.ts';

const DEFAULTS = [
  'Car',
  'Credit card',
  'Housing',
  'Insurance',
  'Internet & phone',
  'Utilities',
];

async function categoryId(user: TestUser, scope: { household?: string; owner?: string }, name: string) {
  const q = user.client.from('categories').select('id').eq('name', name);
  const { data, error } = await (scope.household
    ? q.eq('household_id', scope.household)
    : q.eq('owner_id', scope.owner!)
  ).single();
  if (error || !data) throw new Error(`category ${name} not found: ${error?.message}`);
  return data.id;
}

describe('categories and bills', () => {
  test("a member cannot read, change, or archive another member's personal bill", async () => {
    const a = await newUser();
    const b = await newUser();
    const h = await newHousehold(a);
    await addMember(h, a, b);
    const bill = await newBill(a, { scope: 'personal' });

    // Not vacuous: the owner sees the bill and her personal categories.
    expect((await a.client.from('bills').select().eq('id', bill.id)).data).toHaveLength(1);
    expect((await a.client.from('categories').select().eq('owner_id', a.id)).data).toHaveLength(6);

    const read = await b.client.from('bills').select().eq('id', bill.id);
    expect(read.error).toBeNull();
    expect(read.data).toEqual([]);

    const upd = await b.client
      .from('bills')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', bill.id)
      .select();
    expect(upd.error).toBeNull();
    expect(upd.data).toEqual([]);

    const cats = await b.client.from('categories').select().eq('owner_id', a.id);
    expect(cats.error).toBeNull();
    expect(cats.data).toEqual([]);

    const [row] = await sql`select archived_at from public.bills where id = ${bill.id}`;
    expect(row?.archived_at).toBeNull();
  });

  test('every member can read and edit household bills; a stranger cannot', async () => {
    const a = await newUser();
    const b = await newUser();
    const stranger = await newUser();
    const h = await newHousehold(a);
    await addMember(h, a, b);
    const bill = await newBill(a, { scope: 'household', household: h, name: 'Rent' });

    const seen = await b.client.from('bills').select('name').eq('id', bill.id);
    expect(seen.error).toBeNull();
    expect(seen.data).toEqual([{ name: 'Rent' }]);

    // A non-owner member edits, and the edit sticks.
    const edit = await b.client.from('bills').update({ name: 'Rent (June)', usual_cents: 250000 }).eq('id', bill.id).select('name, usual_cents');
    expect(edit.error).toBeNull();
    expect(edit.data).toEqual([{ name: 'Rent (June)', usual_cents: 250000 }]);
    const [row] = await sql`select name from public.bills where id = ${bill.id}`;
    expect(row?.name).toBe('Rent (June)');

    // A member can add a household bill too.
    const b2 = await newBill(b, { scope: 'household', household: h, name: 'Water' });
    expect((await a.client.from('bills').select().eq('id', b2.id)).data).toHaveLength(1);

    // The stranger sees nothing, edits nothing, and cannot insert into it.
    const sRead = await stranger.client.from('bills').select().eq('household_id', h);
    expect(sRead.error).toBeNull();
    expect(sRead.data).toEqual([]);
    const sEdit = await stranger.client.from('bills').update({ name: 'pwned' }).eq('id', bill.id).select();
    expect(sEdit.error).toBeNull();
    expect(sEdit.data).toEqual([]);
    const sCats = await stranger.client.from('categories').select().eq('household_id', h);
    expect(sCats.error).toBeNull();
    expect(sCats.data).toEqual([]);
    const catId = await categoryId(a, { household: h }, 'Housing');
    const sIns = await stranger.client
      .from('bills')
      .insert({ household_id: h, category_id: catId, name: 'x', usual_cents: 100, schedule: 'monthly', anchor_date: '2026-01-01' });
    // The category trigger refuses first (the stranger cannot see the category);
    // the bills_insert policy is a second layer behind it.
    expect(sIns.error?.message).toBe('category_scope_mismatch');
    const [after] = await sql`select name from public.bills where id = ${bill.id}`;
    expect(after?.name).toBe('Rent (June)');
  });

  test('a former member cannot read household bills', async () => {
    const a = await newUser();
    const b = await newUser();
    const h = await newHousehold(a);
    await addMember(h, a, b);
    const bill = await newBill(a, { scope: 'household', household: h });

    expect((await b.client.from('bills').select().eq('id', bill.id)).data).toHaveLength(1);
    expect((await b.client.from('categories').select().eq('household_id', h)).data).toHaveLength(6);

    const left = await b.client.from('memberships').delete().eq('profile_id', b.id);
    expect(left.error).toBeNull();

    const read = await b.client.from('bills').select().eq('id', bill.id);
    expect(read.error).toBeNull();
    expect(read.data).toEqual([]);
    const cats = await b.client.from('categories').select().eq('household_id', h);
    expect(cats.error).toBeNull();
    expect(cats.data).toEqual([]);
    const edit = await b.client.from('bills').update({ name: 'nope' }).eq('id', bill.id).select();
    expect(edit.error).toBeNull();
    expect(edit.data).toEqual([]);
    // The owner still sees it.
    expect((await a.client.from('bills').select().eq('id', bill.id)).data).toHaveLength(1);
  });

  test('scope cannot change after creation', async () => {
    const a = await newUser();
    const b = await newUser();
    const h = await newHousehold(a);
    const hb = await newBill(a, { scope: 'household', household: h });
    const pb = await newBill(a, { scope: 'personal' });

    const toPersonal = await a.client
      .from('bills')
      .update({ household_id: null, owner_id: b.id })
      .eq('id', hb.id);
    expect(toPersonal.error?.code).toBe('42501');
    const toHousehold = await a.client
      .from('bills')
      .update({ household_id: h, owner_id: null })
      .eq('id', pb.id);
    expect(toHousehold.error?.code).toBe('42501');
    const justOwner = await a.client.from('bills').update({ owner_id: b.id }).eq('id', pb.id);
    expect(justOwner.error?.code).toBe('42501');

    const [r1] = await sql`select household_id, owner_id from public.bills where id = ${hb.id}`;
    expect(r1).toMatchObject({ household_id: h, owner_id: null });
    const [r2] = await sql`select household_id, owner_id from public.bills where id = ${pb.id}`;
    expect(r2).toMatchObject({ household_id: null, owner_id: a.id });
  });

  test("a bill cannot use another household's or person's category", async () => {
    const a = await newUser();
    const c = await newUser();
    const ha = await newHousehold(a);
    const hc = await newHousehold(c);
    const base = { name: 'x', usual_cents: 100, schedule: 'monthly' as const, anchor_date: '2026-01-01' };

    const cHousehold = await categoryId(c, { household: hc }, 'Housing');
    const cPersonal = await categoryId(c, { owner: c.id }, 'Housing');
    const aHousehold = await categoryId(a, { household: ha }, 'Housing');
    const aPersonal = await categoryId(a, { owner: a.id }, 'Housing');

    // Sanity: matching scopes work, and set is_credit_card from the category.
    const ok = await a.client
      .from('bills')
      .insert({ ...base, household_id: ha, category_id: aHousehold })
      .select('is_credit_card')
      .single();
    expect(ok.error).toBeNull();
    expect(ok.data?.is_credit_card).toBe(false);
    const card = await a.client
      .from('bills')
      .insert({ ...base, owner_id: a.id, category_id: await categoryId(a, { owner: a.id }, 'Credit card') })
      .select('is_credit_card')
      .single();
    expect(card.error).toBeNull();
    expect(card.data?.is_credit_card).toBe(true);

    const attempts: Record<string, TablesInsert<'bills'>> = {
      'another household': { ...base, household_id: ha, category_id: cHousehold },
      "another person's": { ...base, owner_id: a.id, category_id: cPersonal },
      'household bill, own personal category': { ...base, household_id: ha, category_id: aPersonal },
      'personal bill, own household category': { ...base, owner_id: a.id, category_id: aHousehold },
      'personal bill, other household category': { ...base, owner_id: a.id, category_id: cHousehold },
      'nonexistent category': { ...base, owner_id: a.id, category_id: '00000000-0000-4000-8000-000000000000' },
    };
    const messages = new Set<string>();
    for (const [label, row] of Object.entries(attempts)) {
      const r = await a.client.from('bills').insert(row);
      expect(r.error?.message, label).toBe('category_scope_mismatch');
      messages.add(r.error!.message);
    }
    // Unseen and mismatched look identical: nothing reveals that a category exists.
    expect(messages.size).toBe(1);

    // Re-pointing an existing bill is checked too.
    const mine = await newBill(a, { scope: 'household', household: ha });
    const move = await a.client.from('bills').update({ category_id: cHousehold }).eq('id', mine.id);
    expect(move.error?.message).toBe('category_scope_mismatch');
    const moveOwn = await a.client.from('bills').update({ category_id: aPersonal }).eq('id', mine.id);
    expect(moveOwn.error?.message).toBe('category_scope_mismatch');
    // Re-pointing within scope works and updates is_credit_card.
    const cardHousehold = await categoryId(a, { household: ha }, 'Credit card');
    const moveOk = await a.client.from('bills').update({ category_id: cardHousehold }).eq('id', mine.id).select('is_credit_card');
    expect(moveOk.error).toBeNull();
    expect(moveOk.data).toEqual([{ is_credit_card: true }]);
  });

  test('last4 must be exactly 4 digits and pay_url must be https', async () => {
    const a = await newUser();
    const cat = await categoryId(a, { owner: a.id }, 'Utilities');
    const base = { owner_id: a.id, category_id: cat, name: 'x', usual_cents: 100, schedule: 'monthly' as const, anchor_date: '2026-01-01' };

    for (const last4 of ['123', '12345', 'abcd']) {
      const r = await a.client.from('bills').insert({ ...base, last4 });
      expect(r.error?.code, `last4 ${last4}`).toBe('23514');
    }
    for (const pay_url of ['http://x', 'javascript:alert(1)']) {
      const r = await a.client.from('bills').insert({ ...base, pay_url });
      expect(r.error?.code, `pay_url ${pay_url}`).toBe('23514');
    }
    const ok = await a.client
      .from('bills')
      .insert({ ...base, last4: '0042', pay_url: 'https://pay.example.com/me' })
      .select('last4, pay_url')
      .single();
    expect(ok.error).toBeNull();
    expect(ok.data).toEqual({ last4: '0042', pay_url: 'https://pay.example.com/me' });

    // Updates are held to the same rules.
    const bill = await newBill(a, { scope: 'personal' });
    const bad = await a.client.from('bills').update({ last4: '12a4' }).eq('id', bill.id);
    expect(bad.error?.code).toBe('23514');
    const bad2 = await a.client.from('bills').update({ pay_url: 'http://x' }).eq('id', bill.id);
    expect(bad2.error?.code).toBe('23514');
  });

  test('schedule and every_weeks must agree', async () => {
    const a = await newUser();
    const cat = await categoryId(a, { owner: a.id }, 'Utilities');
    const base = { owner_id: a.id, category_id: cat, name: 'x', usual_cents: 100, anchor_date: '2026-01-01' };

    const noWeeks = await a.client.from('bills').insert({ ...base, schedule: 'weeks' });
    expect(noWeeks.error?.code).toBe('23514');
    const strayWeeks = await a.client.from('bills').insert({ ...base, schedule: 'monthly', every_weeks: 2 });
    expect(strayWeeks.error?.code).toBe('23514');
    const tooMany = await a.client.from('bills').insert({ ...base, schedule: 'weeks', every_weeks: 53 });
    expect(tooMany.error?.code).toBe('23514');

    const bill = await newBill(a, { scope: 'personal' });
    const flip = await a.client.from('bills').update({ schedule: 'weeks' }).eq('id', bill.id);
    expect(flip.error?.code).toBe('23514');
    const [row] = await sql`select schedule from public.bills where id = ${bill.id}`;
    expect(row?.schedule).toBe('monthly');

    const ok = await a.client.from('bills').insert({ ...base, schedule: 'weeks', every_weeks: 2 }).select('schedule, every_weeks').single();
    expect(ok.error).toBeNull();
    expect(ok.data).toEqual({ schedule: 'weeks', every_weeks: 2 });
  });

  test('names must not be blank, and category names are unique ignoring surrounding spaces', async () => {
    const a = await newUser();
    const cat = await categoryId(a, { owner: a.id }, 'Utilities');
    const blankBill = await a.client
      .from('bills')
      .insert({ owner_id: a.id, category_id: cat, name: '   ', usual_cents: 100, schedule: 'monthly', anchor_date: '2026-01-01' });
    expect(blankBill.error?.code).toBe('23514');
    const blankCat = await a.client.from('categories').insert({ owner_id: a.id, name: '   ', color: '#aabbcc' });
    expect(blankCat.error?.code).toBe('23514');
    const spaced = await a.client.from('categories').insert({ owner_id: a.id, name: 'Housing ', color: '#aabbcc' });
    expect(spaced.error?.code).toBe('23505');
    expect(await sql`select 1 from public.categories where owner_id = ${a.id}`).toHaveLength(6);
  });

  test('a custom category cannot be marked credit card', async () => {
    const a = await newUser();
    const h = await newHousehold(a);

    const refused = await a.client
      .from('categories')
      .insert({ owner_id: a.id, name: 'Sneaky', color: '#aabbcc', is_credit_card: true });
    expect(refused.error?.code).toBe('42501');
    const refusedH = await a.client
      .from('categories')
      .insert({ household_id: h, name: 'Sneaky', color: '#aabbcc', is_credit_card: true });
    expect(refusedH.error?.code).toBe('42501');
    expect(await sql`select 1 from public.categories where name = 'Sneaky'`).toHaveLength(0);

    // A normal custom category works and is not a card; existing flag can't be edited.
    const ok = await a.client
      .from('categories')
      .insert({ owner_id: a.id, name: 'Pets', color: '#aabbcc' })
      .select('id, is_credit_card')
      .single();
    expect(ok.error).toBeNull();
    expect(ok.data?.is_credit_card).toBe(false);
    const flip = await a.client.from('categories').update({ is_credit_card: true }).eq('id', ok.data!.id);
    expect(flip.error?.code).toBe('42501');

    // Names are unique per scope, ignoring case.
    const dup = await a.client.from('categories').insert({ owner_id: a.id, name: 'pets', color: '#aabbcc' });
    expect(dup.error?.code).toBe('23505');
    // Nobody can insert into someone else's scope.
    const b = await newUser();
    const intoA = await b.client.from('categories').insert({ owner_id: a.id, name: 'Hax', color: '#aabbcc' });
    expect(intoA.error?.code).toBe('42501');
    const intoH = await b.client.from('categories').insert({ household_id: h, name: 'Hax', color: '#aabbcc' });
    expect(intoH.error?.code).toBe('42501');
    expect(await sql`select 1 from public.categories where name = 'Hax'`).toHaveLength(0);
  });

  test('new households and new people get the six default categories', async () => {
    const a = await newUser();
    const h = await newHousehold(a);

    const personal = await a.client.from('categories').select('name, color, is_credit_card').eq('owner_id', a.id).order('name');
    expect(personal.error).toBeNull();
    expect(personal.data?.map((c) => c.name)).toEqual(DEFAULTS);
    const shared = await a.client.from('categories').select('name, color, is_credit_card').eq('household_id', h).order('name');
    expect(shared.error).toBeNull();
    expect(shared.data?.map((c) => c.name)).toEqual(DEFAULTS);

    for (const set of [personal.data!, shared.data!]) {
      for (const c of set) {
        expect(c.color).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(c.is_credit_card).toBe(c.name === 'Credit card');
      }
    }
    // Seeding again changes nothing.
    await sql`select public.seed_default_categories(${h}, null)`;
    await sql`select public.seed_default_categories(null, ${a.id})`;
    expect(await sql`select 1 from public.categories where household_id = ${h}`).toHaveLength(6);
    expect(await sql`select 1 from public.categories where owner_id = ${a.id}`).toHaveLength(6);

    // Clients cannot call the seeder.
    const call = await a.client.rpc('seed_default_categories' as never, { p_household: h, p_owner: null } as never);
    expect(call.error?.code).toBe('42501');
  });
});
