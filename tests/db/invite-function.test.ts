import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, test } from 'vitest';
import { addMember, mailbox, newHousehold, newUser, sleep, sql, type TestUser } from '../helpers/db.ts';

const API_URL = process.env.TEST_API_URL!;
const MAILPIT_URL = process.env.TEST_MAILPIT_URL!;
const FN = `${API_URL}/functions/v1/invite`;
const households: string[] = [];

async function tokenOf(u: TestUser): Promise<string> {
  const { data } = await u.client.auth.getSession();
  if (!data.session) throw new Error('no session');
  return data.session.access_token;
}

async function invite(u: TestUser | null, body: unknown): Promise<Response> {
  return fetch(FN, {
    method: 'POST',
    headers: {
      ...(u ? { authorization: `Bearer ${await tokenOf(u)}` } : {}),
      apikey: process.env.TEST_PUBLISHABLE_KEY!,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

const target = () => `${randomUUID()}@test.local`;
const rows = async (hh: string, email: string): Promise<number> => {
  const [r] = await sql`select count(*)::int n from public.invites where household_id = ${hh} and email = ${email}`;
  return r!.n as number;
};

async function ownerWithHousehold(name = 'The Testers') {
  const owner = await newUser({ name: 'Olive' });
  await owner.client.from('profiles').update({ display_name: 'Olive' }).eq('id', owner.id);
  const hh = await newHousehold(owner, name);
  households.push(hh);
  return { owner, hh };
}

afterAll(async () => {
  for (const hh of households) await sql`delete from public.invites where household_id = ${hh}`;
});

describe('invite function', () => {
  test('an owner invite creates one row and exactly one email', async () => {
    const { owner, hh } = await ownerWithHousehold('Maple House');
    const to = target();
    const res = await invite(owner, { email: `  ${to.toUpperCase()} ` });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(await rows(hh, to)).toBe(1);
    // Allow delivery to land.
    for (let i = 0; i < 20 && (await mailbox.count(to)) === 0; i++) await sleep(250);
    expect(await mailbox.count(to)).toBe(1);

    const q = encodeURIComponent(`to:"${to}"`);
    const list = (await (await fetch(`${MAILPIT_URL}/api/v1/search?query=${q}`)).json()) as {
      messages: { ID: string; Subject: string }[];
    };
    expect(list.messages[0]!.Subject).toBe("You're invited to a household on Bills");
    const msg = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${list.messages[0]!.ID}`)).json()) as {
      Text: string;
    };
    expect(msg.Text).toContain('Maple House');
    expect(msg.Text).toContain('Olive');
    expect(msg.Text).toContain('http://localhost:5173');
    expect(msg.Text).toContain('Sign in with this email address. The invite expires in 7 days.');
    expect(msg.Text).not.toContain(hh);
    expect(msg.Text).not.toContain(owner.email);
  });

  test('a member invite is refused with no row and no email', async () => {
    const { owner, hh } = await ownerWithHousehold();
    const member = await newUser();
    await addMember(hh, owner, member);
    const to = target();
    const res = await invite(member, { email: to });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe('forbidden');
    expect(await rows(hh, to)).toBe(0);
    await sleep(500);
    expect(await mailbox.count(to)).toBe(0);
  });

  test('a person with no household is refused', async () => {
    const lone = await newUser();
    const res = await invite(lone, { email: target() });
    expect(res.status).toBe(403);
  });

  test('inviting the same address twice gives 400 already_invited and one email', async () => {
    const { owner } = await ownerWithHousehold();
    const to = target();
    expect((await invite(owner, { email: to })).status).toBe(200);
    const again = await invite(owner, { email: to });
    expect(again.status).toBe(400);
    expect(((await again.json()) as { error: string }).error).toBe('already_invited');
    for (let i = 0; i < 20 && (await mailbox.count(to)) === 0; i++) await sleep(250);
    await sleep(300);
    expect(await mailbox.count(to)).toBe(1);
  });

  test('the 21st invite in 24 hours gives 400 too_many_invites', async () => {
    const { owner, hh } = await ownerWithHousehold();
    for (let i = 0; i < 20; i++) {
      const r = await owner.client.from('invites').insert({ household_id: hh, email: target() });
      expect(r.error).toBeNull();
    }
    const to = target();
    const res = await invite(owner, { email: to });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('too_many_invites');
    expect(await rows(hh, to)).toBe(0);
    await sleep(500);
    expect(await mailbox.count(to)).toBe(0);
  });

  test.each(['', 'nope', 'a@b', 'a b@c.d', 42, null, 'a,b@c.d', '<a@b.cd>', 'a@b.cd\r\nBcc: x@y.z', '"q"a@b.cd', 'a;b@c.d', 'a@b.cd(c)'])('a bad email %j gives 400 bad_email', async (bad) => {
    const { owner } = await ownerWithHousehold();
    const res = await invite(owner, { email: bad });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('bad_email');
  });

  test('no Authorization header gives 401', async () => {
    const res = await invite(null, { email: target() });
    expect(res.status).toBe(401);
  });
});
