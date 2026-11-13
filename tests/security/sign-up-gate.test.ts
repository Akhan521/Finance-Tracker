import { randomUUID } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { admin, anonClient, approve, mailbox, newHousehold, newUser, sleep, sql } from '../helpers/db.ts';

const fresh = () => `${randomUUID()}@test.local`;

// Local Auth allows 10 emails an hour (mirrors production); this file sends 4.
describe('invite-only sign-up gate', () => {
  test('an unknown email gets no email and no account', async () => {
    const email = fresh();
    const { error } = await anonClient().auth.signInWithOtp({ email });
    expect(error?.status).toBe(403);
    expect(error?.message).toMatch(/Signups not allowed/);
    await sleep(1500);
    expect(await mailbox.count(email)).toBe(0);
    expect(await sql`select 1 from auth.users where email = ${email}`).toHaveLength(0);
  });

  test('an approved email gets a code', async () => {
    const email = fresh();
    await approve(email);
    const { error } = await anonClient().auth.signInWithOtp({ email });
    expect(error).toBeNull();
    await sleep(1500);
    expect(await mailbox.count(email)).toBe(1);
  });

  test('approval ignores case and spaces', async () => {
    const local = randomUUID();
    await approve(`${local}@test.local`);

    // Auth itself lowercases the address, and rejects padded ones as malformed
    // before any hook runs, so spaces are covered by calling the hook directly.
    const { error } = await anonClient().auth.signInWithOtp({
      email: `${local.toUpperCase()}@Test.Local`,
    });
    expect(error).toBeNull();
    await sleep(1500);
    expect(await mailbox.count(`${local}@test.local`)).toBe(1);

    const padded = { user: { email: `  ${local.toUpperCase()}@Test.Local ` } };
    const [row] = await sql`
      select public.hook_before_user_created(${sql.json(padded)}) as result`;
    expect(row.result).toEqual({});
  });

  test('an existing account gets a code even if not approved any more', async () => {
    // Admin createUser skips the hook, so this email was never approved.
    const email = fresh();
    const created = await admin.auth.admin.createUser({ email, email_confirm: true });
    expect(created.error).toBeNull();
    const { error } = await anonClient().auth.signInWithOtp({ email });
    expect(error).toBeNull();
    await sleep(1500);
    expect(await mailbox.count(email)).toBe(1);
  });

  test('a password signUp for an unknown email creates nothing', async () => {
    const email = fresh();
    const { error } = await anonClient().auth.signUp({ email, password: `${randomUUID()}Aa1!` });
    expect(error?.status).toBe(403);
    expect(error?.message).toMatch(/Signups not allowed/);
    await sleep(1500);
    expect(await sql`select 1 from auth.users where email = ${email}`).toHaveLength(0);
    expect(await mailbox.count(email)).toBe(0);
  });

  test('an invited new email gets a code; after the invite is cancelled it gets nothing', async () => {
    const owner = await newUser();
    const h = await newHousehold(owner);
    const invited = fresh();
    const cancelled = fresh();
    for (const email of [invited, cancelled]) {
      const r = await owner.client.from('invites').insert({ household_id: h, email });
      expect(r.error).toBeNull();
    }
    const ok = await anonClient().auth.signInWithOtp({ email: invited });
    expect(ok.error).toBeNull();
    await sleep(1500);
    expect(await mailbox.count(invited)).toBe(1);

    const c = await owner.client
      .from('invites')
      .update({ cancelled_at: new Date().toISOString() })
      .eq('email', cancelled)
      .select();
    expect(c.data).toHaveLength(1);
    const no = await anonClient().auth.signInWithOtp({ email: cancelled });
    expect(no.error?.status).toBe(403);
    expect(no.error?.message).toMatch(/Signups not allowed/);
    await sleep(1500);
    expect(await mailbox.count(cancelled)).toBe(0);
    expect(await sql`select 1 from auth.users where email = ${cancelled}`).toHaveLength(0);

    // An expired invite does not open the gate either.
    const expired = fresh();
    const setup = await owner.client.from('invites').insert({ household_id: h, email: expired });
    expect(setup.error).toBeNull();
    await sql`update public.invites set expires_at = now() - interval '1 minute' where email = ${expired}`;
    const [row] = await sql`
      select public.hook_before_user_created(${sql.json({ user: { email: `  ${expired.toUpperCase()} ` } })}) as result`;
    expect(row.result).toEqual({ error: { http_code: 403, message: 'Signups not allowed' } });
  });

  test('clients cannot call the hook function', async () => {
    const event = { user: { email: fresh() } };
    const anon = await anonClient().rpc('hook_before_user_created' as never, { event } as never);
    expect(anon.error?.code).toBe('42501');
    expect(anon.data).toBeNull();

    const user = await newUser();
    const authed = await user.client.rpc('hook_before_user_created' as never, { event } as never);
    expect(authed.error?.code).toBe('42501');
    expect(authed.data).toBeNull();
  });

  test('clients cannot read approved_emails', async () => {
    const user = await newUser();
    const anon = await anonClient().from('approved_emails' as never).select('*');
    const authed = await user.client.from('approved_emails' as never).select('*');
    for (const r of [anon, authed]) expect(r.error ?? r.data).toBeTruthy();
    expect(anon.data ?? []).toHaveLength(0);
    expect(authed.data ?? []).toHaveLength(0);
  });
});

test('the hook rejects missing, empty and unknown emails with the exact 403 body', async () => {
  const denied = {
    error: { http_code: 403, message: 'Signups not allowed' },
  };
  for (const event of [{}, { user: {} }, { user: { email: '' } }, { user: { email: '   ' } }, { user: { email: fresh() } }]) {
    const [row] = await sql`select public.hook_before_user_created(${sql.json(event)}) as result`;
    expect(row.result).toEqual(denied);
  }
});
