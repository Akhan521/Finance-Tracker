# Operations

How the live copy is set up and kept safe. Values that identify the live
deployment (project ref, URLs, the sender address, family emails) never go
here (D32); this file names things and says where they live.

## Accounts

All held by Aamir, each with a strong unique password in Apple Passwords.

| Account | Protection | Used for |
|---|---|---|
| Dedicated Gmail sender | 2-Step Verification; app password "Supabase" | Sends sign-in codes, invites, reminders |
| Supabase (owner of project A, Free plan) | 2FA (authenticator app) | Database, Auth, Edge Functions |
| GitHub (`Akhan521`) | Secret scanning and push protection on the repo | Code, CI |

## Secrets

Names and where they live. Never the values.

| Name | Lives in | Used by |
|---|---|---|
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | Supabase Edge Function secrets | `_shared/email.ts` (`smtp.gmail.com`, `465`, `true`) |
| `SMTP_USER` | Supabase Edge Function secrets | `_shared/email.ts` (the sender Gmail address) |
| `SMTP_PASS` | Supabase Edge Function secrets; Apple Passwords | `_shared/email.ts` (the Gmail app password) |
| `MAIL_FROM_NAME` | Supabase Edge Function secrets | `_shared/email.ts` (`Bills`) |
| Auth SMTP password | Supabase dashboard (Auth → SMTP) | Sign-in code emails (same app password) |

Set function secrets with `npx supabase secrets set --env-file <file outside
the repo>`, then delete the file. If the app password might be exposed,
revoke it at myaccount.google.com/apppasswords, make a new one, and update
both places above.

## Production settings checklist

The live project does **not** read `supabase/config.toml`. Set and check each
of these by hand in the dashboard (verified 2026-11-05 unless noted).

**Authentication → Sign In / Providers**
- [x] Email: the only provider enabled (Phone, SAML, Web3, and every social
  provider disabled)
- [x] Allow new users to sign up: on (the invite-only hook in V5 does the
  gating)
- [x] Allow manual linking: off
- [x] Allow anonymous sign-ins: off
- [x] Confirm email: on
- [x] Secure email change: on
- [x] Email OTP expiration: `600` seconds
- [x] Email OTP length: `6`

**Authentication → Rate Limits**
- [x] Rate limit for sending emails: `10` per hour (D32)
- [x] Minimum interval per user: `60` seconds
- [x] Token verifications: `30` per 5 minutes per IP (default; observed
  ~30 in V3)

**Authentication → Emails → SMTP Settings**
- [x] Custom SMTP on: `smtp.gmail.com`, port `465`, sender name `Bills`, the
  Gmail address as sender and username, the app password

**Authentication → Emails → Templates**
- [x] Magic link or OTP, Confirm sign up: subject "Your Bills sign-in code",
  body = `supabase/templates/code.html`
- [x] Invite user, Change email address, Reset password, Reauthentication:
  subject "Your Bills code", body = `supabase/templates/code.html`

**Authentication → Auth Hooks** (verified 2026-11-06)
- [x] Before User Created: enabled, Postgres, `public.hook_before_user_created`
  (from migration `sign_up_gate`; applied with `npx supabase db push --linked`)

**The approved list.** Emails that may sign up without an invite live in
`public.approved_emails`. Manage them in the SQL editor, always lowercase:
`insert into public.approved_emails (email) values ('<email>');`. No client
can read or change this table.

## Restore
