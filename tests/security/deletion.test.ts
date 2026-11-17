import { randomUUID } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import {
  addMember,
  admin,
  newBill,
  newHousehold,
  newUser,
  sql,
  type TestUser,
} from '../helpers/db.ts';
import { resolveKeys } from '../../supabase/functions/delete-account/keys.ts';
import { corsHeaders } from '../../supabase/functions/delete-account/cors.ts';

const API_URL = process.env.TEST_API_URL!;
const FN = `${API_URL}/functions/v1/delete-account`;

async function tokenOf(u: TestUser): Promise<string> {
  const { data } = await u.client.auth.getSession();
  if (!data.session) throw new Error('no session');
  return data.session.access_token;
}

/** Call the Edge Function with the user's own token (and an optional body). */
async function deleteAccount(u: TestUser, body?: unknown): Promise<Response> {
  return fetch(FN, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${await tokenOf(u)}`,
      apikey: process.env.TEST_PUBLISHABLE_KEY!,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function entryOf(bill: string): Promise<string> {
  const [e] = await sql`select id from public.entries where bill_id = ${bill} order by due_date limit 1`;
  return e!.id as string;
}

async function pay(u: TestUser, entry: string) {
  const r = await u.client
    .from('payments')
    .insert({ entry_id: entry, amount_cents: 1500, paid_on: '2027-01-01' });
  expect(r.error).toBeNull();
}

const count = async (q: PromiseLike<readonly Record<string, unknown>[]>): Promise<number> => {
  const [r] = await q;
  return r!.n as number;
};

async function userExists(id: string): Promise<boolean> {
  const [r] = await sql`select count(*)::int n from auth.users where id = ${id}`;
  return r!.n === 1;
}

describe('deleting an account', () => {
  test('removes personal bills, entries, payments, categories and history', async () => {
    const u = await newUser();
    const bill = await newBill(u, { scope: 'personal' });
    const entry = await entryOf(bill.id);
    await pay(u, entry);

    const counts = async () => ({
      profile: await count(sql`select count(*)::int n from public.profiles where id = ${u.id}`),
      bills: await count(sql`select count(*)::int n from public.bills where owner_id = ${u.id}`),
      entries: await count(
        sql`select count(*)::int n from public.entries where bill_id in (select id from public.bills where owner_id = ${u.id})`,
      ),
      payments: await count(
        sql`select count(*)::int n from public.payments where entry_id in (select e.id from public.entries e join public.bills b on b.id = e.bill_id where b.owner_id = ${u.id})`,
      ),
      categories: await count(sql`select count(*)::int n from public.categories where owner_id = ${u.id}`),
      history: await count(sql`select count(*)::int n from public.history where owner_id = ${u.id}`),
    });
    const before = await counts();
    for (const [k, v] of Object.entries(before)) expect(v, `${k} before`).toBeGreaterThan(0);

    const res = await deleteAccount(u);
    expect(res.status).toBe(204);

    expect(await counts()).toEqual({
      profile: 0, bills: 0, entries: 0, payments: 0, categories: 0, history: 0,
    });
    expect(await userExists(u.id)).toBe(false);
  });

  test('household payments by a deleted member remain, with paid_by null ("former member")', async () => {
    const a = await newUser();
    const b = await newUser();
    const h = await newHousehold(a);
    await addMember(h, a, b);
    const bill = await newBill(a, { scope: 'household', household: h });
    const entry = await entryOf(bill.id);
    await pay(b, entry);

    const [before] = await sql`select paid_by, amount_cents from public.payments where entry_id = ${entry}`;
    expect(before!.paid_by).toBe(b.id);

    expect((await deleteAccount(b)).status).toBe(204);

    const rows = await sql`select paid_by, amount_cents from public.payments where entry_id = ${entry}`;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.paid_by).toBeNull();
    expect(Number(rows[0]!.amount_cents)).toBe(1500);
    expect(await userExists(a.id)).toBe(true);
  });

  test('household_names no longer returns a deleted member', async () => {
    const a = await newUser({ name: 'Alpha' });
    const b = await newUser({ name: 'Beta' });
    const h = await newHousehold(a);
    await addMember(h, a, b);

    const before = await a.client.rpc('household_names');
    expect(before.error).toBeNull();
    expect(before.data!.map((r) => r.profile_id)).toContain(b.id);

    expect((await deleteAccount(b)).status).toBe(204);

    const after = await a.client.rpc('household_names');
    expect(after.error).toBeNull();
    const ids = after.data!.map((r) => r.profile_id);
    expect(ids).not.toContain(b.id);
    expect(ids).toContain(a.id);
  });

  test('a last owner with other members is blocked (409 last_owner) and nothing is deleted', async () => {
    const a = await newUser();
    const b = await newUser();
    const h = await newHousehold(a);
    await addMember(h, a, b);
    await newBill(a, { scope: 'personal' });

    const snapshot = async () => ({
      user: await userExists(a.id),
      profile: await count(sql`select count(*)::int n from public.profiles where id = ${a.id}`),
      memberships: await count(sql`select count(*)::int n from public.memberships where household_id = ${h}`),
      bills: await count(sql`select count(*)::int n from public.bills where owner_id = ${a.id}`),
    });
    const before = await snapshot();
    expect(before).toEqual({ user: true, profile: 1, memberships: 2, bills: 1 });

    const res = await deleteAccount(a);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'last_owner' });
    expect(await snapshot()).toEqual(before);

    const blocker = await a.client.rpc('account_deletion_blocker');
    expect(blocker.data).toBe('last_owner');
  });

  test('a sole member must delete the household first (409 sole_member)', async () => {
    const a = await newUser();
    const h = await newHousehold(a);
    await newBill(a, { scope: 'household', household: h });

    const res = await deleteAccount(a);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'sole_member' });
    expect(await userExists(a.id)).toBe(true);
    expect(await count(sql`select count(*)::int n from public.households where id = ${h}`)).toBe(1);

    // After the household is gone, deleting the account works.
    const del = await a.client.rpc('delete_household', { p_household: h });
    expect(del.error).toBeNull();
    expect((await deleteAccount(a)).status).toBe(204);
    expect(await userExists(a.id)).toBe(false);
  });

  test('the blocker is null with no household, and for an owner when another owner exists', async () => {
    const lone = await newUser();
    expect((await lone.client.rpc('account_deletion_blocker')).data).toBeNull();

    const a = await newUser();
    const b = await newUser();
    const h = await newHousehold(a);
    await addMember(h, a, b);
    expect((await b.client.rpc('account_deletion_blocker')).data).toBeNull();
    const promote = await a.client
      .from('memberships')
      .update({ role: 'owner' })
      .eq('household_id', h)
      .eq('profile_id', b.id);
    expect(promote.error).toBeNull();
    expect((await a.client.rpc('account_deletion_blocker')).data).toBeNull();
  });

  test('the database itself refuses to delete a last owner or sole member, whatever the caller', async () => {
    const a = await newUser();
    const b = await newUser();
    const h = await newHousehold(a);
    await addMember(h, a, b);
    await newBill(a, { scope: 'household', household: h });

    const snap = async (u: TestUser, hh: string) => ({
      user: await userExists(u.id),
      profile: await count(sql`select count(*)::int n from public.profiles where id = ${u.id}`),
      memberships: await count(sql`select count(*)::int n from public.memberships where household_id = ${hh}`),
      bills: await count(sql`select count(*)::int n from public.bills where household_id = ${hh}`),
    });
    const before = await snap(a, h);
    expect(before).toEqual({ user: true, profile: 1, memberships: 2, bills: 1 });
    const r = await admin.auth.admin.deleteUser(a.id);
    expect(r.error).not.toBeNull();
    expect(await snap(a, h)).toEqual(before);

    const s = await newUser();
    const sh = await newHousehold(s);
    const sBefore = await snap(s, sh);
    expect(sBefore).toEqual({ user: true, profile: 1, memberships: 1, bills: 0 });
    const r2 = await admin.auth.admin.deleteUser(s.id);
    expect(r2.error).not.toBeNull();
    expect(await snap(s, sh)).toEqual(sBefore);
  });

  test("a deleted account's email disappears from invites and history", async () => {
    const owner = await newUser();
    const h = await newHousehold(owner);
    const d = await newUser();
    const other = `${randomUUID()}@test.local`;

    // Invite the soon-to-be-deleted address (stored lower/trim), plus a bystander.
    for (const email of [d.email, other]) {
      const r = await owner.client.from('invites').insert({ household_id: h, email });
      expect(r.error).toBeNull();
    }
    const invitesFor = (email: string) =>
      count(sql`select count(*)::int n from public.invites where lower(trim(email)) = ${email}`);
    const historyFor = (email: string) =>
      count(
        sql`select count(*)::int n from public.history where lower(detail->>'email') = ${email}`,
      );
    expect(await invitesFor(d.email)).toBe(1);
    expect(await historyFor(d.email)).toBe(1);
    expect(await historyFor(other)).toBe(1);

    expect((await deleteAccount(d)).status).toBe(204);

    expect(await invitesFor(d.email)).toBe(0);
    expect(await historyFor(d.email)).toBe(0);
    // The history row itself stays (only the email is stripped); bystander untouched.
    const kept = await sql`
      select detail from public.history
      where household_id = ${h} and kind = 'invite_sent' and not (detail ? 'email')`;
    expect(kept).toHaveLength(1);
    expect(kept[0]!.detail).toEqual({});
    expect(await invitesFor(other)).toBe(1);
    expect(await historyFor(other)).toBe(1);
  });
});

describe('delete_household', () => {
  test('a sole owner can delete the household and everything in it is gone', async () => {
    const a = await newUser();
    const h = await newHousehold(a);
    const bill = await newBill(a, { scope: 'household', household: h });
    const entry = await entryOf(bill.id);
    await pay(a, entry);
    const inv = await a.client
      .from('invites')
      .insert({ household_id: h, email: `${randomUUID()}@test.local` });
    expect(inv.error).toBeNull();

    const counts = async () => ({
      households: await count(sql`select count(*)::int n from public.households where id = ${h}`),
      memberships: await count(sql`select count(*)::int n from public.memberships where household_id = ${h}`),
      categories: await count(sql`select count(*)::int n from public.categories where household_id = ${h}`),
      bills: await count(sql`select count(*)::int n from public.bills where household_id = ${h}`),
      entries: await count(sql`select count(*)::int n from public.entries where bill_id = ${bill.id}`),
      payments: await count(sql`select count(*)::int n from public.payments where entry_id = ${entry}`),
      invites: await count(sql`select count(*)::int n from public.invites where household_id = ${h}`),
      history: await count(sql`select count(*)::int n from public.history where household_id = ${h}`),
    });
    const before = await counts();
    for (const [k, v] of Object.entries(before)) expect(v, `${k} before`).toBeGreaterThan(0);

    const r = await a.client.rpc('delete_household', { p_household: h });
    expect(r.error).toBeNull();

    expect(await counts()).toEqual({
      households: 0, memberships: 0, categories: 0, bills: 0,
      entries: 0, payments: 0, invites: 0, history: 0,
    });
    // No history event is written for the deletion itself, and the account lives on.
    expect(await count(sql`select count(*)::int n from public.history where bill_id = ${bill.id}`)).toBe(0);
    expect(await userExists(a.id)).toBe(true);
  });

  test('a non-sole owner, a member, or an outsider cannot delete the household', async () => {
    const a = await newUser();
    const b = await newUser();
    const outsider = await newUser();
    const h = await newHousehold(a);
    await addMember(h, a, b);

    for (const who of [a, b, outsider]) {
      const r = await who.client.rpc('delete_household', { p_household: h });
      expect(r.error?.message).toBe('not_sole_owner');
    }
    expect(await count(sql`select count(*)::int n from public.households where id = ${h}`)).toBe(1);
    expect(await count(sql`select count(*)::int n from public.memberships where household_id = ${h}`)).toBe(2);
  });
});

describe('delete-account function', () => {
  test('rejects a missing token, a garbage token and the publishable key alone with 401', async () => {
    const pub = process.env.TEST_PUBLISHABLE_KEY!;
    const cases: Record<string, string>[] = [
      {},
      { authorization: 'Bearer not-a-real-token' },
      { authorization: `Bearer ${pub}`, apikey: pub },
      { apikey: pub },
    ];
    for (const headers of cases) {
      const res = await fetch(FN, { method: 'POST', headers });
      expect(res.status, JSON.stringify(Object.keys(headers))).toBe(401);
    }
  });

  test("rejects a validly signed but revoked token with the function's own 401", async () => {
    const u = await newUser();
    const token = await tokenOf(u);
    const out = await u.client.auth.signOut({ scope: 'global' });
    expect(out.error).toBeNull();
    const res = await fetch(FN, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, apikey: process.env.TEST_PUBLISHABLE_KEY! },
    });
    expect(res.status).toBe(401);
    // The function's own JSON body proves the request got past the gateway.
    expect(await res.json()).toEqual({ error: 'unauthorized' });
    expect(await userExists(u.id)).toBe(true);
  });

  test('rejects GET with 405', async () => {
    const u = await newUser();
    const res = await fetch(FN, {
      method: 'GET',
      headers: { authorization: `Bearer ${await tokenOf(u)}`, apikey: process.env.TEST_PUBLISHABLE_KEY! },
    });
    expect(res.status).toBe(405);
    expect(await userExists(u.id)).toBe(true);
  });

  test('ignores any id in the body: only the caller is affected', async () => {
    const caller = await newUser();
    const victim = await newUser();
    const res = await deleteAccount(caller, { id: victim.id, user_id: victim.id, uid: victim.id });
    expect(res.status).toBe(204);
    expect(await userExists(caller.id)).toBe(false);
    expect(await userExists(victim.id)).toBe(true);

    // A blocked caller stays blocked, whatever id they send.
    const a = await newUser();
    const b = await newUser();
    const clean = await newUser();
    const h = await newHousehold(a);
    await addMember(h, a, b);
    const blocked = await deleteAccount(a, { id: clean.id });
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toEqual({ error: 'last_owner' });
    expect(await userExists(a.id)).toBe(true);
    expect(await userExists(clean.id)).toBe(true);
  });

  // The local gateway (Kong) answers preflights itself with "*" and never
  // reaches the function, so the function's CORS rules are tested directly.
  test('CORS: an allowed origin is reflected, others get no Allow-Origin', () => {
    const allowed = 'http://localhost:5173, https://app.example';
    const ok = corsHeaders('http://localhost:5173', allowed);
    expect(ok['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
    expect(ok.Vary).toBe('Origin');
    expect(ok['Access-Control-Allow-Methods']).toBe('POST, OPTIONS');
    expect(ok['Access-Control-Allow-Headers']).toBe(
      'authorization, apikey, content-type, x-client-info',
    );
    expect(corsHeaders('https://app.example', allowed)['Access-Control-Allow-Origin']).toBe(
      'https://app.example',
    );
    for (const origin of ['https://evil.example', 'http://localhost:5173.evil.example', 'null', null]) {
      expect(corsHeaders(origin, allowed)).toEqual({});
    }
    expect(corsHeaders('http://localhost:5173', undefined)).toEqual({});
    expect(corsHeaders('http://localhost:5173', '')).toEqual({});
  });
});

describe('resolveKeys', () => {
  const env = (o: Record<string, string>) => (n: string) => o[n];
  const base = { SUPABASE_URL: 'http://x' };
  test('valid maps: default wins, else the first', () => {
    expect(
      resolveKeys(env({ ...base,
        SUPABASE_PUBLISHABLE_KEYS: '{"a":"sb_publishable_1","default":"sb_publishable_2"}',
        SUPABASE_SECRET_KEYS: '{"x":"sb_secret_1","y":"sb_secret_2"}' })),
    ).toEqual({ url: 'http://x', publishable: 'sb_publishable_2', secret: 'sb_secret_1' });
  });
  test('absent new variables fall back to the legacy names', () => {
    expect(
      resolveKeys(env({ ...base, SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc' })),
    ).toEqual({ url: 'http://x', publishable: 'anon', secret: 'svc' });
  });
  test('present but invalid fails closed, with no legacy fallback', () => {
    const legacy = { SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc' };
    const good = { SUPABASE_PUBLISHABLE_KEYS: '{"default":"sb_publishable_1"}' };
    for (const bad of ['not json', '[]', '{}', '{"default":5}', '{"default":"sb_publishable_1"}', '"sb_secret_1"']) {
      expect(resolveKeys(env({ ...base, ...legacy, ...good, SUPABASE_SECRET_KEYS: bad }))).toBeNull();
    }
    expect(
      resolveKeys(env({ ...base, ...legacy, SUPABASE_PUBLISHABLE_KEYS: '{"default":"sb_secret_1"}' })),
    ).toBeNull();
  });
  test('a missing URL or key fails closed', () => {
    expect(resolveKeys(env({ SUPABASE_ANON_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 's' }))).toBeNull();
    expect(resolveKeys(env({ ...base, SUPABASE_ANON_KEY: 'a' }))).toBeNull();
  });
});
