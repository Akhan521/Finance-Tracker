// Resolves the Supabase URL and API keys from the runtime environment. Pure
// (takes a lookup function, no Deno globals) so tests can import it.
export type Keys = { url: string; publishable: string; secret: string }

/**
 * A present SUPABASE_*_KEYS variable is parsed strictly. When several keys
 * exist, the one named "default" wins, else the first. Present but invalid
 * returns 'invalid' (the caller fails closed, with no fallback to the legacy
 * name). Absent returns undefined.
 */
function fromMap(raw: string | undefined, prefix: string): string | undefined | 'invalid' {
  if (raw === undefined) return undefined
  let map: unknown
  try {
    map = JSON.parse(raw)
  } catch {
    return 'invalid'
  }
  if (typeof map !== 'object' || map === null || Array.isArray(map)) return 'invalid'
  const m = map as Record<string, unknown>
  const value = 'default' in m ? m.default : Object.values(m)[0]
  if (typeof value !== 'string' || !value.startsWith(prefix)) return 'invalid'
  return value
}

/** Null means "fail closed": something is missing or malformed. */
export function resolveKeys(get: (name: string) => string | undefined): Keys | null {
  const url = get('SUPABASE_URL')
  const pub = fromMap(get('SUPABASE_PUBLISHABLE_KEYS'), 'sb_publishable_')
  const sec = fromMap(get('SUPABASE_SECRET_KEYS'), 'sb_secret_')
  if (pub === 'invalid' || sec === 'invalid') return null
  // Prefer the new keys (D30); legacy names only when the new variable is absent.
  const publishable = pub ?? get('SUPABASE_ANON_KEY')
  const secret = sec ?? get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !publishable || !secret) return null
  return { url, publishable, secret }
}

/**
 * The URL and publishable key only; never reads the secret key. For functions
 * that act as the caller and need no admin access. Null means "fail closed".
 */
export function resolvePublicKeys(
  get: (name: string) => string | undefined,
): { url: string; publishable: string } | null {
  const url = get('SUPABASE_URL')
  const pub = fromMap(get('SUPABASE_PUBLISHABLE_KEYS'), 'sb_publishable_')
  if (pub === 'invalid') return null
  const publishable = pub ?? get('SUPABASE_ANON_KEY')
  if (!url || !publishable) return null
  return { url, publishable }
}
