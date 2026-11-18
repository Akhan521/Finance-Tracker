import { afterAll, beforeEach, describe, expect, test } from 'vitest';
import { anonClient, sql } from '../helpers/db.ts';

const TOKEN = 'test-health-token-' + Math.random().toString(36).slice(2);
const KEYS = ['failures_24h', 'last_maintenance_ok_at', 'last_reminders_ok_at', 'ok'];

async function setToken(value: string | null): Promise<void> {
  await sql`delete from vault.secrets where name = 'health_token'`;
  if (value !== null) await sql`select vault.create_secret(${value}, 'health_token')`;
}

async function run(job: 'reminders' | 'maintenance', hoursAgo: number, ok: boolean, detail = 'x'): Promise<void> {
  await sql`
    insert into public.job_runs (job, started_at, finished_at, ok, detail)
    values (${job}, now() - make_interval(hours => ${hoursAgo}), now() - make_interval(hours => ${hoursAgo}), ${ok}, ${detail})`;
}

const check = (token: string | null) => anonClient().rpc('health_check', { p_token: token as string });

beforeEach(async () => {
  await sql`delete from public.job_runs`;
  await setToken(TOKEN);
});

afterAll(async () => {
  await sql`delete from public.job_runs`;
  await sql`delete from vault.secrets where name = 'health_token'`;
});

describe('job_runs privileges', () => {
  const TABLE_PRIVS = ['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger', 'maintain'];
  const COLUMN_PRIVS = ['select', 'insert', 'update', 'references'];
  const SEQ_PRIVS = ['usage', 'select', 'update'];

  test.each(['anon', 'authenticated'])('%s holds no privilege of any kind on job_runs or its sequence', async (role) => {
    const held: string[] = [];
    for (const p of TABLE_PRIVS) {
      const [r] = await sql`select has_table_privilege(${role}, 'public.job_runs', ${p}) as v`;
      if (r!.v) held.push(`table:${p}`);
    }
    for (const p of COLUMN_PRIVS) {
      const [r] = await sql`select has_any_column_privilege(${role}, 'public.job_runs', ${p}) as v`;
      if (r!.v) held.push(`column:${p}`);
    }
    const [seq] = await sql`select pg_get_serial_sequence('public.job_runs', 'id') as s`;
    expect(seq!.s).toBe('public.job_runs_id_seq');
    for (const p of SEQ_PRIVS) {
      const [r] = await sql`select has_sequence_privilege(${role}, ${seq!.s}, ${p}) as v`;
      if (r!.v) held.push(`sequence:${p}`);
    }
    expect(held).toEqual([]);
  });
});

describe('health_check', () => {
  test('a wrong token gives forbidden', async () => {
    await run('reminders', 1, true);
    const good = await check(TOKEN);
    expect(good.error).toBeNull();
    const bad = await check('not-the-token');
    expect(bad.data).toBeNull();
    expect(bad.error?.message).toBe('forbidden');
  });

  test('a null or empty token gives forbidden', async () => {
    expect((await check(TOKEN)).error).toBeNull();
    for (const t of [null, '']) {
      const r = await check(t);
      expect(r.data).toBeNull();
      expect(r.error?.message).toBe('forbidden');
    }
  });

  test('a missing Vault secret gives forbidden, even for an empty-looking match', async () => {
    expect((await check(TOKEN)).error).toBeNull();
    await setToken(null);
    for (const t of [TOKEN, '', null]) {
      const r = await check(t);
      expect(r.data).toBeNull();
      expect(r.error?.message).toBe('forbidden');
    }
    await setToken(TOKEN);
    expect((await check(TOKEN)).error).toBeNull();
  });

  test('fresh successful runs give ok true, with exactly the four fields', async () => {
    await run('reminders', 2, true);
    await run('maintenance', 3, true);
    const r = await check(TOKEN);
    expect(r.error).toBeNull();
    const d = r.data as Record<string, unknown>;
    expect(Object.keys(d).sort()).toEqual(KEYS);
    expect(d.ok).toBe(true);
    expect(d.failures_24h).toBe(0);
    expect(typeof d.last_reminders_ok_at).toBe('string');
    expect(typeof d.last_maintenance_ok_at).toBe('string');
  });

  test('no runs at all gives ok false with null timestamps', async () => {
    const d = (await check(TOKEN)).data as Record<string, unknown>;
    expect(d).toEqual({ ok: false, last_reminders_ok_at: null, last_maintenance_ok_at: null, failures_24h: 0 });
  });

  test('a reminders run 27 hours old makes ok false (positive control first)', async () => {
    await run('maintenance', 1, true);
    await run('reminders', 25, true);
    expect(((await check(TOKEN)).data as { ok: boolean }).ok).toBe(true);
    await sql`delete from public.job_runs where job = 'reminders'`;
    await run('reminders', 27, true);
    const d = (await check(TOKEN)).data as { ok: boolean; failures_24h: number };
    expect(d.ok).toBe(false);
    expect(d.failures_24h).toBe(0);
  });

  test('a maintenance run 27 hours old makes ok false', async () => {
    await run('reminders', 1, true);
    await run('maintenance', 25, true);
    expect(((await check(TOKEN)).data as { ok: boolean }).ok).toBe(true);
    await sql`delete from public.job_runs where job = 'maintenance'`;
    await run('maintenance', 27, true);
    expect(((await check(TOKEN)).data as { ok: boolean }).ok).toBe(false);
  });

  test('a failed run in the last day makes ok false; an older failure does not', async () => {
    await run('reminders', 1, true);
    await run('maintenance', 1, true);
    await run('reminders', 30, false);
    const old = (await check(TOKEN)).data as { ok: boolean; failures_24h: number };
    expect(old).toMatchObject({ ok: true, failures_24h: 0 });
    await run('maintenance', 5, false);
    const recent = (await check(TOKEN)).data as { ok: boolean; failures_24h: number };
    expect(recent).toMatchObject({ ok: false, failures_24h: 1 });
  });

  test('the response never contains detail text, emails, names or ids', async () => {
    await run('reminders', 1, true, 'secret-detail jane@example.com Jane Doe');
    await run('maintenance', 1, false, 'secret-detail jane@example.com Jane Doe');
    const r = await check(TOKEN);
    const text = JSON.stringify(r.data);
    expect(Object.keys(r.data as object).sort()).toEqual(KEYS);
    expect(text).not.toMatch(/secret-detail|jane|Jane|@|"id"|detail/);
  });

  test('anon cannot read job_runs directly', async () => {
    await run('reminders', 1, true);
    const r = await anonClient().from('job_runs').select('*');
    expect(r.error?.code).toBe('42501');
  });
});
