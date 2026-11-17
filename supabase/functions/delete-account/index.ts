// POST /functions/v1/delete-account
//
// Deletes the CALLER's account (D15). The caller is identified only from the
// request's own access token (auth.getUser); no id is ever read from the body.
// The secret key is used for exactly one call: auth.admin.deleteUser.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { corsHeaders as cors } from './cors.ts'
import { resolveKeys } from './keys.ts'

function config() {
  return resolveKeys((name) => Deno.env.get(name))
}

function corsHeaders(req: Request): Record<string, string> {
  return cors(req.headers.get('origin'), Deno.env.get('ALLOWED_ORIGIN'))
}

function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
  })
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) })
  }
  if (req.method !== 'POST') {
    return json(req, 405, { error: 'method_not_allowed' })
  }

  const cfg = config()
  if (!cfg) {
    console.error('delete-account: missing Supabase environment')
    return json(req, 500, { error: 'server_error' })
  }

  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '')
  if (!match) return json(req, 401, { error: 'unauthorized' })
  const token = match[1]

  // A client that acts as the caller: publishable key + the caller's token.
  const asUser = createClient(cfg.url, cfg.publishable, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: who, error: whoErr } = await asUser.auth.getUser(token)
  if (whoErr || !who.user) return json(req, 401, { error: 'unauthorized' })
  const uid = who.user.id

  const { data: blocker, error: blockerErr } = await asUser.rpc('account_deletion_blocker')
  if (blockerErr) {
    console.error('delete-account: blocker check failed')
    return json(req, 500, { error: 'server_error' })
  }
  if (blocker !== null) return json(req, 409, { error: blocker })

  const admin = createClient(cfg.url, cfg.secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error: delErr } = await admin.auth.admin.deleteUser(uid)
  if (delErr) {
    // e.g. the database refused (a last owner / sole member raced in).
    console.error('delete-account: deleteUser failed')
    return json(req, 409, { error: 'could_not_delete' })
  }
  return new Response(null, { status: 204, headers: corsHeaders(req) })
})
