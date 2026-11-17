import { describe, expect, test } from 'vitest';
import { anonClient, newHousehold, newUser, sql } from '../helpers/db.ts';

const KIRI = 'Pacific/Kiritimati'; // UTC+14
const PAGO = 'Pacific/Pago_Pago'; // UTC-11: always a different date from Kiritimati

async function dateIn(zone: string): Promise<string> {
  const [r] = await sql`select (now() at time zone ${zone})::date::text as d`;
  return r!.d as string;
}

describe('schedule helpers are locked down', () => {
  test('due_dates cannot be called by a signed-in client', async () => {
    const user = await newUser();
    // Only the refusal (42501) matters; the arguments are valid and the range small.
    const { error } = await user.client.rpc('due_dates', {
      p_schedule: 'weeks',
      p_every_weeks: 1,
      p_anchor: '2026-01-01',
      p_from: '2026-01-01',
      p_through: '2026-01-15',
    });
    expect(error?.code).toBe('42501');
  });

  test('anon is refused on both helpers', async () => {
    const anon = anonClient();
    const a = await anon.rpc('due_dates', {
      p_schedule: 'weeks',
      p_every_weeks: 1,
      p_anchor: '2026-01-01',
      p_from: '2026-01-01',
      p_through: '2026-01-15',
    });
    expect(a.error?.code).toBe('42501');
    const b = await anon.rpc('scope_today', { p_household: null as never, p_owner: null as never });
    expect(b.error?.code).toBe('42501');
  });

  test('scope_today gives a member the household date but not a stranger', async () => {
    const member = await newUser();
    const stranger = await newUser();
    const household = await newHousehold(member);
    await sql`update public.households set time_zone = ${KIRI} where id = ${household}`;
    await sql`update public.profiles set time_zone = ${PAGO} where id = ${stranger.id}`;
    // The member's own profile zone is Pago Pago too, so the household date (Kiritimati)
    // differs from their own-zone fallback at every hour. A scope_today that ignored
    // the household would return the Pago Pago date and fail.
    await sql`update public.profiles set time_zone = ${PAGO} where id = ${member.id}`;

    const kiri = await dateIn(KIRI);
    const pago = await dateIn(PAGO);
    expect(kiri).not.toBe(pago);

    const asMember = await member.client.rpc('scope_today', { p_household: household, p_owner: member.id });
    expect(asMember.error).toBeNull();
    expect(asMember.data).toBe(kiri);
    expect(asMember.data).not.toBe(pago);

    // Stranger cannot see the household, so falls back to the owner's zone (their own: Pago_Pago).
    const asStranger = await stranger.client.rpc('scope_today', { p_household: household, p_owner: stranger.id });
    expect(asStranger.error).toBeNull();
    expect(asStranger.data).toBe(pago);
    expect(asStranger.data).not.toBe(kiri);
  });

  test('scope_today does not reveal another person\'s profile zone', async () => {
    const kiriUser = await newUser();
    const pagoUser = await newUser();
    const stranger = await newUser();
    await sql`update public.profiles set time_zone = ${KIRI} where id = ${kiriUser.id}`;
    await sql`update public.profiles set time_zone = ${PAGO} where id = ${pagoUser.id}`;
    const utc = await dateIn('UTC');

    // The test bites at every hour: at least one target's own date differs from UTC.
    const [kiri, pago] = [await dateIn(KIRI), await dateIn(PAGO)];
    expect(kiri !== utc || pago !== utc).toBe(true);

    // Controls: each target sees their own zone.
    const ownK = await kiriUser.client.rpc('scope_today', { p_household: null as never, p_owner: kiriUser.id });
    expect(ownK.data).toBe(kiri);
    const ownP = await pagoUser.client.rpc('scope_today', { p_household: null as never, p_owner: pagoUser.id });
    expect(ownP.data).toBe(pago);

    for (const target of [kiriUser, pagoUser]) {
      const r = await stranger.client.rpc('scope_today', { p_household: null as never, p_owner: target.id });
      expect(r.error).toBeNull();
      expect(r.data).toBe(utc);
    }
  });
});
