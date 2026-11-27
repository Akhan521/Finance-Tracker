import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { corsHeaders } from '../../supabase/functions/invite/cors.ts';
import { resolveKeys, resolvePublicKeys } from '../../supabase/functions/invite/keys.ts';

// The first comment line names the function, so it is ignored.
const read = (p: string) =>
  readFileSync(new URL(`../../supabase/functions/${p}`, import.meta.url), 'utf8').replace(/^\/\/ [^\n]*\n/, '');

describe('invite and delete-account share their helper copies', () => {
  test.each(['cors.ts', 'keys.ts'])('%s is identical in both functions', (file) => {
    expect(read(`invite/${file}`)).toBe(read(`delete-account/${file}`));
  });
});

describe('resolvePublicKeys', () => {
  const env: Record<string, string> = {
    SUPABASE_URL: 'http://kong:8000',
    SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: 'sb_publishable_x' }),
  };
  const get = (e: Record<string, string>) => (n: string) => e[n];

  test('needs no secret key', () => {
    expect(resolvePublicKeys(get(env))).toEqual({ url: 'http://kong:8000', publishable: 'sb_publishable_x' });
    expect(resolveKeys(get(env))).toBeNull();
  });

  test('fails closed on a malformed or missing key', () => {
    expect(resolvePublicKeys(get({ ...env, SUPABASE_PUBLISHABLE_KEYS: '{"default":"nope"}' }))).toBeNull();
    expect(resolvePublicKeys(get({ SUPABASE_URL: env.SUPABASE_URL }))).toBeNull();
  });

  test('never reads the secret key', () => {
    const seen: string[] = [];
    resolvePublicKeys((n) => (seen.push(n), env[n]));
    expect(seen.some((n) => /SECRET|SERVICE_ROLE/.test(n))).toBe(false);
  });

  test('cors still works through the invite copy', () => {
    expect(corsHeaders('http://a', 'http://a')['Access-Control-Allow-Origin']).toBe('http://a');
  });
});
