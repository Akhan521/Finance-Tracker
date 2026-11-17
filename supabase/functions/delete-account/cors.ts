// CORS for delete-account. Pure (no Deno globals) so tests can import it.
// `allowedList` is the ALLOWED_ORIGIN env value: comma-separated exact origins.
export function corsHeaders(
  origin: string | null,
  allowedList: string | undefined,
): Record<string, string> {
  const allowed = (allowedList ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
  if (!origin || !allowed.includes(origin)) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}
