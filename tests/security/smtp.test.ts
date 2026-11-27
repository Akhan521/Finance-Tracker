import { describe, expect, test } from 'vitest';
import { isLocalHost, isLocalStack, smtpSettings } from '../../supabase/functions/_shared/smtp.ts';

const base = {
  SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: '587',
  SMTP_SECURE: 'false',
  SMTP_USER: 'bills@example.com',
  SMTP_PASS: 'pw',
  MAIL_FROM_NAME: 'Bills',
};
const LOCAL = { SUPABASE_URL: 'http://kong:8000', SMTP_ALLOW_PLAINTEXT: 'true' };
const get = (env: Record<string, string>) => (n: string) => env[n];
const timeouts = { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 };
const auth = { user: 'bills@example.com', pass: 'pw' };

describe('smtpSettings', () => {
  test('production options: STARTTLS required, credentials sent', () => {
    expect(smtpSettings(get(base)).options).toEqual({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth,
      ...timeouts,
    });
  });

  test('production 465: implicit TLS with credentials, no ignoreTLS', () => {
    const o = smtpSettings(get({ ...base, SMTP_SECURE: 'true', SMTP_PORT: '465' })).options;
    expect(o).toEqual({
      host: 'smtp.example.com',
      port: 465,
      secure: true,
      requireTLS: false,
      auth,
      ...timeouts,
    });
    expect('ignoreTLS' in o).toBe(false);
  });

  test.each(['smtp.example.com', 'localhost.evil.com', 'supabase_inbucket_x', '10.0.0.5', 'inbucket.evil.com'])(
    'a public host %j keeps TLS and auth even with every plaintext flag and a local stack',
    (host) => {
      const o = smtpSettings(get({ ...base, ...LOCAL, SMTP_HOST: host })).options;
      expect(o.requireTLS).toBe(true);
      expect(o.auth).toEqual(auth);
      expect(o.ignoreTLS).toBeUndefined();
    },
  );

  test.each(['https://abcd.supabase.co', undefined, 'not a url', 'http://kong.evil.com'])(
    'a non-local SUPABASE_URL (%s) with every plaintext flag and a local host still uses TLS with auth',
    (url) => {
      const env: Record<string, string> = { ...base, SMTP_HOST: 'localhost', SMTP_ALLOW_PLAINTEXT: 'true' };
      if (url) env.SUPABASE_URL = url;
      const o = smtpSettings(get(env)).options;
      expect(o.requireTLS).toBe(true);
      expect(o.auth).toEqual(auth);
      expect(o.ignoreTLS).toBeUndefined();
    },
  );

  test('SMTP_SECURE=true with the flag on localhost stays secure with auth', () => {
    const o = smtpSettings(get({ ...base, ...LOCAL, SMTP_HOST: 'localhost', SMTP_SECURE: 'true', SMTP_PORT: '465' })).options;
    expect(o.secure).toBe(true);
    expect(o.auth).toEqual(auth);
    expect(o.ignoreTLS).toBeUndefined();
  });

  test.each(['localhost', '127.0.0.1', 'host.docker.internal', 'inbucket'])(
    'plaintext mode applies on local host %s only with the flag and a local stack',
    (host) => {
      const on = smtpSettings(get({ ...base, ...LOCAL, SMTP_HOST: host })).options;
      expect(on.requireTLS).toBe(false);
      expect(on.ignoreTLS).toBe(true);
      expect(on.auth).toBeUndefined();
      const off = smtpSettings(get({ ...base, SUPABASE_URL: 'http://kong:8000', SMTP_HOST: host })).options;
      expect(off.requireTLS).toBe(true);
    },
  );

  test('the flag must be exactly "true"', () => {
    const o = smtpSettings(get({ ...base, ...LOCAL, SMTP_HOST: 'localhost', SMTP_ALLOW_PLAINTEXT: 'yes' })).options;
    expect(o.requireTLS).toBe(true);
  });

  test.each(['localhost evil.com', 'localhost\t', ' localhost', 'localhost\nx'])(
    'a host with whitespace is rejected (%j)',
    (host) => {
      expect(() => smtpSettings(get({ ...base, ...LOCAL, SMTP_HOST: host }))).toThrow(/whitespace/);
    },
  );

  test('isLocalHost is exact; isLocalStack checks the URL host', () => {
    expect(isLocalHost('LOCALHOST')).toBe(true);
    expect(isLocalHost('supabase_inbucket_x')).toBe(false);
    expect(isLocalHost('supabase.co')).toBe(false);
    expect(isLocalStack('http://127.0.0.1:54321')).toBe(true);
    expect(isLocalStack('http://localhost:54321')).toBe(true);
    expect(isLocalStack('https://x.supabase.co')).toBe(false);
  });
});
