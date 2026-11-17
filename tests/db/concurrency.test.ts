import postgres from 'postgres';
import { expect, test } from 'vitest';
import { addMember, newHousehold, newUser, sql, type TestUser } from '../helpers/db.ts';

type Tx = postgres.ReservedSql;

/**
 * Run one transaction per statement-list on two separate connections: each
 * runs its (awaited) statements first, then both run the deferred checks and
 * commit at the same moment.
 */
async function concurrently(
  work: [(t: Tx) => Promise<unknown>, (t: Tx) => Promise<unknown>],
): Promise<PromiseSettledResult<void>[]> {
  const c1 = postgres(process.env.TEST_DB_URL!, { max: 1, onnotice: () => {} });
  const c2 = postgres(process.env.TEST_DB_URL!, { max: 1, onnotice: () => {} });
  let t1: Tx | undefined;
  let t2: Tx | undefined;
  try {
    t1 = await c1.reserve();
    t2 = await c2.reserve();
    await t1`begin`;
    await t2`begin`;
    await work[0](t1);
    await work[1](t2);
    const finish = async (t: Tx) => {
      await t`set constraints all immediate`;
      await t`commit`;
    };
    return await Promise.allSettled([finish(t1), finish(t2)]);
  } finally {
    t1?.release();
    t2?.release();
    await c1.end({ timeout: 5 });
    await c2.end({ timeout: 5 });
  }
}

async function twoOwnersAndTwoMembers(): Promise<{ h: string; a: TestUser; b: TestUser; c: TestUser; d: TestUser }> {
  const [a, b, c, d] = [await newUser(), await newUser(), await newUser(), await newUser()];
  const h = await newHousehold(a);
  await addMember(h, a, b);
  await addMember(h, a, c);
  await addMember(h, a, d);
  await sql`update public.memberships set role = 'owner' where household_id = ${h} and profile_id = ${b.id}`;
  return { h, a, b, c, d };
}

const members = async (h: string) =>
  (await sql`select profile_id, role from public.memberships where household_id = ${h}`) as unknown as {
    profile_id: string;
    role: string;
  }[];

// Two membership changes in one household, committed at the same time, must
// both succeed. Each one writes a history row (its FK holds KEY SHARE on the
// household row until commit), so the deferred owner check must not take a
// lock that conflicts with KEY SHARE (a plain FOR UPDATE deadlocks: 40P01).
test('two concurrent membership changes in one household do not deadlock', async () => {
  const { h, a, b, c, d } = await twoOwnersAndTwoMembers();
  const results = await concurrently([
    (t) => t`delete from public.memberships where household_id = ${h} and profile_id = ${c.id}`,
    (t) => t`delete from public.memberships where household_id = ${h} and profile_id = ${d.id}`,
  ]);
  for (const r of results) {
    expect(r.status === 'rejected' ? (r.reason as { code?: string }).code : 'ok').toBe('ok');
  }
  expect((await members(h)).map((r) => r.profile_id).sort()).toEqual([a.id, b.id].sort());
}, 30000);

// Write skew: two co-owners each remove their OWN owner row at once. Each sees
// the other still an owner, so without the lock both would commit and leave no
// owner. Exactly one must be refused with last_owner.
test('two co-owners cannot both leave at once (no write skew)', async () => {
  const { h, a, b, c, d } = await twoOwnersAndTwoMembers();
  await sql`delete from public.memberships where household_id = ${h} and profile_id = ${d.id}`;
  const results = await concurrently([
    (t) => t`delete from public.memberships where household_id = ${h} and profile_id = ${a.id}`,
    (t) => t`delete from public.memberships where household_id = ${h} and profile_id = ${b.id}`,
  ]);
  const ok = results.filter((r) => r.status === 'fulfilled');
  const bad = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  expect(ok).toHaveLength(1);
  expect(bad).toHaveLength(1);
  expect((bad[0]!.reason as { message: string }).message).toBe('last_owner');
  expect((bad[0]!.reason as { code: string }).code).toBe('P0001');

  const left = await members(h);
  expect(left.filter((m) => m.role === 'owner')).toHaveLength(1);
  expect(left.some((m) => m.profile_id === c.id)).toBe(true);
}, 30000);
