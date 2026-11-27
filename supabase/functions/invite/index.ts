// POST /functions/v1/invite   body: { "email": string }
//
// An owner invites an address to their household. The caller is identified only
// from the request's own access token (auth.getUser); no id is read from the
// body. The invite row is inserted AS THE CALLER, so RLS and the table's
// trigger decide who may invite and the limits. Then the invitee is emailed.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { sendEmail } from '../_shared/email.ts'
import { corsHeaders as cors } from './cors.ts'
import { resolvePublicKeys } from './keys.ts'

// Stricter than the table's check constraint on purpose: the stored address
// must be exactly the one the mailer delivers to, so nothing the mailer would
// parse (commas, angle brackets, quotes, comments, line breaks) gets through.
const EMAIL_SHAPE = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/

// The link in the email: https, or plain http only for the local stack.
const APP_URL_OK = /^(https:\/\/|http:\/\/localhost\b|http:\/\/127\.0\.0\.1\b)\S*$/

// One line of plain text: control characters and runs of whitespace become one space.
const oneLine = (s: string) => s.replace(/[\p{Cc}\s]+/gu, ' ').trim()

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
  if (req.method !== 'POST') return json(req, 405, { error: 'method_not_allowed' })

  const cfg = resolvePublicKeys((name) => Deno.env.get(name))
  if (!cfg) {
    console.error('invite: missing Supabase environment')
    return json(req, 500, { error: 'server_error' })
  }

  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '')
  if (!match) return json(req, 401, { error: 'unauthorized' })
  const token = match[1]

  const asUser = createClient(cfg.url, cfg.publishable, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: who, error: whoErr } = await asUser.auth.getUser(token)
  if (whoErr || !who.user) return json(req, 401, { error: 'unauthorized' })
  const uid = who.user.id

  const appUrl = Deno.env.get('APP_URL') ?? ''
  if (!APP_URL_OK.test(appUrl)) {
    console.error('invite: APP_URL is missing or invalid')
    return json(req, 500, { error: 'server_error' })
  }

  let raw: unknown
  try {
    raw = (await req.json())?.email
  } catch {
    return json(req, 400, { error: 'bad_email' })
  }
  const email = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (!email || email.length > 254 || !EMAIL_SHAPE.test(email)) {
    return json(req, 400, { error: 'bad_email' })
  }

  const { data: householdId, error: hhErr } = await asUser.rpc('my_household_id')
  if (hhErr) {
    console.error('invite: household lookup failed')
    return json(req, 500, { error: 'server_error' })
  }
  if (!householdId) return json(req, 403, { error: 'forbidden' })

  const { data: row, error: insErr } = await asUser
    .from('invites')
    .insert({ household_id: householdId, email })
    .select('id')
    .single()
  if (insErr || !row) {
    const msg = insErr?.message ?? ''
    if (insErr?.code === '42501') return json(req, 403, { error: 'forbidden' })
    if (msg.includes('already_invited') || insErr?.code === '23505') {
      return json(req, 400, { error: 'already_invited' })
    }
    if (msg.includes('too_many_invites')) return json(req, 400, { error: 'too_many_invites' })
    console.error('invite: insert failed')
    return json(req, 500, { error: 'server_error' })
  }

  const [{ data: hh }, { data: me }] = await Promise.all([
    asUser.from('households').select('name').eq('id', householdId).maybeSingle(),
    asUser.from('profiles').select('display_name').eq('id', uid).maybeSingle(),
  ])
  const household = oneLine(hh?.name ?? '') || 'a household'
  const inviter = oneLine(me?.display_name ?? '') || 'Someone'

  try {
    await sendEmail({
      to: email,
      subject: "You're invited to a household on Bills",
      text: [
        `${inviter} invited you to join ${household} on Bills.`,
        '',
        `Open ${appUrl}`,
        '',
        'Sign in with this email address. The invite expires in 7 days.',
        '',
      ].join('\n'),
    })
  } catch {
    // Never log the address or the SMTP error text.
    console.error('invite: email failed')
    const { error: cancelErr } = await asUser
      .from('invites')
      .update({ cancelled_at: new Date().toISOString() })
      .eq('id', row.id)
    if (cancelErr) console.error('invite: cancel after email failure failed')
    return json(req, 502, { error: 'email_failed' })
  }
  return json(req, 200, { ok: true })
})
