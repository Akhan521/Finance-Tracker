import { describe, expect, test } from 'vitest';
import {
  ConfigError,
  SECRET_PATTERN,
  assertDeployableGitState,
  assertProductionEnvFile,
  COMPATIBILITY_DATE,
  generateWranglerConfig,
  AGENT_MARKER_VARS,
  buildWranglerEnv,
  findAutoAnswer,
  parseMode,
  redactOutput,
  validateWorkerName,
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
  WORKER_NAME: 'my-bills-1',
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
      workerName: 'my-bills-1',
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

  test.each([undefined, '', 'Has Caps', 'has space', '-lead', 'trail-', 'a/b', 'a.workers.dev', 'a_b', 'x'.repeat(64)])(
    'refuses a bad worker name: %s',
    (name) => {
      expect(() => validateProductionEnv({ ...GOOD, WORKER_NAME: name })).toThrow(ConfigError);
    },
  );

  test.each(['a', 'ab', 'my-bills-1', '1x', 'x'.repeat(63)])('accepts worker name %s', (name) => {
    expect(validateWorkerName(name)).toBe(name);
  });

  test('error messages never contain the values', () => {
    const values = {
      VITE_SUPABASE_URL: 'http://secret-host-zzz.supabase.co/path',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_topsecretvalue0123456789',
      WORKER_NAME: 'Bad Worker Name',
    };
    for (const name of Object.keys(values)) {
      const msg = messageFor(() => validateProductionEnv({ ...GOOD, [name]: values[name] }));
      expect(msg).toContain(name);
      expect(msg).not.toContain(values[name]);
      for (const piece of ['secret-host-zzz', 'topsecretvalue', 'Bad Worker']) {
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

  test('argument parsing: only --local or --check, never both', () => {
    expect(parseMode([])).toEqual({ mode: 'production' });
    expect(parseMode(['--local'])).toEqual({ mode: 'local' });
    expect(parseMode(['--check'])).toEqual({ mode: 'check' });
    for (const args of [['--locla'], ['deploy'], ['--local', '--x'], ['--prod'], ['--local', '--check'], ['--check', '--local'], ['--check', '--check']]) {
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

describe('generateWranglerConfig', () => {
  test('is assets only, SPA mode, no preview URLs, absolute directory', () => {
    const json = generateWranglerConfig('my-bills-1', '/abs/path/dist');
    expect(JSON.parse(json)).toEqual({
      name: 'my-bills-1',
      compatibility_date: COMPATIBILITY_DATE,
      assets: { directory: '/abs/path/dist', not_found_handling: 'single-page-application' },
      workers_dev: true,
      preview_urls: false,
    });
    expect(JSON.parse(json)).not.toHaveProperty('main');
  });

  test('uses a fixed compatibility date', () => {
    expect(COMPATIBILITY_DATE).toBe('2026-10-23');
  });

  test('refuses a relative directory and a bad name, without echoing them', () => {
    expect(() => generateWranglerConfig('ok-name', 'dist')).toThrow(ConfigError);
    const msg = messageFor(() => generateWranglerConfig('Bad Name!', '/abs/dist'));
    expect(msg).not.toContain('Bad Name!');
  });
});

describe('findAutoAnswer', () => {
  test.each([
    'Using fallback value in non-interactive context: yes',
    'USING DEFAULT VALUE IN NON-INTERACTIVE CONTEXT: foo',
    'Using default value(s) in non-interactive context: a',
    '? Ok to proceed?\n\u{1F916} Using fallback value in non-interactive context: yes',
    'build ok\n? Creating a workers.dev subdomain. Ok to proceed?\n',
  ])('detects an auto-answered prompt: %#', (text) => {
    expect(findAutoAnswer(text)).toBe(true);
  });

  test.each(['', 'Total Upload: 10 KiB\nUploaded 3 files', 'What? no prompt here'])(
    'passes clean output: %#',
    (text) => {
      expect(findAutoAnswer(text)).toBe(false);
    },
  );
});

describe('redactOutput', () => {
  test('redacts URLs, keys, emails and 32-hex ids', () => {
    const out = redactOutput(
      'see https://my-bills.acct.workers.dev/x and mom@example.com id 0123456789abcdef0123456789abcdef ' +
        'key sb_publishable_abcdefghijklmnop2 and sb_secret_abcdefghijklmnopqr',
    );
    for (const leak of ['workers.dev', 'mom@example.com', '0123456789abcdef', 'abcdefghijklmnop2', 'sb_secret_abc']) {
      expect(out).not.toContain(leak);
    }
    expect(out).toContain('[redacted]');
  });

  test('redacts extra literal values such as the worker name', () => {
    expect(redactOutput('Deploying my-bills-1 now', ['my-bills-1'])).toBe('Deploying [redacted] now');
  });

  test('leaves ordinary text alone', () => {
    expect(redactOutput('Total Upload: 10 KiB')).toBe('Total Upload: 10 KiB');
  });
});

describe('buildWranglerEnv', () => {
  const noisy = {
    PATH: '/usr/bin',
    HOME: '/Users/someone',
    USER: 'someone',
    LANG: 'en_US.UTF-8',
    CLAUDECODE: '1',
    CLAUDE_CODE_ENTRYPOINT: 'cli',
    CLAUDE_EFFORT: 'medium',
    CLAUDE_CODE_MESSAGING_TOKEN: 'tok',
    CURSOR_TRACE_ID: 'x',
    PAGER: 'head -n 10000 | cat',
    TERM_PROGRAM: 'vscode',
    CLOUDFLARE_API_TOKEN: 'cf-token',
    AWS_SECRET_ACCESS_KEY: 'aws',
    SUPABASE_SERVICE_ROLE_KEY: 'srv',
    ...Object.fromEntries(AGENT_MARKER_VARS.map((k) => [k, 'x'])),
  };

  test('keeps only allowlisted variables plus the explicit ones', () => {
    const env = buildWranglerEnv(noisy, { VITE_SUPABASE_URL: 'u' });
    expect(env.PATH).toBe('/usr/bin');
    expect(env.HOME).toBe('/Users/someone');
    expect(env.VITE_SUPABASE_URL).toBe('u');
    expect(Object.keys(env).sort()).toEqual(
      ['HOME', 'LANG', 'PATH', 'USER', 'VITE_SUPABASE_URL', 'WRANGLER_LOG', 'WRANGLER_SEND_METRICS', 'WRANGLER_WRITE_LOGS'].sort(),
    );
  });

  test('has no CLAUDE* or other agent-marker keys', () => {
    const env = buildWranglerEnv(noisy, {});
    for (const key of Object.keys(env)) {
      expect(key).not.toMatch(/^CLAUDE/);
      expect(AGENT_MARKER_VARS).not.toContain(key);
    }
    expect(env.CLAUDECODE).toBeUndefined();
    expect(env.CLOUDFLARE_API_TOKEN).toBeUndefined();
  });

  test('forces logging on, no log files and no metrics, whatever was inherited', () => {
    const env = buildWranglerEnv({ ...noisy, WRANGLER_LOG: 'none' }, {});
    expect(env.WRANGLER_LOG).toBe('log');
    expect(env.WRANGLER_WRITE_LOGS).toBe('false');
    expect(env.WRANGLER_SEND_METRICS).toBe('false');
  });

  test('explicit variables cannot reintroduce an agent marker', () => {
    expect(buildWranglerEnv(noisy, { CLAUDECODE: '1' }).CLAUDECODE).toBeUndefined();
  });
});

describe('subdomain registration text counts as an auto-answer', () => {
  test.each([
    'You need to register a workers.dev subdomain before publishing to workers.dev',
    'Would you like to register a workers.dev subdomain now?',
    'Creating a workers.dev subdomain for your account at x. Ok to proceed?',
    'Could not automatically register "x" as your workers.dev subdomain',
  ])('%#', (text) => {
    expect(findAutoAnswer(text)).toBe(true);
  });
});

describe('redactOutput backups', () => {
  test('redacts a bare workers.dev hostname', () => {
    const out = redactOutput('Deployed my-bills.acct-name.workers.dev (version)');
    expect(out).not.toContain('workers.dev');
  });

  test('redacts the repo path and home directory, longest first', () => {
    const out = redactOutput('at /Users/someone/Developer/repo/dist and /Users/someone/.config', [
      '/Users/someone',
      '/Users/someone/Developer/repo',
    ]);
    expect(out).not.toContain('someone');
    expect(out).not.toContain('Developer');
  });
});
