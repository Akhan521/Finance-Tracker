import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { afterAll } from 'vitest';
import type { Database } from '../../src/lib/database.types.ts';

function env(name: string): string {
  const v = process.env[`TEST_${name}`];
  if (!v) throw new Error(`TEST_${name} is not set; did globalSetup run?`);
  return v;
}

const authOptions = { auth: { persistSession: false, autoRefreshToken: false } };

export const sql = postgres(env('DB_URL'), { max: 4, onnotice: () => {} });

afterAll(async () => {
  await sql.end({ timeout: 5 });
});

export const admin = createClient<Database>(env('API_URL'), env('SECRET_KEY'), authOptions);

export function anonClient(): SupabaseClient<Database> {
  return createClient<Database>(env('API_URL'), env('PUBLISHABLE_KEY'), authOptions);
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Approve an address for sign-up (stored as lower(trim(email))). */
export async function approve(email: string): Promise<void> {
  const e = email.trim().toLowerCase();
  await sql`insert into public.approved_emails (email) values (${e}) on conflict do nothing`;
}

export type TestUser = { id: string; email: string; client: SupabaseClient<Database> };

/** Create a confirmed user and sign in as them, without sending any email. */
export async function newUser(opts: { name?: string } = {}): Promise<TestUser> {
  const email = `${randomUUID()}@test.local`;
  await approve(email);
  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    ...(opts.name ? { user_metadata: { name: opts.name } } : {}),
  });
  if (created.error || !created.data.user) {
    throw new Error(`createUser failed: ${created.error?.message}`);
  }
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const token = link.data.properties?.email_otp;
  if (link.error || !token) throw new Error(`generateLink failed: ${link.error?.message}`);
  const client = anonClient();
  const verified = await client.auth.verifyOtp({ email, token, type: 'email' });
  if (verified.error) throw new Error(`verifyOtp failed: ${verified.error.message}`);
  return { id: created.data.user.id, email, client };
}

type MailpitMessage = { To: { Address: string }[] };

export const mailbox = {
  /** Number of messages whose recipients include exactly `to`. */
  async count(to: string): Promise<number> {
    const address = to.trim().toLowerCase();
    // Quote the address so Mailpit's search treats it as one term.
    const query = encodeURIComponent(`to:"${address}"`);
    const res = await fetch(`${env('MAILPIT_URL')}/api/v1/search?query=${query}&limit=200`);
    if (!res.ok) throw new Error(`Mailpit search failed: ${res.status}`);
    const body = (await res.json()) as { messages: MailpitMessage[] | null };
    return (body.messages ?? []).filter((m) =>
      m.To.some((t) => t.Address.toLowerCase() === address),
    ).length;
  },
};

/** Create a household through the owner's own client; returns its id. */
export async function newHousehold(owner: TestUser, name = 'Test household'): Promise<string> {
  const { data, error } = await owner.client.rpc('create_household', {
    p_name: name,
    p_time_zone: 'America/Los_Angeles',
  });
  if (error || !data) throw new Error(`create_household failed: ${error?.message}`);
  return data;
}
