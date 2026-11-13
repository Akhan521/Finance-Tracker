import { randomUUID } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { admin, addMember, anonClient, mailbox, newHousehold, newUser, sleep, sql, type TestUser } from '../helpers/db.ts';

describe('profiles, households, memberships', () => {
  test('creating a household makes me its owner and only member', async () => {
    const a = await newUser();
    const h = await newHousehold(a, 'Home');
    const { data, error } = await a.client.from('memberships').select().eq('household_id', h);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0]).toMatchObject({ role: 'owner', profile_id: a.id, household_id: h });
    const hh = await a.client.from('households').select().eq('id', h);
    expect(hh.error).toBeNull();
    expect(hh.data![0]).toMatchObject({ name: 'Home', time_zone: 'America/Los_Angeles' });
  });

  test('I cannot create a second household', async () => {
    const a = await newUser();
    await newHousehold(a);
    const { error } = await a.client.rpc('create_household', {
      p_name: 'Second',
      p_time_zone: 'UTC',
    });
    expect(error?.message).toBe('already_in_household');
  });

  test('a bad time zone is refused', async () => {
    const a = await newUser();
    const { error } = await a.client.rpc('create_household', {
      p_name: 'H',
      p_time_zone: 'Mars/Base',
    });
    expect(error?.message).toBe('bad_time_zone');
    const m = await a.client.from('memberships').select();
    expect(m.error).toBeNull();
    expect(m.data).toEqual([]);
  });

  test('a stranger cannot see the household, its members, or their names', async () => {
    const a = await newUser();
    const s = await newUser();
    const h = await newHousehold(a);
    const hh = await s.client.from('households').select().eq('id', h);
    const mm = await s.client.from('memberships').select().eq('household_id', h);
    const pp = await s.client.from('profiles').select().eq('id', a.id);
    expect(hh.error).toBeNull();
    expect(mm.error).toBeNull();
    expect(pp.error).toBeNull();
    expect(hh.data).toEqual([]);
    expect(mm.data).toEqual([]);
    expect(pp.data).toEqual([]);
    // The stranger has their own household; household_names shows only it.
    await newHousehold(s, 'Other');
    const names = await s.client.rpc('household_names');
    expect(names.error).toBeNull();
    expect(names.data!.map((r) => r.profile_id)).toEqual([s.id]);
    // The stranger sees themself, and the owner still sees the household.
    const own = await s.client.from('profiles').select().eq('id', s.id);
    expect(own.data).toHaveLength(1);
    expect((await a.client.from('households').select().eq('id', h)).data).toHaveLength(1);
  });

  test('a profile cannot be edited by anyone else', async () => {
    const a = await newUser();
    const b = await newUser();
    await newHousehold(a);
    await a.client.from('profiles').update({ display_name: 'Alice' }).eq('id', a.id);
    const { data, error } = await b.client
      .from('profiles')
      .update({ display_name: 'Hacked' })
      .eq('id', a.id)
      .select();
    expect(error).toBeNull();
    expect(data).toEqual([]);
    const [row] = await sql`select display_name from public.profiles where id = ${a.id}`;
    expect(row!.display_name).toBe('Alice');
    // Own columns outside the grant are refused.
    const own = await a.client.from('profiles').update({ heads_up_sent_at: new Date().toISOString() }).eq('id', a.id);
    expect(own.error?.code).toBe('42501');
  });

  test('the sole owner cannot leave (last_owner / household_needs_member)', async () => {
    // Sole member leaving would empty the household.
    const a = await newUser();
    const h = await newHousehold(a);
    const del = await a.client.from('memberships').delete().eq('household_id', h).eq('profile_id', a.id);
    expect(del.error?.message).toBe('household_needs_member');
    expect(await sql`select 1 from public.memberships where household_id = ${h}`).toHaveLength(1);

    // Demoting the only owner leaves a member but no owner.
    const demote = await a.client
      .from('memberships')
      .update({ role: 'member' })
      .eq('household_id', h)
      .eq('profile_id', a.id);
    expect(demote.error?.message).toBe('last_owner');

    // Two members, only the owner leaves: last_owner.
    const b = await newUser();
    await addMember(h, a, b);
    const leave = await a.client.from('memberships').delete().eq('household_id', h).eq('profile_id', a.id);
    expect(leave.error?.message).toBe('last_owner');
    expect(await sql`select 1 from public.memberships where household_id = ${h}`).toHaveLength(2);
  });

  test('clients cannot insert memberships directly', async () => {
    const a = await newUser();
    const b = await newUser();
    const h = await newHousehold(a);
    const { error } = await b.client
      .from('memberships')
      .insert({ household_id: h, profile_id: b.id, role: 'owner' });
    expect(error?.code).toBe('42501');
    expect(await sql`select 1 from public.memberships where profile_id = ${b.id}`).toHaveLength(0);
  });

  test('clients cannot insert households directly', async () => {
    const a = await newUser();
    const { error } = await a.client
      .from('households')
      .insert({ name: 'Sneaky', time_zone: 'UTC' });
    expect(error?.code).toBe('42501');
    expect(await sql`select 1 from public.households where name = 'Sneaky'`).toHaveLength(0);
  });

  test('a sign-up time zone hint that is not real falls back to UTC', async () => {
    const mk = async (tz: string) => {
      const created = await admin.auth.admin.createUser({
        email: `${randomUUID()}@test.local`,
        email_confirm: true,
        user_metadata: { time_zone: tz },
      });
      if (created.error || !created.data.user) throw new Error(created.error?.message);
      const [row] = await sql`select time_zone from public.profiles where id = ${created.data.user.id}`;
      return row?.time_zone;
    };
    expect(await mk('Mars/Base')).toBe('UTC');
    expect(await mk('America/Los_Angeles')).toBe('America/Los_Angeles');
  });
});

