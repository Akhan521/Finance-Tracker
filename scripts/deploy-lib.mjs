// Pure helpers for scripts/deploy.mjs. Error messages name the setting that is
// wrong and never include its value (the repo is public and logs may be too).

export const LOCAL_URLS = ['http://127.0.0.1:54321', 'http://localhost:54321'];
export const SECRET_PATTERN = 'sb_secret_[A-Za-z0-9_-]{16,}|service_role|SMTP_|GMAIL';

export class ConfigError extends Error {}

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

// Returns the bare origin (no path, no trailing slash) or throws ConfigError.
// Matches the raw text, so uppercase, a trailing dot, a hash or a path are refused.
const PROD_URL = /^https:\/\/[a-z0-9]{20}\.supabase\.co\/?$/;

export function validateProductionUrl(value) {
  if (!value) throw new ConfigError('VITE_SUPABASE_URL is missing.');
  if (!PROD_URL.test(value)) {
    throw new ConfigError(
      'VITE_SUPABASE_URL is invalid: it must be https://<project-ref>.supabase.co with no path.',
    );
  }
  return value.replace(/\/$/, '');
}

export function validateLocalUrl(value) {
  if (!value) throw new ConfigError('VITE_SUPABASE_URL is missing.');
  const url = parseUrl(value);
  const origin = url ? url.origin : '';
  const exact = value === origin || value === `${origin}/`;
  if (!exact || !LOCAL_URLS.includes(origin)) {
    throw new ConfigError(
      'VITE_SUPABASE_URL is invalid for local mode: only the local Supabase stack on port 54321 is allowed.',
    );
  }
  return origin;
}

const PUBLISHABLE_KEY = /^sb_publishable_[A-Za-z0-9_-]{16,}$/;

// The role claim of a JWT, or null if the value is not a decodable JWT.
function jwtRole(value) {
  const parts = value.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return typeof payload?.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

export function validatePublishableKey(value, { local = false } = {}) {
  if (!value) throw new ConfigError('VITE_SUPABASE_PUBLISHABLE_KEY is missing.');
  if (value.startsWith('sb_secret_') || value.includes('service_role')) {
    throw new ConfigError(
      'VITE_SUPABASE_PUBLISHABLE_KEY looks like a secret key. Only the publishable key may ship in the app.',
    );
  }
  if (PUBLISHABLE_KEY.test(value)) return value;
  // The local stack may hand out a legacy anon JWT. Accept it only when its role is anon.
  // (The post-build scan cannot see a base64 role; production never takes this path.)
  if (local && jwtRole(value) === 'anon') return value;
  throw new ConfigError(
    local
      ? 'VITE_SUPABASE_PUBLISHABLE_KEY is invalid: it must be an sb_publishable_ key or an anon JWT.'
      : 'VITE_SUPABASE_PUBLISHABLE_KEY is invalid: it must match sb_publishable_ followed by at least 16 key characters.',
  );
}

export function validateWorkerName(value) {
  if (!value) throw new ConfigError('WORKER_NAME is missing.');
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value)) {
    throw new ConfigError(
      'WORKER_NAME is invalid: use 1 to 63 lowercase letters, digits or dashes, not starting or ending with a dash.',
    );
  }
  return value;
}

export function validateProductionEnv(env) {
  return {
    supabaseUrl: validateProductionUrl(env.VITE_SUPABASE_URL),
    publishableKey: validatePublishableKey(env.VITE_SUPABASE_PUBLISHABLE_KEY),
    workerName: validateWorkerName(env.WORKER_NAME),
  };
}

export function validateLocalEnv(env) {
  return {
    supabaseUrl: validateLocalUrl(env.VITE_SUPABASE_URL),
    publishableKey: validatePublishableKey(env.VITE_SUPABASE_PUBLISHABLE_KEY, { local: true }),
  };
}

export function renderHeaders(template, supabaseUrl) {
  if (!template.includes('__SUPABASE_URL__')) {
    throw new ConfigError('_headers.template has no __SUPABASE_URL__ placeholder.');
  }
  const out = template.replaceAll('__SUPABASE_URL__', supabaseUrl);
  if (out.includes('__SUPABASE_URL__')) throw new ConfigError('Placeholder substitution failed.');
  return out;
}

// No argument deploys; "--check" is a dry run; "--local" previews. Anything else
// (including both flags) is refused, so a typo can never fall through to a deploy.
export function parseMode(args) {
  if (args.length === 0) return { mode: 'production' };
  if (args.length === 1 && args[0] === '--local') return { mode: 'local' };
  if (args.length === 1 && args[0] === '--check') return { mode: 'check' };
  throw new ConfigError('Unknown argument. The only options are --local or --check, not both.');
}

