import { describe, expect, test } from 'vitest';
import {
  ConfigError,
  SECRET_PATTERN,
  assertDeployableGitState,
  assertProductionEnvFile,
  parseMode,
  renderHeaders,
  validateLocalEnv,
  validateProductionEnv,
} from './deploy-lib.mjs';

function jwt(role) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${enc({ alg: 'HS256' })}.${enc({ role })}.sig`;
}

const GOOD = {
  VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc123_DEF_0123456789',
  PAGES_PROJECT: 'my-bills-1',
};

function messageFor(fn) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(ConfigError);
    return err.message;
  }
  throw new Error('expected a ConfigError');
}

describe('production validation', () => {
  test('accepts a good config and returns the bare origin', () => {
    expect(validateProductionEnv({ ...GOOD, VITE_SUPABASE_URL: `${GOOD.VITE_SUPABASE_URL}/` })).toEqual({
      supabaseUrl: 'https://abcdefghijklmnopqrst.supabase.co',
      publishableKey: GOOD.VITE_SUPABASE_PUBLISHABLE_KEY,
      pagesProject: 'my-bills-1',
    });
  });

  test.each([
    ['missing', undefined],
    ['empty', ''],
    ['not a URL', 'nonsense'],
    ['http', 'http://abcdefghij.supabase.co'],
    ['wrong host', 'https://abcdefghij.example.com'],
    ['look-alike host', 'https://abcdefghijklmnopqrst.supabase.co.evil.com'],
    ['bare supabase.co', 'https://supabase.co'],
    ['path', 'https://abcdefghijklmnopqrst.supabase.co/rest/v1'],
    ['query', 'https://abcdefghijklmnopqrst.supabase.co?x=1'],
    ['credentials', 'https://u:p@abcdefghij.supabase.co'],
    ['port', 'https://abcdefghijklmnopqrst.supabase.co:8443'],
    ['hash', 'https://abcdefghijklmnopqrst.supabase.co#x'],
    ['uppercase host', 'https://ABCDEFGHIJKLMNOPQRST.supabase.co'],
    ['trailing dot', 'https://abcdefghijklmnopqrst.supabase.co.'],
    ['short ref', 'https://abcdefghij.supabase.co'],
    ['local URL', 'http://127.0.0.1:54321'],
  ])('refuses a bad URL: %s', (_label, url) => {
    expect(() => validateProductionEnv({ ...GOOD, VITE_SUPABASE_URL: url })).toThrow(ConfigError);
  });

  test.each([
    ['missing', undefined],
    ['secret key', 'sb_secret_abcdefghijklmnopqrstuv'],
    ['service role', 'eyJ.service_role.sig'],
    ['legacy anon jwt', jwt('anon')],
    ['too short', 'sb_publishable_abc'],
    ['trailing junk', 'sb_publishable_abcdefghijklmnop!'],
    ['whitespace', 'sb_publishable_abc def'],
  ])('refuses a bad key: %s', (_label, key) => {
    expect(() => validateProductionEnv({ ...GOOD, VITE_SUPABASE_PUBLISHABLE_KEY: key })).toThrow(ConfigError);
  });

  test.each([undefined, '', 'Has Caps', 'has space', '-lead', 'trail-', 'a/b', 'a.pages.dev', 'x'.repeat(60)])(
    'refuses a bad project name: %s',
    (name) => {
      expect(() => validateProductionEnv({ ...GOOD, PAGES_PROJECT: name })).toThrow(ConfigError);
    },
  );

  test('error messages never contain the values', () => {
    const values = {
      VITE_SUPABASE_URL: 'http://secret-host-zzz.supabase.co/path',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_topsecretvalue0123456789',
      PAGES_PROJECT: 'Bad Project Name',
    };
    for (const name of Object.keys(values)) {
      const msg = messageFor(() => validateProductionEnv({ ...GOOD, [name]: values[name] }));
      expect(msg).toContain(name);
      expect(msg).not.toContain(values[name]);
      for (const piece of ['secret-host-zzz', 'topsecretvalue', 'Bad Project']) {
        expect(msg).not.toContain(piece);
      }
    }
  });
});

describe('local validation', () => {
  const LOCAL_KEY = 'sb_publishable_localkey0123456789';

  test.each(['http://127.0.0.1:54321', 'http://localhost:54321', 'http://127.0.0.1:54321/'])(
    'allows %s',
    (url) => {
      const out = validateLocalEnv({ VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: LOCAL_KEY });
      expect(out.supabaseUrl).toBe(url.replace(/\/$/, ''));
    },
  );

  test.each([
    'https://abcdefghijklmnopqrst.supabase.co',
    'http://127.0.0.1:54322',
    'http://127.0.0.1',
    'http://127.0.0.1:54321/rest/v1',
    'http://192.168.1.5:54321',
    'http://localhost:54321.evil.com',
    undefined,
  ])('refuses %s', (url) => {
    expect(() => validateLocalEnv({ VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: LOCAL_KEY })).toThrow(
      ConfigError,
    );
  });

  test('accepts an anon JWT and refuses a service_role JWT (base64 payload)', () => {
    const env = (key) => ({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_PUBLISHABLE_KEY: key });
    expect(validateLocalEnv(env(jwt('anon'))).publishableKey).toBe(jwt('anon'));
    expect(() => validateLocalEnv(env(jwt('service_role')))).toThrow(ConfigError);
    expect(() => validateLocalEnv(env(jwt('authenticated')))).toThrow(ConfigError);
    expect(() => validateLocalEnv(env('not.a.jwt'))).toThrow(ConfigError);
  });

  test('still refuses a secret key', () => {
    expect(() =>
      validateLocalEnv({
        VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abcdefghijklmnopqrstuv',
      }),
    ).toThrow(ConfigError);
  });
});

describe('renderHeaders', () => {
  test('substitutes every placeholder', () => {
    const out = renderHeaders('a __SUPABASE_URL__ b __SUPABASE_URL__', 'https://x.supabase.co');
    expect(out).toBe('a https://x.supabase.co b https://x.supabase.co');
  });

  test('fails when the template has no placeholder', () => {
    expect(() => renderHeaders('nothing here', 'https://x.supabase.co')).toThrow(ConfigError);
  });
});

describe('guards', () => {
  test('SECRET_PATTERN matches the secrets CI looks for', () => {
    const re = new RegExp(SECRET_PATTERN);
    expect(re.test('sb_secret_abcdefghijklmnop')).toBe(true);
    expect(re.test('SMTP_PASS')).toBe(true);
    expect(re.test('GMAIL')).toBe(true);
    expect(re.test('service_role')).toBe(true);
    expect(re.test('sb_publishable_abcdefghijklmnop')).toBe(false);
  });

  test('only --local is accepted as an argument', () => {
    expect(parseMode([])).toEqual({ local: false });
    expect(parseMode(['--local'])).toEqual({ local: true });
    for (const args of [['--locla'], ['deploy'], ['--local', '--x'], ['--prod']]) {
      expect(() => parseMode(args)).toThrow(ConfigError);
    }
  });

  test('a missing .env.production.local is refused', () => {
    expect(() => assertProductionEnvFile(false)).toThrow(ConfigError);
    expect(() => assertProductionEnvFile(true)).not.toThrow();
  });

  test('deploys need main and a clean tree', () => {
    expect(() => assertDeployableGitState('main', '')).not.toThrow();
    expect(() => assertDeployableGitState('feature', '')).toThrow(ConfigError);
    expect(() => assertDeployableGitState('main', ' M src/App.tsx\n')).toThrow(ConfigError);
  });
});
