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
| Cloudflare (Free plan, no card) | 2FA (authenticator app) | Workers static assets hosting for the app (D35). The Mac's wrangler login is limited to `account:read`, `user:read`, `workers_scripts:write` (plus `offline_access`); wrangler telemetry is off |

## Secrets

Names and where they live. Never the values.

| Name | Lives in | Used by |
|---|---|---|
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | Supabase Edge Function secrets | `_shared/email.ts` (`smtp.gmail.com`, `465`, `true`) |
| `SMTP_USER` | Supabase Edge Function secrets | `_shared/email.ts` (the sender Gmail address) |
| `SMTP_PASS` | Supabase Edge Function secrets; Apple Passwords | `_shared/email.ts` (the Gmail app password) |
| `MAIL_FROM_NAME` | Supabase Edge Function secrets | `_shared/email.ts` (`Bills`) |
| Auth SMTP password | Supabase dashboard (Auth → SMTP) | Sign-in code emails (same app password) |
| `health_token` | Supabase Vault (project A); Apple Passwords | `public.health_check`, the daily health workflow |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `HEALTH_TOKEN` | GitHub repo secrets | `.github/workflows/daily-health.yml` (`HEALTH_TOKEN` equals the Vault `health_token`) |

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

**Database → Vault and tables**
- [ ] Vault secret `health_token` exists (see "Keep-alive and health").
- [ ] Migration `health` applied: `public.job_runs` records each reminder and
  maintenance run, and the daily health workflow reads it through
  `health_check`.

**The approved list.** Emails that may sign up without an invite live in
`public.approved_emails`. Manage them in the SQL editor, always lowercase:
`insert into public.approved_emails (email) values ('<email>');`. No client
can read or change this table.

## Keep-alive and health

**What runs.** `.github/workflows/daily-health.yml` runs every day at 17:00
UTC (about an hour after the 8 a.m. PST reminder run, D29). It POSTs to the
database function `public.health_check`, which counts as activity, so the free
Supabase project does not pause after 7 idle days (D27, D31). The function
returns only `ok`, `last_reminders_ok_at`, `last_maintenance_ok_at` and
`failures_24h`. Its table, `public.job_runs`, is where the reminder and
maintenance jobs record each run (Task 21 writes to it); no client can read it.

**Repo secrets it needs** (Settings → Secrets and variables → Actions):
`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `HEALTH_TOKEN`. No secret API key
is ever given to GitHub Actions.

**Create the token without it passing through anyone.** Generate it on your
own machine, store it in Apple Passwords, and paste it straight into the two
places that need it:
1. `openssl rand -hex 32` in a terminal (copy it; do not paste it into chat).
2. Preferred: Supabase dashboard → Integrations → Vault → Add secret, name
   `health_token`, value the token. This keeps it out of SQL editor history.
   Alternative: in the SQL editor, `select vault.create_secret('<token>', 'health_token');`
   (it stays in the editor's history; delete that entry afterward). To rotate,
   edit the secret in the Vault UI or use
   `select vault.update_secret(id, '<new token>') from vault.secrets where name = 'health_token';`,
   then update the GitHub secret to match.
3. GitHub: `gh secret set HEALTH_TOKEN` (it prompts; paste the same token), or
   the repo settings page.

**Run it by hand.** Actions tab → "daily health" → Run workflow
(`workflow_dispatch`), or `gh workflow run daily-health.yml`. Green means the
request succeeded and the token matched.

**The watchdog is off until Task 23.** The workflow's `WATCHDOG_ENFORCE` is
`'false'`: it keeps the project awake and fails on an HTTP error or a wrong
token, but it does not fail when `ok` is false, because no reminder or
maintenance runs exist yet. Task 23 flips it to `'true'`.

**Warnings.**
- If GitHub emails that a workflow will be disabled, re-enable it by hand. A
  workflow re-enabled by the bot may send its failure emails to the bot
  instead of Aamir.
- Changing the Gmail password cancels its app passwords. Create a new one and
  update Supabase's SMTP setting and the function secrets right away, or
  sign-in codes, invites, and reminders stop.

## Deploy

The app is a static build served by a Cloudflare Worker with static assets only
(free plan, D35). The deploy script is `scripts/deploy.mjs`. Nothing that
identifies the live deployment is committed (D32): the values live in the
git-ignored `.env.production.local`, and the Worker config is generated into the
git-ignored `.wrangler/` folder for each run and deleted afterwards.

**`.env.production.local` holds three names:**
- `VITE_SUPABASE_URL`: the project's `https://<project-ref>.supabase.co`
  address, no path.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: the `sb_publishable_...` key only. The
  script refuses a secret key.
- `WORKER_NAME`: the Worker's name, a lowercase slug (1 to 63 letters, digits
  or dashes).

**Commands.**
- `npm run preview:prod`: builds with the local stack's `.env.local`, applies
  the security headers, checks the bundle for secrets, and serves it at
  `http://localhost:8788` with `wrangler dev`. No Cloudflare account is needed.
- `npm run deploy -- --check`: the full production pipeline (clean `main`,
  `.env.production.local` only, checks, build, secret scan) ending in
  `wrangler deploy --dry-run`. Nothing is uploaded.
- `npm run deploy`: the same, then `npx wrangler deploy`. It refuses to run
  unless the current branch is `main` and the working tree is clean, and it
  rejects any argument other than `--local` or `--check` (never both).
  Wrangler's stdin is disconnected.

**Why the deploy has these guards.**
- Wrangler auto-answers its own prompts when it isn't in an interactive
  terminal. Silent subdomain auto-registration happens only when wrangler
  detects an AI agent from environment variables (it then registers a
  workers.dev subdomain from the package name, with no prompt). A plain
  non-interactive shell declines and fails instead. So the script gives every
  wrangler process an allowlisted environment with no agent markers.
- The dry run (`wrangler deploy --dry-run`) validates the config and assets
  only. Account-side prompts (subdomain, overwrite) first appear on the real
  deploy. The script therefore also watches the real deploy's output (URLs, keys,
  emails, the Worker name and local paths are redacted) and exits non-zero
  with a warning if a prompt was auto-confirmed or a subdomain registration
  was mentioned. Check the account by hand if that happens.
- Both runs use `--strict`, so overwrite and secret confirms abort instead of
  returning yes. Wrangler writes no log files and no metrics, and the generated
  `.wrangler/deploy/` folder is removed after every run, including on Ctrl-C.

**Steps that need Aamir.**
1. Create a free Cloudflare account (no card).
2. Run `npx wrangler telemetry disable` once.
3. Run `npx wrangler logout`, then
   `npx wrangler login --scopes account:read user:read workers_scripts:write`.
4. In the Cloudflare dashboard (Workers & Pages, then the subdomain setting),
   set the account's workers.dev subdomain yourself, with a name that doesn't
   identify you. Also confirm that no Worker named `WORKER_NAME` exists yet.
5. Fill in `.env.production.local`. Run `npm run deploy -- --check`, then
   `npm run deploy`, yourself in a separate macOS Terminal window (not through
   Claude Code and not with `!`).
6. Find the live address in the Cloudflare dashboard (the Worker's Settings,
   then Domains & Routes), since the script redacts it from its output. Set
   Supabase Auth Site URL to that workers.dev address.

## Restore
