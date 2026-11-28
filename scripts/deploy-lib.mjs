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

export function validatePagesProject(value) {
  if (!value) throw new ConfigError('PAGES_PROJECT is missing.');
  if (!/^[a-z0-9](?:[a-z0-9-]{0,56}[a-z0-9])?$/.test(value)) {
    throw new ConfigError('PAGES_PROJECT is invalid: use a simple lowercase slug (letters, digits, hyphens).');
  }
  return value;
}

export function validateProductionEnv(env) {
  return {
    supabaseUrl: validateProductionUrl(env.VITE_SUPABASE_URL),
    publishableKey: validatePublishableKey(env.VITE_SUPABASE_PUBLISHABLE_KEY),
    pagesProject: validatePagesProject(env.PAGES_PROJECT),
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

// Only "--local" is accepted, so a typo can never fall through to a deploy.
export function parseMode(args) {
  if (args.length === 0) return { local: false };
  if (args.length === 1 && args[0] === '--local') return { local: true };
  throw new ConfigError('Unknown argument. The only option is --local.');
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
