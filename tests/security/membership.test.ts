import { randomUUID } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { admin, newHousehold, newUser, sql } from '../helpers/db.ts';

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
    // Task 3 will replace this superuser insert with an invite.
    const b = await newUser();
    await sql`insert into public.memberships (household_id, profile_id, role) values (${h}, ${b.id}, 'member')`;
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