export const COMPATIBILITY_DATE = '2026-10-23';

// Wrangler config for an assets-only Worker (no "main"). Generated at deploy time
// into a git-ignored folder so the name never enters the repo.
export function generateWranglerConfig(name, assetsDir) {
  validateWorkerName(name);
  if (!assetsDir.startsWith('/')) throw new ConfigError('The assets directory must be an absolute path.');
  return `${JSON.stringify(
    {
      name,
      compatibility_date: COMPATIBILITY_DATE,
      assets: { directory: assetsDir, not_found_handling: 'single-page-application' },
      workers_dev: true,
      preview_urls: false,
    },
    null,
    2,
  )}\n`;
}

export function assertProductionEnvFile(exists) {
  if (!exists) {
    throw new ConfigError(
      '.env.production.local is missing. Production reads only that file, never .env.local.',
    );
  }
}

// Only committed code on main may go live.
export function assertDeployableGitState(branch, porcelain) {
  if (branch !== 'main') throw new ConfigError('Deploys must run from the main branch.');
  if (porcelain.trim() !== '') {
    throw new ConfigError('The working tree has uncommitted changes. Commit or stash them first.');
  }
}

// Wrangler answers its own prompts when stdin is not a TTY. It prints one of these
// markers when it does, and a bare "? " prompt line is treated the same way. The
// workers.dev registration texts are included because wrangler registers a subdomain
// on its own when it thinks an AI agent is driving it.
const AUTO_ANSWER = new RegExp(
  [
    'using (fallback|default) value(\\(s\\))? in non-interactive context',
    'register\\b[^\\n]{0,80}workers\\.dev subdomain',
    'creating a workers\\.dev subdomain',
    '^\\s*\\? ',
  ].join('|'),
  'im',
);

// Variables wrangler 4.156 reads to detect an AI agent (am-i-vibing). When it detects
// one it silently registers a workers.dev subdomain, so none of these may reach it.
export const AGENT_MARKER_VARS = [
  'AGENT', 'AIDER_API_KEY', 'AI_AGENT', 'AMP_CURRENT_THREAD_ID', 'ANTIGRAVITY_AGENT',
  'ANTIGRAVITY_PROJECT_ID', 'AUGMENT_AGENT', 'CLAUDECODE', 'CODEIUM_EDITOR_APP_ROOT',
  'CODEX_THREAD_ID', 'CRUSH', 'CURSOR_TRACE_ID', 'GEMINI_CLI', 'GIT_PAGER', 'OPENCODE',
  'OPENCODE_APP_INFO', 'OPENCODE_BIN_PATH', 'OPENCODE_MODES', 'OPENCODE_SERVER', 'PAGER',
  'PI_CODING_AGENT', 'QWEN_CODE', 'REPLIT_MODE', 'REPL_ID', 'TERM_PROGRAM',
];
const AGENT_PREFIX =
  /^(CLAUDE|CURSOR_|OPENCODE|CODEX_|GEMINI_|ANTIGRAVITY_|AUGMENT_|AMP_|AIDER_|REPLIT|REPL_|QWEN_|PI_CODING|AI_AGENT)/;
const ENV_ALLOWLIST = ['PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'TMPDIR', 'SHELL', 'TERM'];

// The environment for every child process: an allowlist, never the full process.env.
export function buildWranglerEnv(base, extra) {
  const env = {};
  for (const key of ENV_ALLOWLIST) if (base[key] !== undefined) env[key] = base[key];
  for (const [key, value] of Object.entries(extra)) {
    if (AGENT_MARKER_VARS.includes(key) || AGENT_PREFIX.test(key)) continue;
    env[key] = value;
  }
  env.WRANGLER_SEND_METRICS = 'false';
  env.WRANGLER_WRITE_LOGS = 'false';
  env.WRANGLER_LOG = 'log';
  return env;
}

export function findAutoAnswer(text) {
  return AUTO_ANSWER.test(text);
}

// Removes URLs, keys, email addresses, 32-hex ids and any extra literal values.
export function redactOutput(text, extras = []) {
  let out = text
    .replace(/https?:\/\/\S+/g, '[redacted]')
    .replace(/\b[a-z0-9-]+(\.[a-z0-9-]+)*\.workers\.dev\b/gi, '[redacted]')
    .replace(/sb_(?:publishable|secret)_[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[redacted]')
    .replace(/\b[0-9a-f]{32}\b/gi, '[redacted]');
  for (const extra of [...extras].sort((x, y) => (y?.length ?? 0) - (x?.length ?? 0))) {
    if (extra) out = out.split(extra).join('[redacted]');
  }
  return out;
}