/** The owner invites `email`; returns the invite id. */
async function invite(owner: TestUser, household: string, email: string): Promise<string> {
  const { data, error } = await owner.client
    .from('invites')
    .insert({ household_id: household, email })
    .select('id')
    .single();
  if (error || !data) throw new Error(`invite failed: ${error?.message}`);
  return data.id;
}

describe('invites, joining, roles, leaving, removal', () => {
  test('a non-owner cannot invite, cancel, see invites, remove, or change roles', async () => {
    const o = await newUser();
    const m = await newUser();
    const h = await newHousehold(o);
    await addMember(h, o, m);
    const pending = await invite(o, h, `${randomUUID()}@test.local`);
    // The owner can see it, so the member's empty result means something.
    expect((await o.client.from('invites').select().eq('household_id', h)).data!.length).toBeGreaterThan(0);

    const ins = await m.client.from('invites').insert({ household_id: h, email: `${randomUUID()}@test.local` });
    expect(ins.error?.code).toBe('42501');
    const seen = await m.client.from('invites').select().eq('household_id', h);
    expect(seen.error).toBeNull();
    expect(seen.data).toEqual([]);
    const cancel = await m.client
      .from('invites')
      .update({ cancelled_at: new Date().toISOString() })
      .eq('id', pending)
      .select();
    expect(cancel.error).toBeNull();
    expect(cancel.data).toEqual([]);
    const [still] = await sql`select cancelled_at from public.invites where id = ${pending}`;
    expect(still!.cancelled_at).toBeNull();

    const role = await m.client.from('memberships').update({ role: 'member' }).eq('profile_id', o.id).select();
    expect(role.error).toBeNull();
    expect(role.data).toEqual([]);
    const del = await m.client.from('memberships').delete().eq('profile_id', o.id).select();
    expect(del.error).toBeNull();
    expect(del.data).toEqual([]);
    expect(await sql`select 1 from public.memberships where household_id = ${h}`).toHaveLength(2);
    const [{ role: ownerRole }] = await sql`select role from public.memberships where profile_id = ${o.id}`;
    expect(ownerRole).toBe('owner');
  });

  test('a non-invited email cannot join', async () => {
    const o = await newUser();
    const stranger = await newUser();
    const h = await newHousehold(o);
    const id = await invite(o, h, `${randomUUID()}@test.local`);
    const { data, error } = await stranger.client.rpc('accept_invite', { p_invite: id });
    expect(error?.message).toBe('invite_not_found');
    expect(data).toBeNull();
    expect(await sql`select 1 from public.memberships where profile_id = ${stranger.id}`).toHaveLength(0);
    // A made-up id gives the same answer.
    const missing = await stranger.client.rpc('accept_invite', { p_invite: randomUUID() });
    expect(missing.error?.message).toBe('invite_not_found');
    // The stranger cannot see the invite in their own list either.
    const mine = await stranger.client.rpc('my_invites');
    expect(mine.error).toBeNull();
    expect(mine.data).toEqual([]);
  });

  test('the invited email can accept, with different case', async () => {
    const o = await newUser({ name: 'Owner' });
    await o.client.from('profiles').update({ display_name: 'Olive' }).eq('id', o.id);
    const kid = await newUser();
    const h = await newHousehold(o, 'The Homestead');
    // Typed with a capital letter and a trailing space, as a person would.
    const id = await invite(o, h, ` ${kid.email.toUpperCase()} `);
    const [stored] = await sql`select email from public.invites where id = ${id}`;
    expect(stored!.email).toBe(kid.email);

    const list = await kid.client.rpc('my_invites');
    expect(list.error).toBeNull();
    expect(list.data).toHaveLength(1);
    expect(list.data![0]).toMatchObject({ id, household_name: 'The Homestead', invited_by_name: 'Olive' });

    const acc = await kid.client.rpc('accept_invite', { p_invite: id });
    expect(acc.error).toBeNull();
    expect(acc.data).toBe(h);
    const mem = await kid.client.from('memberships').select().eq('profile_id', kid.id);
    expect(mem.data).toHaveLength(1);
    expect(mem.data![0]).toMatchObject({ household_id: h, role: 'member' });
    const [row] = await sql`select accepted_at from public.invites where id = ${id}`;
    expect(row!.accepted_at).not.toBeNull();
    // Accepted invites are used up.
    expect((await kid.client.rpc('my_invites')).data).toEqual([]);
    const again = await kid.client.rpc('accept_invite', { p_invite: id });
    expect(again.error?.message).toBe('invite_not_found');
  });

  test('an unconfirmed email cannot accept', async () => {
    const o = await newUser();
    const kid = await newUser();
    const h = await newHousehold(o);
    const id = await invite(o, h, kid.email);
    // The kid's token is still valid; the account's email is no longer confirmed.
    await sql`update auth.users set email_confirmed_at = null where id = ${kid.id}`;
    const { error } = await kid.client.rpc('accept_invite', { p_invite: id });
    expect(error?.message).toBe('email_not_confirmed');
    expect(await sql`select 1 from public.memberships where profile_id = ${kid.id}`).toHaveLength(0);
  });

  test('expired and cancelled invites cannot be accepted', async () => {
    const o = await newUser();
    const a = await newUser();
    const b = await newUser();
    const h = await newHousehold(o);
    const expired = await invite(o, h, a.email);
    const cancelled = await invite(o, h, b.email);
    await sql`update public.invites set expires_at = now() - interval '1 minute' where id = ${expired}`;
    const c = await o.client
      .from('invites')
      .update({ cancelled_at: new Date().toISOString() })
      .eq('id', cancelled)
      .select();
    expect(c.error).toBeNull();
    expect(c.data).toHaveLength(1);

    expect((await a.client.rpc('accept_invite', { p_invite: expired })).error?.message).toBe('invite_not_found');
    expect((await b.client.rpc('accept_invite', { p_invite: cancelled })).error?.message).toBe('invite_not_found');
    expect((await a.client.rpc('my_invites')).data).toEqual([]);
    expect((await b.client.rpc('my_invites')).data).toEqual([]);
    expect(await sql`select 1 from public.memberships where profile_id in (${a.id}, ${b.id})`).toHaveLength(0);
  });

  test('someone already in a household cannot accept', async () => {
    const o = await newUser();
    const other = await newUser();
    const h = await newHousehold(o);
    const h2 = await newHousehold(other, 'Mine');
    const id = await invite(o, h, other.email);
    const { error } = await other.client.rpc('accept_invite', { p_invite: id });
    expect(error?.message).toBe('already_in_household');
    const mem = await sql`select household_id from public.memberships where profile_id = ${other.id}`;
    expect(mem.map((r) => r.household_id)).toEqual([h2]);
    const [row] = await sql`select accepted_at from public.invites where id = ${id}`;
    expect(row!.accepted_at).toBeNull();
  });

  test('a password sign-up for an invited email gets no session until the inbox confirms', async () => {
    const o = await newUser();
    const h = await newHousehold(o);
    const email = `${randomUUID()}@test.local`;
    await invite(o, h, email);
    const password = `${randomUUID()}Aa1!`;
    const c = anonClient();
    const { data, error } = await c.auth.signUp({ email, password });
    expect(error).toBeNull();
    expect(data.session).toBeNull();
    const si = await anonClient().auth.signInWithPassword({ email, password });
    expect(si.error?.code).toMatch(/^(invalid_credentials|email_not_confirmed)$/);
    expect(si.data.session).toBeNull();
    const id = data.user!.id;
    expect(await sql`select 1 from public.memberships where profile_id = ${id}`).toHaveLength(0);
    await sleep(1500);
    expect(await mailbox.count(email)).toBe(1);
  });

  // D23's deciding test. Sends 2 Auth emails (sign-up confirmation + real code).
  test('a password set by someone else before the real invitee signs in never works', async () => {
    const o = await newUser();
    const h = await newHousehold(o);
    const invited = `${randomUUID()}@test.local`;
    const inviteId = await invite(o, h, invited);
    const attackerPw = `${randomUUID()}Aa1!`;

    // The attacker signs up the invited address with a password of their own.
    const su = await anonClient().auth.signUp({ email: invited, password: attackerPw });
    expect(su.error).toBeNull();
    expect(su.data.session).toBeNull();
    await sleep(1500);
    expect(await mailbox.count(invited)).toBe(1);

    // Auth allows one email per user every 60 s; wait that window out once.
    await sleep(61_000);

    // The real person asks for a code and signs in with it.
    const real = anonClient();
    const otp = await real.auth.signInWithOtp({ email: invited });
    expect(otp.error).toBeNull();
    let code: string | null = null;
    for (let i = 0; i < 30 && (await mailbox.count(invited)) < 2; i++) await sleep(500);
    expect(await mailbox.count(invited)).toBe(2);
    code = await mailbox.latestCode(invited);
    expect(code).toMatch(/^\d{6}$/);
    const ver = await real.auth.verifyOtp({ email: invited, token: code!, type: 'email' });
    expect(ver.error).toBeNull();
    expect(ver.data.session).not.toBeNull();

    // The attacker's password must not work now.
    const attack = await anonClient().auth.signInWithPassword({ email: invited, password: attackerPw });
    expect(attack.error?.code).toBe('invalid_credentials');
    expect(attack.data.session).toBeNull();

    // And the real person can still join with their confirmed address.
    const acc = await real.rpc('accept_invite', { p_invite: inviteId });
    expect(acc.error).toBeNull();
    expect(acc.data).toBe(h);
  }, 150_000);

  test('a former member immediately loses access to members, names, and invites', async () => {
    const o = await newUser();
    const m = await newUser();
    const h = await newHousehold(o);
    await addMember(h, o, m);
    await o.client.from('memberships').update({ role: 'owner' }).eq('profile_id', m.id);
    await invite(o, h, `${randomUUID()}@test.local`);

    // Before: access exists.
    expect((await m.client.from('memberships').select().eq('household_id', h)).data).toHaveLength(2);
    expect((await m.client.rpc('household_names')).data).toHaveLength(2);
    // Two invites: m's own accepted one, and the pending one.
    expect((await m.client.from('invites').select().eq('household_id', h)).data).toHaveLength(2);
    expect((await m.client.from('households').select().eq('id', h)).data).toHaveLength(1);

    const leave = await m.client.from('memberships').delete().eq('household_id', h).eq('profile_id', m.id);
    expect(leave.error).toBeNull();

    for (const r of [
      await m.client.from('memberships').select().eq('household_id', h),
      await m.client.from('invites').select().eq('household_id', h),
      await m.client.from('households').select().eq('id', h),
      await m.client.from('profiles').select().eq('id', o.id),
    ]) {
      expect(r.error).toBeNull();
      expect(r.data).toEqual([]);
    }
    const names = await m.client.rpc('household_names');
    expect(names.error).toBeNull();
    expect(names.data).toEqual([]);
    expect(await sql`select 1 from public.memberships where household_id = ${h}`).toHaveLength(1);
  });

  test('a removed member immediately loses access', async () => {
    const o = await newUser();
    const m = await newUser();
    const h = await newHousehold(o);
    await addMember(h, o, m);
    await o.client.from('memberships').update({ role: 'owner' }).eq('profile_id', m.id);
    await invite(o, h, `${randomUUID()}@test.local`);

    expect((await m.client.from('memberships').select().eq('household_id', h)).data).toHaveLength(2);
    expect((await m.client.rpc('household_names')).data).toHaveLength(2);
    expect((await m.client.from('invites').select().eq('household_id', h)).data).toHaveLength(2);

    // The other owner removes them.
    const rm = await o.client.from('memberships').delete().eq('household_id', h).eq('profile_id', m.id).select();
    expect(rm.error).toBeNull();
    expect(rm.data).toHaveLength(1);

    for (const r of [
      await m.client.from('memberships').select().eq('household_id', h),
      await m.client.from('invites').select().eq('household_id', h),
      await m.client.from('households').select().eq('id', h),
    ]) {
      expect(r.error).toBeNull();
      expect(r.data).toEqual([]);
    }
    expect((await m.client.rpc('household_names')).data).toEqual([]);
    // Removed owners cannot act on the household any more.
    const ins = await m.client.from('invites').insert({ household_id: h, email: `${randomUUID()}@test.local` });
    expect(ins.error?.code).toBe('42501');
  });

  test('owners can promote, demote another owner, and remove a member', async () => {
    const o = await newUser();
    const m = await newUser();
    const x = await newUser();
    const h = await newHousehold(o);
    await addMember(h, o, m);
    await addMember(h, o, x);
    const roleOf = async (id: string) =>
      (await sql`select role from public.memberships where profile_id = ${id}`)[0]!.role;

    const up = await o.client.from('memberships').update({ role: 'owner' }).eq('profile_id', m.id).select();
    expect(up.error).toBeNull();
    expect(up.data).toHaveLength(1);
    expect(await roleOf(m.id)).toBe('owner');

    // The new owner demotes the original one.
    const down = await m.client.from('memberships').update({ role: 'member' }).eq('profile_id', o.id).select();
    expect(down.error).toBeNull();
    expect(down.data).toHaveLength(1);
    expect(await roleOf(o.id)).toBe('member');

    // The demoted one has lost owner powers.
    const denied = await o.client.from('memberships').update({ role: 'owner' }).eq('profile_id', o.id).select();
    expect(denied.data).toEqual([]);
    expect(await roleOf(o.id)).toBe('member');

    const rm = await m.client.from('memberships').delete().eq('profile_id', x.id).select();
    expect(rm.error).toBeNull();
    expect(rm.data).toHaveLength(1);
    expect(await sql`select 1 from public.memberships where profile_id = ${x.id}`).toHaveLength(0);
  });

  test('the last owner cannot be demoted, even by themselves', async () => {
    const o = await newUser();
    const m = await newUser();
    const h = await newHousehold(o);
    await addMember(h, o, m);
    const { error } = await o.client.from('memberships').update({ role: 'member' }).eq('profile_id', o.id);
    expect(error?.message).toBe('last_owner');
    const [row] = await sql`select role from public.memberships where profile_id = ${o.id}`;
    expect(row!.role).toBe('owner');
  });

  test('the 21st invite created in 24 hours is refused, even if earlier ones were cancelled', async () => {
    const o = await newUser();
    const h = await newHousehold(o);
    const ids: string[] = [];
    for (let i = 0; i < 20; i++) ids.push(await invite(o, h, `${randomUUID()}@test.local`));
    // Cancelling does not make room.
    for (const id of ids.slice(0, 5)) {
      const c = await o.client
        .from('invites')
        .update({ cancelled_at: new Date().toISOString() })
        .eq('id', id)
        .select();
      expect(c.error).toBeNull();
      expect(c.data).toHaveLength(1);
    }
    expect(await sql`select 1 from public.invites where household_id = ${h} and cancelled_at is not null`).toHaveLength(5);
    const fresh = `${randomUUID()}@test.local`;
    const { error } = await o.client.from('invites').insert({ household_id: h, email: fresh });
    expect(error?.message).toBe('too_many_invites');
    expect(await sql`select 1 from public.invites where email = ${fresh}`).toHaveLength(0);
    expect(await sql`select 1 from public.invites where household_id = ${h}`).toHaveLength(20);
  });

  test('a former member gets a permission error, not invite details, when inviting', async () => {
    const o = await newUser();
    const m = await newUser();
    const h = await newHousehold(o);
    await addMember(h, o, m);
    await o.client.from('memberships').update({ role: 'owner' }).eq('profile_id', m.id);
    const taken = `${randomUUID()}@test.local`;
    await invite(o, h, taken);
    await m.client.from('memberships').delete().eq('household_id', h).eq('profile_id', m.id);
    // m still knows the household id; re-inviting a pending address must not say so.
    const dup = await m.client.from('invites').insert({ household_id: h, email: taken });
    expect(dup.error?.code).toBe('42501');
    expect(dup.error?.message).not.toBe('already_invited');

    // A stranger hitting the cap path learns nothing either.
    for (let i = 0; i < 18; i++) await invite(o, h, `${randomUUID()}@test.local`);
    expect(await sql`select 1 from public.invites where household_id = ${h}`).toHaveLength(20);
    const cap = await m.client.from('invites').insert({ household_id: h, email: `${randomUUID()}@test.local` });
    expect(cap.error?.code).toBe('42501');
    // The expired-invite cleanup must not run for an unauthorized caller.
    await sql`update public.invites set expires_at = now() - interval '1 minute' where email = ${taken}`;
    const again = await m.client.from('invites').insert({ household_id: h, email: taken });
    expect(again.error?.code).toBe('42501');
    const [row] = await sql`select cancelled_at from public.invites where email = ${taken}`;
    expect(row!.cancelled_at).toBeNull();
  });

  test('invite rules: duplicates, expired re-invites, forced columns, cancel-only updates', async () => {
    const o = await newUser();
    const h = await newHousehold(o);
    const email = `${randomUUID()}@test.local`;
    const first = await invite(o, h, email);
    // Same address typed differently is still a duplicate.
    const dup = await o.client.from('invites').insert({ household_id: h, email: ` ${email.toUpperCase()}` });
    expect(dup.error?.message).toBe('already_invited');

    // An expired pending invite is cancelled and replaced.
    await sql`update public.invites set expires_at = now() - interval '1 minute' where id = ${first}`;
    const second = await invite(o, h, email);
    const [old] = await sql`select cancelled_at from public.invites where id = ${first}`;
    expect(old!.cancelled_at).not.toBeNull();
    expect(second).not.toBe(first);

    // Server-controlled columns cannot be set by the client.
    const forced = await o.client
      .from('invites')
      .insert({ household_id: h, email: `${randomUUID()}@test.local`, invited_by: randomUUID() } as never);
    expect(forced.error?.code).toBe('42501');
    const [row] = await sql`select invited_by from public.invites where id = ${second}`;
    expect(row!.invited_by).toBe(o.id);

    // Only cancelled_at is updatable, and only from null to a time.
    const edit = await o.client.from('invites').update({ expires_at: '2999-01-01' } as never).eq('id', second);
    expect(edit.error?.code).toBe('42501');
    const clear = await o.client.from('invites').update({ cancelled_at: null }).eq('id', first);
    expect(clear.error?.message).toBe('invite_not_pending');
    const [still] = await sql`select cancelled_at from public.invites where id = ${first}`;
    expect(still!.cancelled_at).not.toBeNull();

    // No deleting.
    const del = await o.client.from('invites').delete().eq('id', second);
    expect(del.error?.code).toBe('42501');

    // An accepted invite cannot be cancelled.
    const kid = await newUser();
    const acceptedId = await invite(o, h, kid.email);
    expect((await kid.client.rpc('accept_invite', { p_invite: acceptedId })).error).toBeNull();
    const late = await o.client
      .from('invites')
      .update({ cancelled_at: new Date().toISOString() })
      .eq('id', acceptedId);
    expect(late.error?.message).toBe('invite_not_pending');

    // Anonymous callers cannot touch any of it.
    const anon = anonClient();
    expect((await anon.rpc('accept_invite', { p_invite: acceptedId })).error?.code).toBe('42501');
    expect((await anon.rpc('my_invites')).error?.code).toBe('42501');
    expect((await anon.from('invites').select()).error?.code).toBe('42501');
  });
});

// D33: sign-in is code-only, so no password may ever work.
describe('passwords never work (D33)', () => {
  test('an account created with a password cannot sign in with it', async () => {
    const email = `${randomUUID()}@test.local`;
    const password = `${randomUUID()}Aa1!`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    expect(created.error).toBeNull();
    const si = await anonClient().auth.signInWithPassword({ email, password });
    expect(si.error?.code).toBe('invalid_credentials');
    expect(si.data.session).toBeNull();
    const [row] = await sql`select encrypted_password from auth.users where id = ${created.data.user!.id}`;
    expect(row!.encrypted_password).toBe('');
  });

  test('a signed-in user who sets a password cannot use it', async () => {
    const u = await newUser();
    const password = `${randomUUID()}Aa1!`;
    const upd = await u.client.auth.updateUser({ password });
    expect(upd.error).toBeNull();
    const si = await anonClient().auth.signInWithPassword({ email: u.email, password });
    expect(si.error?.code).toBe('invalid_credentials');
    expect(si.data.session).toBeNull();
    const [row] = await sql`select encrypted_password from auth.users where id = ${u.id}`;
    expect(row!.encrypted_password).toBe('');
  });
});
