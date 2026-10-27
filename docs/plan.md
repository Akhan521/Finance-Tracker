# Household Bill Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build v1 of the household bill tracker in `docs/design.md`: a free,
invite-only, installable web app with a month calendar, shared household bills,
private personal bills, and email reminders, with access rules enforced by the
database.

**Architecture:** A static React app (Cloudflare Pages) talks directly to
Supabase with the public key. Postgres row-level security is the security
boundary. Every write that spans rows or needs extra checks goes through a
`security definer` SQL function. Three Edge Functions need secrets: invite
email, account deletion, and the hourly reminder run. GitHub Actions run CI,
a daily keep-alive and watchdog, and a weekly encrypted backup.

**Tech Stack:** Supabase (Postgres 17, Auth email OTP, Edge Functions/Deno,
pg_cron, pg_net, Vault), React 19 + TypeScript + Vite, vite-plugin-pwa, React
Router, TanStack Query, Vitest + Testing Library, nodemailer (in Edge
Functions), GitHub Actions, Backblaze B2, `age`, Cloudflare Pages (wrangler).

**Spec:** `docs/design.md` (approved 2026-10-25). Builder decisions made for
this plan: D23–D28 in `docs/decisions/`. Read both before starting a task.

## Global Constraints

- **$0/month.** Supabase Free, Cloudflare Pages Free, Backblaze B2 free tier
  (≤10 GB, no card), GitHub Actions on a public repo, a dedicated Gmail
  account. Nothing that needs a card on file.
- **The repo is public.**
  - Never commit secrets, keys, `.env` files, real names or emails, or
    database dumps.
  - Test data uses random `@test.local` addresses.
  - Action logs and artifacts are public: never print secrets or data, and
    never `upload-artifact` a dump.
- **Only the public anon key ships in the app.** The service-role key
  exists only in Supabase's Edge Function environment (it's injected
  automatically). GitHub Actions never get the service-role key (D27, D26).
- **RLS on every table in `public`; no exceptions.**
  - Clients get only the column grants listed in this plan.
  - Every `security definer` function sets `search_path = ''`, uses
    schema-qualified names, and is `revoke`d from `public`/`anon` unless this
    plan says otherwise.
  - Views use `security_invoker = true`.
- **Never use `user_metadata` / `raw_user_meta_data` for any access
  decision.** The only use is the sign-up time zone hint, validated.
- **Emails are compared as `lower(trim(email))`** everywhere (D23).
- **Money is integer cents** (`bigint` in SQL, `number` in TS); USD only.
- **Status and time:** "today" for a bill is the local date in its scope's
  time zone: the household's for household bills, the owner's profile for
  personal ones.
- **OTP:** 6 digits, 600-second expiry, 60 s between requests. Email
  templates show the code only, with **no link** (D18).
- **Email confirmation stays ON** in Supabase Auth. Otherwise a password
  `signUp` for an invited address could claim it without owning the inbox.
- **Emails are plain text.** They never include last-4 digits.
- **No third-party requests from the app** (system fonts, no analytics). The
  service worker caches the app's own files only, never Supabase responses.
- **Errors raised from SQL** use `raise exception '<key>'` with a key from
  this plan. The app maps keys to calm copy in `src/lib/errors.ts`.
- **Commits:** small, one task step each where it says "Commit". Author
  `Aamir Khan <aamirksfg@gmail.com>` (check `git config user.email` first).
  Use plain imperative subjects like the existing history ("Add …"), not
  `feat:` prefixes. **Ask Aamir before every `git push`.**
- **New decisions** go in `docs/decisions/NNN-slug.md` plus a row in
  `docs/SNAPSHOT.md`, committed separately.
- **Working name:** "Bills" (manifest name, email sender name, page title).
  Aamir can rename it anytime; it's one constant in `src/lib/config.ts`
  and one Edge Function env var.

## Review Focus

1. **Email addresses typed differently** (`" Mom@Gmail.com"` vs an invite to
   `mom@gmail.com`). The sign-up gate, invites, and accepting must all treat
   them as the same address. *Tests: V5 and Task 3.*
2. **Time-zone edges.** A bill due today is still *upcoming* at 11 p.m.
   Pacific, even though it's already tomorrow in UTC. Reminders use the
   person's local date. *Tests: Task 6 (status) and Task 21 (reminders).*
3. **Text that looks like code or a formula** in bill names or display
   names (`<b>x</b>`, `=HYPERLINK(...)`). It shows as text in the app, as
   plain text in emails, and is neutralized in CSV. *Tests: Task 10 (CSV)
   and Task 21 (email body).*
4. **Money typed the way people type it** (`$1,980`, `1980.5`, `12.345`,
   `-5`, `0`, empty). Parse to cents or refuse clearly; never store a float
   or a negative. *Tests: Task 10.*
5. **Repeated or overlapping reminder runs** (cron retry, a manual rerun,
   two at once) never send a duplicate. A failed send is retried next hour.
   *Tests: Task 21.*

---

## Build order at a glance

| Phase | Tasks | Outcome |
|---|---|---|
| 0. Groundwork | 1 | Repo, tooling, CI, secret scan |
| 1. Verify early (design §11) | V1–V5 | Gmail SMTP, pausing, OTP limits, iPhone install, invite-only gate proven on real services |
| 2. Database and security | 2–9 | Schema, RLS, SQL functions, every §9 security test green |
| 3. App | 10–20 | All screens from design §7 |
| 4. Jobs and operations | 21–24 | Reminders, retention, watchdog, backups |
| 5. Release | 25–26 | Security headers, production config, acceptance run on iPhones |

**V2 needs at least 8 calendar days of watching.** Start it, then carry on
with Phase 2 while it runs. Record every verify-early result in
`docs/verify-early.md` (one section per check: date, what was done, result,
anything that changes the plan). If a result breaks an assumption, stop and
raise it with Aamir before building on it.

### §9 security acceptance criteria → where each is proven

| Design §9 requirement | Test file · task |
|---|---|
| RLS on every table; no table readable/writable without a policy | `tests/security/schema.test.ts` · Task 9 |
| Member can't read another member's personal bills (and entries, payments, categories, history) | `tests/security/bills.test.ts`, `payments.test.ts` · Tasks 4, 6, 7 |
| Former member immediately loses household read access | `tests/security/membership.test.ts`, `bills.test.ts` · Tasks 3, 4 |
| Non-owner can't invite, cancel, remove, or change roles; only owners see invites | `tests/security/membership.test.ts` · Tasks 2, 3 |
| Non-invited email can't join; only the matching email can accept | `tests/security/membership.test.ts` · Task 3 |
| Unknown email gets no email and no account | `tests/security/sign-up-gate.test.ts` · V5, Task 3 |
| Last-owner protections enforced in the database | `tests/security/membership.test.ts`, `deletion.test.ts` · Tasks 2, 8 |
| App ships only the anon key; nothing secret committed | `tests/security/schema.test.ts` (bundle scan) + CI gitleaks · Tasks 1, 25 |

---

## File structure

```
.github/workflows/ci.yml            typecheck, unit + db tests, gitleaks (Task 1)
.github/workflows/daily-health.yml  keep-alive + watchdog + workflow re-enable (V2, Task 23)
.github/workflows/backup.yml        weekly encrypted dump to B2 (Task 24)
docs/plan.md · docs/verify-early.md · docs/operations.md (setup, secrets, restore)
public/                              icons (192, 512, apple-touch 180)
scripts/write-headers.mjs            writes dist/_headers with CSP for the project URL (Task 25)
src/
  main.tsx · App.tsx                 router, QueryClient, session gate
  lib/config.ts                      APP_NAME, env reads (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
  lib/supabase.ts                    typed client
  lib/database.types.ts              generated: npx supabase gen types typescript --local
  lib/errors.ts                      SQL error key → copy
  lib/money.ts · calendar.ts · totals.ts · csv.ts   pure logic, unit-tested
  lib/queries.ts                     TanStack Query hooks (one per read/write below)
  ui/theme.css                       tokens: cream, pastels, status colors, category palette
  ui/GroupedList.tsx · Sheet.tsx · Switch.tsx · OfflineBanner.tsx · Picker.tsx
  auth/SignIn.tsx · NameStep.tsx · useSession.ts
  home/Home.tsx · CalendarView.tsx · DonutView.tsx · Totals.tsx · DayList.tsx
  bills/PaySheet.tsx · NewBill.tsx · EditBill.tsx · BillRows.tsx · HistoryTimeline.tsx
  settings/Settings.tsx · HouseholdScreen.tsx · ArchivedBills.tsx · DeleteAccount.tsx · InviteBanner.tsx
supabase/
  config.toml                        local Auth settings mirror production (Task 1, V3, V5)
  templates/code.html                OTP email body: the code, no link
  migrations/*.sql                   one per task, created with `npx supabase migration new <slug>`
  seed.sql                           local-only Vault values for cron (Task 21)
  functions/_shared/email.ts         sendEmail() over SMTP
  functions/_shared/reminder-email.ts  pure: builds reminder/heads-up text (Vitest-tested)
  functions/invite/index.ts · delete-account/index.ts · daily/index.ts
  functions/.env.example             local function env (Mailpit), copied to .env (git-ignored)
tests/
  helpers/env.ts                     globalSetup: reads `npx supabase status -o env`
  helpers/db.ts                      sql, admin, newUser, newHousehold, addMember, newBill, mailbox
  security/*.test.ts                 §9 acceptance tests
  db/*.test.ts                       schedule, status, history, reminders, retention, functions
vitest.config.ts                     projects: "unit" (src, jsdom) and "db" (tests, node, single thread)
```

## Data model (shared interfaces)

Every later task relies on these names. They're built in Tasks 2–8 and
21–22.

**Tables (`public`)**

| Table | Columns (constraints) | Client access |
|---|---|---|
| `profiles` | `id uuid pk → auth.users on delete cascade`, `display_name text null (1–40 chars trimmed)`, `time_zone text not null default 'UTC'`, `remind_household bool default false`, `remind_personal bool default true`, `lead_days int default 7 (1–14)`, `retention_months int null default 36 (12–120; null = never)`, `last_view text default 'household' ('household'\|'mine')`, `created_at` | select self + same-household; update own (all listed columns except `id`, `created_at`) |
| `households` | `id uuid pk`, `name text (1–40)`, `time_zone text not null`, `retention_months int null default 36 (12–120)`, `created_at` | select members; update owners (`name`, `retention_months`) |
| `memberships` | `household_id → households cascade`, `profile_id → profiles cascade`, `role text ('owner'\|'member')`, `joined_at`; pk `(household_id, profile_id)`; unique `(profile_id)` | select members + self; update `role` owners; delete owners or self |
| `approved_emails` | `email text pk (lowercase)` | none (admin via SQL editor) |
| `invites` | `id uuid pk`, `household_id → households cascade`, `email text (lower/trim, basic shape, ≤254)`, `invited_by → profiles set null`, `created_at`, `expires_at default now()+7 days`, `accepted_at`, `cancelled_at`; unique pending `(household_id, email)` | select/insert owners; update `cancelled_at` owners |
| `categories` | `id uuid pk`, `household_id null → households cascade`, `owner_id null → profiles cascade`, `name text (1–30)`, `color text '^#[0-9a-fA-F]{6}$'`, `is_credit_card bool default false`; exactly one scope; unique `(scope, lower(name))` | select/insert (`household_id, owner_id, name, color`) / update (`name, color`) in scope |
| `bills` | `id uuid pk`, `household_id null → households cascade`, `owner_id null → profiles cascade`, `category_id → categories restrict`, `name text (1–60)`, `usual_cents bigint (1–99,999,999)`, `schedule text ('monthly'\|'weeks'\|'yearly'\|'once')`, `every_weeks int null (1–52; required iff 'weeks')`, `anchor_date date`, `nickname text null (≤40)`, `last4 text null '^[0-9]{4}$'`, `pay_url text null ('^https://\S+$', ≤500)`, `is_credit_card bool` (set by trigger from category), `archived_at timestamptz null`, `created_at`; exactly one scope | select/insert/update in scope; insert cols exclude `is_credit_card, archived_at`; update cols exclude `household_id, owner_id, is_credit_card`; no delete |
| `entries` | `id uuid pk`, `bill_id → bills cascade`, `due_date date`, `expected_cents bigint ≥0`, `minimum_cents bigint null >0`, `statement_cents bigint null ≥0`; unique `(bill_id, due_date)` | select in scope; update `minimum_cents, statement_cents` (credit card bills only) |
| `payments` | `id uuid pk`, `entry_id → entries cascade`, `amount_cents bigint (1–99,999,999)`, `paid_on date`, `paid_by uuid null → profiles set null` (forced to `auth.uid()` by trigger), `created_at` | select/insert (`entry_id, amount_cents, paid_on`)/delete in scope |
| `history` | `id bigint identity`, `household_id null → households cascade`, `owner_id null → profiles cascade`, `bill_id null → bills cascade`, `actor_id null → profiles set null`, `kind text`, `detail jsonb default '{}'`, `created_at`; exactly one scope | select in scope; no writes |
| `job_runs` | `id bigint identity`, `job text ('reminders'\|'maintenance')`, `started_at`, `finished_at`, `ok bool`, `detail text` | none |
| `digest_sends` | `profile_id → profiles cascade`, `local_date date`; pk both | none |
| `reminder_sends` | `entry_id → entries cascade`, `profile_id → profiles cascade`, `kind text ('lead'\|'due'\|'overdue')`, `local_date date`, `sent_at`; pk `(entry_id, profile_id, kind)` | none |
| `heads_up_sends` | `scope_key text pk` (`'household:<uuid>'`/`'personal:<uuid>'`), `sent_at` | none |

"In scope" means `(household_id is not null and public.is_member(household_id)) or owner_id = auth.uid()`;
for `entries`/`payments` it's via `public.can_access_bill(bill_id)`.

**History `kind` values and `detail`:** `bill_created {}` ·
`bill_changed {field, old, new}` (one row per field; for `last4` and
`pay_url`, only `{field}`) · `bill_archived` · `bill_restored` ·
`payment_added {amount_cents, paid_on, due_date}` · `payment_removed {same}`
· `invite_sent {email}` · `invite_cancelled {email}` · `member_joined
{profile_id}` · `member_left {profile_id}` · `member_removed {profile_id}` ·
`role_changed {profile_id, old, new}`.

**View `entry_view`** (`security_invoker = true`): `id, bill_id, due_date,
bill_name, household_id, owner_id, category_id, is_credit_card, archived_at,
expected_cents, minimum_cents, statement_cents, paid_cents` (sum of
payments, 0 if none), `target_cents` (the minimum if it's a credit card with
a minimum entered, else `expected_cents`), and `status` (`'paid' | 'overdue'
| 'upcoming'`):
- **paid:** the credit card has a minimum and `paid_cents ≥ minimum_cents`,
  or (otherwise) `paid_cents > 0`.
- **overdue:** not paid and `scope_today > due_date`.
- **upcoming:** otherwise.

**SQL functions** (all `security definer`, `search_path = ''`, executable by
`authenticated` only unless noted).

| Signature | Errors (keys) |
|---|---|
| `is_member(p_household uuid) → boolean` · `is_owner(p_household uuid) → boolean` · `my_household_id() → uuid` | none |
| `can_access_bill(p_bill uuid) → boolean` | none |
| `scope_today(p_household uuid, p_owner uuid) → date` | none |
| `create_household(p_name text, p_time_zone text) → uuid` | `already_in_household`, `bad_time_zone` |
| `household_names() → table(profile_id uuid, display_name text)` | none |
| `my_invites() → table(id uuid, household_name text, invited_by_name text, expires_at timestamptz)` | none |
| `accept_invite(p_invite uuid) → uuid` | `invite_not_found` (also for wrong email/expired/cancelled), `already_in_household`, `email_not_confirmed` |
| `delete_household(p_household uuid) → void` | `not_sole_owner` |
| `account_deletion_blocker() → text` (`null`, `'last_owner'`, `'sole_member'`) | none |
| `due_dates(p_schedule text, p_every_weeks int, p_anchor date, p_from date, p_through date) → setof date` (immutable, *not* definer) | none |
| `status_rule(p_is_card bool, p_minimum bigint, p_paid bigint, p_due date, p_today date) → text` (immutable, *not* definer; the one copy of the status rule) | none |
| `entry_status_at(p_entry uuid, p_now timestamptz) → text` | test-only use; no client execute |
| `generate_entries(p_bill uuid, p_from date) → void` · `extend_entries() → void` | internal, no client execute |
| `hook_before_user_created(event jsonb) → jsonb` | `supabase_auth_admin` only |
| `claim_reminders(p_now timestamptz)` · `release_reminders(p_profile uuid, p_local_date date)` · `claim_heads_ups(p_now timestamptz)` · `record_job_run(p_job text, p_ok bool, p_detail text)` | `service_role` only |
| `run_maintenance() → void` | cron (postgres) only |
| `health_check(p_token text) → jsonb` | executable by `anon`; `forbidden` |

Other error keys raised by triggers: `last_owner`, `household_needs_member`,
`category_scope_mismatch`, `too_many_invites`, `already_invited`,
`not_credit_card`.

---

## Phase 0: Groundwork

### Task 1: Repo, tooling, and CI

**Files:**
- Create: `package.json`, `vite.config.ts`, `vitest.config.ts`, `tsconfig*.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/lib/config.ts`, `src/lib/config.test.ts`, `supabase/config.toml` (via `npx supabase init`), `supabase/templates/code.html`, `supabase/functions/.env.example`, `.env.example`, `.github/workflows/ci.yml`, `docs/operations.md`
- Modify: `.gitignore`, `README.md`

**Interfaces:**
- Produces: `npm run dev | build | typecheck | test | test:db | deploy`;
  `APP_NAME = 'Bills'`; `SUPABASE_URL`, `SUPABASE_ANON_KEY` exports from
  `src/lib/config.ts`, which throw at startup if missing.

- [ ] **Step 1: Install a free Docker runtime and confirm it.** Use Docker
  Desktop (free for personal use), Colima, or OrbStack. Run `docker info`.
  Expected: server info, no error.
- [ ] **Step 2: Scaffold.** Run `npm create vite@latest . -- --template react-ts`
  (keep the existing files). Then add dev dependencies: `supabase`,
  `vitest`, `@testing-library/react`, `@testing-library/user-event`,
  `jsdom`, `vite-plugin-pwa`, `wrangler`, `postgres`. Add dependencies:
  `@supabase/supabase-js`, `@tanstack/react-query`, `react-router`. Then
  run `npx supabase init`.
- [ ] **Step 3: Write the failing test** `src/lib/config.test.ts`:

```ts
test('config throws a clear error when the Supabase URL is missing', async () => {
  vi.stubEnv('VITE_SUPABASE_URL', '');
  await expect(import('./config?missing')).rejects.toThrow(/VITE_SUPABASE_URL/);
});
test('APP_NAME is Bills', async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'http://x'); vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'k');
  expect((await import('./config')).APP_NAME).toBe('Bills');
});
```

- [ ] **Step 4: Run** `npx vitest run --project unit`. Expected: FAIL (no
  `config.ts`).
- [ ] **Step 5: Implement `src/lib/config.ts`.** Configure
  `vitest.config.ts` with two projects:
  - `unit`: `src/**/*.test.{ts,tsx}`, jsdom.
  - `db`: `tests/**/*.test.ts`, node, `fileParallelism: false`,
    `globalSetup: tests/helpers/env.ts`, `passWithNoTests: true`.

  Scripts: `test` = unit, `test:db` = db, `typecheck` = `tsc -b`.
- [ ] **Step 6: Run** `npm test && npm run typecheck && npm run build`.
  Expected: PASS, and `dist/` is built.
- [ ] **Step 7: Lock local Auth to the production settings** in
  `supabase/config.toml`:
  - `[auth] enable_signup = true`, `jwt_expiry = 3600`,
    `enable_anonymous_sign_ins = false`.
  - `[auth.email] enable_confirmations = true`, `double_confirm_changes = true`,
    `otp_length = 6`, `otp_expiry = 600`, `max_frequency = "60s"`.
  - `[auth.email.template.magic_link]` and `[auth.email.template.confirmation]`
    → `content_path = "./supabase/templates/code.html"`.
  - Every `[auth.external.*]` provider and SMS: `enabled = false`.

  `code.html` shows `{{ .Token }}`, a line saying it expires in 10 minutes,
  and no `{{ .ConfirmationURL }}`.
- [ ] **Step 8: Run** `npx supabase start`, then `npx supabase status`.
  Expected: API, DB, Studio, and the mail catcher (Mailpit, port 54324)
  URLs are listed.
- [ ] **Step 9: Secret hygiene.**
  - `.gitignore` adds `.env`, `.env.*`, `!.env.example`,
    `supabase/functions/.env`, `supabase/.temp/`, `dist/`, `*.age`,
    `*.sql.gz`, `backup*`.
  - `.env.example` lists `VITE_SUPABASE_URL=` and `VITE_SUPABASE_ANON_KEY=`.
  - Run `git check-ignore .env .env.production.local supabase/functions/.env`.
    Expected: all three are printed.
- [ ] **Step 10: CI.** In `ci.yml`, on push and PR: checkout, set up Node,
  `npm ci`, `npm run typecheck`, `npm test`, `npx supabase start`,
  `cp supabase/functions/.env.example supabase/functions/.env`,
  `npx supabase db reset`, `npm run test:db`. Then run gitleaks (download
  the release binary; `gitleaks detect --redact`). It uses no repository
  secrets.
- [ ] **Step 11: Start `docs/operations.md`**, with sections Accounts,
  Secrets (name → where it lives, never the value), Production settings
  checklist, and Restore. Each starts empty. Add a README paragraph: what
  the app is, that it's invite-only, and "self-hosting guide: later."
- [ ] **Step 12: Commit.** `git add -A && git commit -m "Scaffold the app, local Supabase, tests, and CI"`

---

## Phase 1: Verify early (design §11)

These need real accounts. **Aamir does the account steps**, which involve
passwords and 2-step verification. The builder does the rest and writes the
results in `docs/verify-early.md`.

### Task V1: Gmail SMTP from Supabase Auth and from an Edge Function

**Files:**
- Create: `docs/verify-early.md`, `supabase/functions/_shared/email.ts`, `supabase/functions/smtp-check/index.ts` (deleted again in Step 7)

**Interfaces:**
- Produces: `sendEmail(msg: { to: string; subject: string; text: string }): Promise<void>`
  in `_shared/email.ts`. It reads env `SMTP_HOST, SMTP_PORT, SMTP_SECURE,
  SMTP_USER, SMTP_PASS, MAIL_FROM_NAME`, uses `npm:nodemailer`, and
  sends plain text only. It throws on failure.

- [ ] **Step 1 (Aamir):** Create the dedicated Gmail account. Turn on 2-Step
  Verification and create an app password named "Supabase". Store both in
  Apple Passwords.
- [ ] **Step 2 (Aamir):** Create Supabase project **A** (production, Free
  plan), with a strong unique password and 2FA on the Supabase account.
  Then run `npx supabase link --project-ref <ref>`.
- [ ] **Step 3: Configure Auth SMTP on project A** (Dashboard → Auth → SMTP):
  host `smtp.gmail.com`, port `465`, the Gmail address as user and sender,
  the app password, and sender name `Bills`. Paste `code.html` into the
  Magic Link and Confirm Signup templates.
- [ ] **Step 4: Test Auth email.** Add Aamir's personal address to the
  dashboard's Users list. Run
  `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })`
  (a scratch script that reads keys from env). Expected: a 6-digit code
  arrives in the inbox (not spam) within a minute, with no link in it.
- [ ] **Step 5: Implement `sendEmail`.** Write `smtp-check` to call it once
  for the address in its request body, and to require the header
  `x-check-secret` to match env `CHECK_SECRET`. Set function secrets with
  `npx supabase secrets set --env-file <scratch file outside the repo>`.
  Deploy with `npx supabase functions deploy smtp-check --no-verify-jwt`.
- [ ] **Step 6: Run** `curl -X POST <functions-url>/smtp-check -H "x-check-secret: …" -d '{"to":"<aamir>"}'`.
  Expected: 200, and the email arrives.
  - **If port 465 is refused,** try 587 with STARTTLS. Edge Functions are
    known to block 25 and 587.
  - Record which port works.
- [ ] **Step 7: Clean up.** Delete the function from project A
  (`npx supabase functions delete smtp-check`) and remove its folder. Then
  record in `verify-early.md`: the working port, delivery time, spam
  placement, and Gmail's current sending limit (from Google's help page,
  with the date checked).
- [ ] **Step 8: Commit.** `git add supabase/functions/_shared/email.ts docs/verify-early.md && git commit -m "Verify Gmail SMTP from Supabase Auth and Edge Functions"`

### Task V2: Keep-alive versus free-plan pausing (runs ≥ 8 days in the background)

**Files:**
- Create: `.github/workflows/daily-health.yml` (first version)

**Interfaces:**
- Produces: a workflow that reads repo secrets `SUPABASE_URL`,
  `SUPABASE_ANON_KEY`, and `HEALTH_TOKEN`, and POSTs
  `/rest/v1/rpc/health_check` with `{"p_token": …}`. Task 23 hardens it.

- [ ] **Step 1 (Aamir):** Create Supabase project **B** ("pause-test",
  Free), which uses the second free project slot. **Nobody opens its
  dashboard during the test.**
- [ ] **Step 2: In B's SQL editor**, create a stand-in health function, a
  `ping_log(at timestamptz)` table, and a pg_cron job:
  - `health_check(p_token text) returns jsonb` (returns `{"ok": true}` when
    the token matches a Vault secret, else raises `forbidden`), granted to
    `anon`.
  - The pg_cron job inserts into `ping_log` hourly. It stands in for the
    hourly reminder job.
- [ ] **Step 3: Write the workflow.** Triggers: `schedule: cron '30 15 * * *'`
  and `workflow_dispatch`. One step: `curl --fail-with-body -sS` to the RPC,
  piped to `jq -e '.ok == true'`.
  - Never `echo` secrets. Mask the response (`::add-mask::`) before any
    output.
- [ ] **Step 4: Commit.** `git add .github/workflows/daily-health.yml && git commit -m "Add the daily keep-alive check"`
- [ ] **Step 5: Ask Aamir before pushing.** This is the first push of code.
  Once he agrees, add the repo secrets for project **B**, push, and run the
  workflow manually. Expected: green run.
- [ ] **Step 6: Observe for at least 8 days.** Check daily that the Action is
  green, with no "inactive project" email from Supabase and no pause.
  Record the result in `verify-early.md` and commit it ("Record the
  keep-alive result"). **If B gets a pause warning,** stop and revisit D27
  with Aamir before Task 23.
- [ ] **Step 7: When done:** delete project B and point the secrets at
  project A (Task 23 does this).

### Task V3: OTP expiry, rate limits, and session cleanup

**Files:**
- Modify: `docs/verify-early.md`, `docs/operations.md` (Production settings checklist)

- [ ] **Step 1: Set project A's Auth settings** to match `config.toml`
  (Task 1 Step 7): Email OTP expiration `600`, OTP length `6`, Confirm
  email ON, Secure email change ON, anonymous sign-ins OFF, and all other
  providers OFF. Copy each setting into the operations checklist.
- [ ] **Step 2: Expiry.** Request a code, wait 11 minutes, and enter it.
  Expected: rejected (`otp_expired` or similar). Request a fresh code and
  enter it within 2 minutes. Expected: signed in. Enter the same code
  again. Expected: rejected (single use).
- [ ] **Step 3: Request rate.** Request two codes within 60 s. Expected: the
  second is refused, and no second email arrives.
- [ ] **Step 4: Guess rate.** Submit 35 wrong codes in a loop from one
  machine. Expected: refusals turn into HTTP 429 at Supabase's
  token-verification limit (the default is per IP per 5 minutes). Record
  the observed number and window. **Note:** it's per IP, not per email;
  record that a 6-digit code with a 10-minute life and this limit leaves
  ≤ ~60 guesses per IP per code.
- [ ] **Step 5: Session cleanup permission.** In project A's SQL editor, as
  `postgres`, run
  `select count(*) from auth.sessions where created_at < now() - interval '30 days';`
  and a no-op `delete … where false;`. Expected: both succeed.
  - **If `delete` is denied,** record it. Task 22 then uses the fallback in
    D23: check session age in a Custom Access Token hook, or ask Aamir.
- [ ] **Step 6: Record** the session-lifetime finding: whether "Time-box
  user sessions" is available on Free. Expected: it isn't, which confirms
  the D23 cleanup approach.
- [ ] **Step 7: Commit.** `git add docs && git commit -m "Verify OTP expiry, rate limits, and session cleanup"`

### Task V4: Installs to the iPhone home screen, and codes work inside it

**Files:**
- Create: `src/auth/SignIn.tsx`, `src/auth/SignIn.test.tsx`, `src/auth/useSession.ts`, `src/lib/supabase.ts`, `src/ui/theme.css` (first tokens), `public/` icons
- Modify: `vite.config.ts` (PWA), `src/App.tsx`, `package.json` (`deploy` script)

**Interfaces:**
- Produces:
  - `supabase` client in `src/lib/supabase.ts`, typed with `Database`
    once Task 2 generates types; `persistSession: true`.
  - `useSession(): { session: Session | null; loading: boolean }`.
  - `<SignIn />`, which has two steps: email, then code.

- [ ] **Step 1: Write the failing test** `SignIn.test.tsx`, with a mocked
  `supabase.auth`:

```tsx
test.each([[{ error: null }], [{ error: { message: 'Signups not allowed' } }]])(
  'shows the same neutral message whatever the server says (%#)', async (reply) => {
    mockAuth.signInWithOtp.mockResolvedValue(reply);
    render(<SignIn />);
    await user.type(screen.getByLabelText(/email/i), ' Mom@Example.com ');
    await user.click(screen.getByRole('button', { name: /send code/i }));
    expect(await screen.findByText('If this email has access, a code is on its way.')).toBeVisible();
    expect(mockAuth.signInWithOtp).toHaveBeenCalledWith(expect.objectContaining({ email: 'mom@example.com' }));
  });
test('code field accepts 6 digits only and calls verifyOtp with type "email"', …);
test('sends the device time zone as signup data', …); // options.data.time_zone === Intl.DateTimeFormat().resolvedOptions().timeZone
```

- [ ] **Step 2: Run** `npx vitest run src/auth`. Expected: FAIL.
- [ ] **Step 3: Implement `SignIn` and `useSession`.**
  - The email is trimmed and lowercased.
  - The code input uses `inputMode="numeric"`, `autoComplete="one-time-code"`,
    and `maxLength={6}`.
  - Wrong or expired codes show "That code didn't work. Check it or send a
    new one."
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: PWA setup.**
  - Configure vite-plugin-pwa: `registerType: 'autoUpdate'`,
    `injectRegister: 'script'` (no inline script, needed for the CSP), and
    `workbox.navigateFallback: '/index.html'`.
  - `workbox.runtimeCaching: []`, so nothing from Supabase is cached.
  - Manifest: `name`/`short_name` "Bills", `display: 'standalone'`,
    cream `background_color` and `theme_color`, and icons 192/512.
  - Add `apple-touch-icon` 180 and `apple-mobile-web-app-capable` meta
    tags.
- [ ] **Step 6: Deploy.**
  - Add the script `"deploy": "npm run build && wrangler pages deploy dist --project-name bills"`.
  - Aamir logs in with `npx wrangler login` (free Cloudflare account, no
    card).
  - Put project A's URL and anon key in `.env.production.local`
    (git-ignored).
  - Set project A's Auth Site URL to the `*.pages.dev` address.
  - Run `npm run deploy`.
- [ ] **Step 7 (Aamir, on iPhone):**
  1. Open the URL in Safari, choose Share → Add to Home Screen, and open
     the app from the icon. Expected: full screen, no Safari bars.
  2. Enter his email and get the code from Mail (switching apps and
     coming back). Expected: the app is still on the code step, and the
     code signs him in.
  3. Force-quit, reopen, and confirm he's still signed in.
  4. Repeat once on Mac Safari.

  Record the results, including any iOS quirk.
- [ ] **Step 8: Commit.** `git add -A && git commit -m "Add code sign-in and home-screen install, verified on iPhone"`

### Task V5: The invite-only gate sends nothing to unknown emails (D23)

**Files:**
- Create: migration `sign_up_gate`, `tests/helpers/env.ts`, `tests/helpers/db.ts`, `tests/security/sign-up-gate.test.ts`
- Modify: `supabase/config.toml` (`[auth.hook.before_user_created] enabled = true`, `uri = "pg-functions://postgres/public/hook_before_user_created"`)

**Interfaces:**
- Produces:
  - Table `approved_emails`.
  - `hook_before_user_created(event jsonb) → jsonb`. It returns `{}` to
    allow. To reject, it returns
    `{"error": {"http_code": 403, "message": "Signups not allowed"}}`.
    For now it allows only `approved_emails`; Task 3 adds invites.
  - Test helpers:
    - `sql` (postgres.js as `postgres` on the local DB)
    - `admin` (service-role client)
    - `anonClient()`
    - `approve(email)`
    - `newUser(opts?: { name?: string }): Promise<TestUser>`, where
      `TestUser = { id: string; email: string; client: SupabaseClient<Database> }`.
      It approves a random `@test.local` email, calls
      `admin.auth.admin.createUser({ email, email_confirm: true })`, gets
      `email_otp` from `admin.auth.admin.generateLink({ type: 'magiclink', email })`,
      and signs in with `client.auth.verifyOtp({ email, token, type: 'email' })`.
    - `mailbox.count(to: string): Promise<number>`, from Mailpit's
      `/api/v1/search?query=to:<email>`.

- [ ] **Step 1: Write the failing tests:**

```ts
test('an unknown email gets no email and no account', async () => {
  const email = `${randomUUID()}@test.local`;
  await anonClient().auth.signInWithOtp({ email });
  await sleep(1500);
  expect(await mailbox.count(email)).toBe(0);
  expect(await sql`select 1 from auth.users where email = ${email}`).toHaveLength(0);
});
test('an approved email gets a code', async () => { /* approve(email) → signInWithOtp → mailbox.count === 1 */ });
test('approval ignores case and spaces', async () => { /* approve('x@test.local'); signInWithOtp({ email: ' X@Test.Local ' }) → 1 email */ });
test('an existing account gets a code even if not approved any more', …);
test('a password signUp for an unknown email creates nothing', …); // auth.signUp({email, password}) → no auth.users row
```

- [ ] **Step 2: Run** `npm run test:db`. Expected: the first and last tests
  fail (no hook yet).
- [ ] **Step 3: Implement the migration.**
  - `approved_emails`, with RLS enabled and no policies.
  - The hook function, which lowercases and trims
    `event->'user'->>'email'`.
  - `grant execute … to supabase_auth_admin`;
    `revoke … from authenticated, anon, public`;
    `grant select on approved_emails to supabase_auth_admin`.
- [ ] **Step 4: Run** `npx supabase db reset && npm run test:db`. Expected:
  PASS.
- [ ] **Step 5: Hosted check.**
  - Run `npx supabase db push` to project A, and enable the hook under
    Dashboard → Auth → Hooks.
  - Insert Aamir's email into `approved_emails` with the SQL editor.
  - Request a code for an unknown address Aamir controls (e.g. a
    `+test` alias of his own inbox). Expected: no email after 5 minutes,
    and no user in the dashboard.
  - Request a code for the approved address. Expected: a code arrives.
- [ ] **Step 6: Record the result.** **If the unknown address gets any
  email,** stop and switch to D23's fallback with Aamir before Phase 2.
- [ ] **Step 7: Commit.** `git add -A && git commit -m "Gate sign-up to approved emails and prove unknown emails get nothing"`

---

## Phase 2: Database and security

Each task adds one migration (`npx supabase migration new <slug>`). After
the migration, run `npx supabase gen types typescript --local > src/lib/database.types.ts`.
Run `npx supabase db reset && npm run test:db` for every "run" step.

### Task 2: Profiles, households, memberships

**Files:**
- Create: migration `households`, `tests/security/membership.test.ts`
- Modify: `tests/helpers/db.ts` (`newHousehold(owner: TestUser, name?: string): Promise<string>`)

**Interfaces:**
- Produces:
  - The `profiles`, `households`, and `memberships` tables.
  - `is_member`, `is_owner`, `my_household_id`, `create_household`, and
    `household_names` (see Data model).
  - An `after insert on auth.users` trigger that creates the profile.
    `time_zone` is taken from `raw_user_meta_data->>'time_zone'` only if it
    exists in `pg_timezone_names`, else `'UTC'`.
  - A constraint trigger `memberships_keep_an_owner` (`deferrable initially
    deferred`, after update or delete). It runs only if the household still
    exists: it raises `household_needs_member` if the household has no
    members, or `last_owner` if it has no owner.

- [ ] **Step 1: Write the failing tests:**

```ts
test('creating a household makes me its owner and only member', …); // memberships = [{role:'owner'}]
test('I cannot create a second household', …);                         // error.message === 'already_in_household'
test('a bad time zone is refused', …);                                  // create_household('H','Mars/Base') → 'bad_time_zone'
test('a stranger cannot see the household, its members, or their names', async () => {
  const a = await newUser(); const s = await newUser(); const h = await newHousehold(a);
  expect((await s.client.from('households').select().eq('id', h)).data).toEqual([]);
  expect((await s.client.from('memberships').select().eq('household_id', h)).data).toEqual([]);
  expect((await s.client.from('profiles').select().eq('id', a.id)).data).toEqual([]);
});
test('a profile cannot be edited by anyone else', …);   // b updates a's display_name → 0 rows
test('the sole owner cannot leave (last_owner / household_needs_member)', …);
test('clients cannot insert memberships directly', …);   // insert → error
test('a sign-up time zone hint that is not real falls back to UTC', …);
```

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement the migration** per the Data model.
  - Policies and column grants exactly as in the table.
  - `revoke all on all tables in schema public from anon`.
  - Set `alter default privileges in schema public revoke all on tables from anon`
    and `... revoke execute on functions from public`, so later tables and
    functions start closed.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "Add profiles, households, and memberships with access rules"`

### Task 3: Invites, joining, roles, leaving, removal

**Files:**
- Create: migration `invites`
- Modify: `tests/security/membership.test.ts`, `tests/security/sign-up-gate.test.ts`, `tests/helpers/db.ts` (`addMember(household: string, owner: TestUser, member: TestUser): Promise<void>`)

**Interfaces:**
- Consumes: Task 2 functions.
- Produces:
  - The `invites` table.
  - `my_invites()` and `accept_invite(p_invite)`.
  - The hook extended so that a pending, unexpired invite also allows
    sign-up.
  - Trigger `invites_before_insert`:
    - normalizes the email,
    - cancels the same household and email's *expired* pending invite,
    - raises `already_invited` if an unexpired pending invite already
      exists,
    - raises `too_many_invites` above 10 pending invites per household
      (protects the Gmail sender),
    - sets `invited_by = auth.uid()`.

- [ ] **Step 1: Write the failing tests** (in `membership.test.ts` unless
  noted):

```ts
test('a non-owner cannot invite, cancel, see invites, remove, or change roles', async () => {
  const o = await newUser(); const m = await newUser(); const h = await newHousehold(o); await addMember(h, o, m);
  expect((await m.client.from('invites').insert({ household_id: h, email: 'x@test.local' })).error).not.toBeNull();
  expect((await m.client.from('invites').select().eq('household_id', h)).data).toEqual([]);
  expect((await m.client.from('memberships').update({ role: 'member' }).eq('profile_id', o.id).select()).data).toEqual([]);
  expect((await m.client.from('memberships').delete().eq('profile_id', o.id).select()).data).toEqual([]);
});
test('a non-invited email cannot join', …);                  // stranger.rpc('accept_invite', {p_invite: idForSomeoneElse}) → 'invite_not_found'
test('the invited email can accept, with different case', …);  // invite ' Kid@Test.Local' → user kid@test.local accepts → member
test('expired and cancelled invites cannot be accepted', …);   // update expires_at via sql → 'invite_not_found'
test('someone already in a household cannot accept', …);       // 'already_in_household'
test('a password sign-up for an invited email gets no session until the inbox confirms', …); // auth.signUp({email, password}) → data.session === null; signInWithPassword → error; no membership
test('a former member immediately loses access to members, names, and invites', …); // m leaves → selects return []
test('a removed member immediately loses access', …);
test('owners can promote, demote another owner, and remove a member', …);
test('the last owner cannot be demoted, even by themselves', …); // 'last_owner'
test('the 11th pending invite is refused', …);                   // 'too_many_invites'
// sign-up-gate.test.ts:
test('an invited new email gets a code; after the invite is cancelled it gets nothing', …);
```

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement the migration.**
  - `accept_invite` compares `lower(trim(invite.email))` with the
    caller's `auth.users.email` (read from `auth.users` by `auth.uid()`,
    **not** from JWT claims or metadata). It also requires
    `email_confirmed_at is not null`.
  - Policies per the Data model.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "Add invites, joining, roles, leaving, and removal"`

### Task 4: Categories and bills

**Files:**
- Create: migration `bills`, `tests/security/bills.test.ts`
- Modify: `tests/helpers/db.ts` (`newBill(user: TestUser, opts: { scope: 'household' | 'personal'; household?: string; name?: string; usualCents?: number; schedule?: 'monthly'|'weeks'|'yearly'|'once'; anchor?: string; categoryName?: string }): Promise<{ id: string }>`)

**Interfaces:**
- Produces:
  - The `categories` and `bills` tables, and `can_access_bill(p_bill)`.
  - `seed_default_categories(p_household uuid, p_owner uuid)` (internal),
    called by `create_household` and by the new-profile trigger. The
    defaults are Housing, Car, Utilities, Insurance, Credit card
    (`is_credit_card = true`), and Internet & phone. Colors are the six
    category pastels, which Task 11 copies into `theme.css`.
  - Trigger `bills_check_category`: the category scope must equal the bill
    scope, else `category_scope_mismatch`. It sets `is_credit_card` from
    the category.

- [ ] **Step 1: Write the failing tests:**

```ts
test("a member cannot read, change, or archive another member's personal bill", async () => {
  const a = await newUser(); const b = await newUser(); const h = await newHousehold(a); await addMember(h, a, b);
  const bill = await newBill(a, { scope: 'personal' });
  expect((await b.client.from('bills').select().eq('id', bill.id)).data).toEqual([]);
  expect((await b.client.from('bills').update({ archived_at: new Date().toISOString() }).eq('id', bill.id).select()).data).toEqual([]);
  expect((await b.client.from('categories').select().eq('owner_id', a.id)).data).toEqual([]);
});
test('every member can read and edit household bills; a stranger cannot', …);
test('a former member cannot read household bills', …); // b leaves → select → []
test('scope cannot change after creation', …);           // update({household_id: null, owner_id: b.id}) → error (no column grant)
test('a bill cannot use another household’s or person’s category', …); // 'category_scope_mismatch'
test('last4 must be exactly 4 digits and pay_url must be https', …);    // '123', '12345', 'abcd', 'http://x', 'javascript:alert(1)' all rejected
test('a custom category cannot be marked credit card', …);              // insert {is_credit_card:true} → error
test('new households and new people get the six default categories', …);
```

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement the migration** per the Data model.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "Add categories and bills with scope rules"`

### Task 5: Schedules and stored entries (D25)

**Files:**
- Create: migration `entries`, `tests/db/schedule.test.ts`

**Interfaces:**
- Consumes: `bills`.
- Produces:
  - `due_dates(...)`, `scope_today(...)`, the `entries` table,
    `generate_entries(p_bill, p_from)` (horizon: `scope_today + 12 months`,
    `on conflict do nothing`), and `extend_entries()`.
  - Trigger `bills_entries_sync` (after insert/update, definer):
    - **insert:** generate from `anchor_date`.
    - **`schedule`/`every_weeks`/`anchor_date` changed:** delete entries
      with `due_date >= scope_today`, no payments, and `minimum_cents is
      null`, then generate from the new anchor.
    - **archived:** the same delete, with no generation.
    - **restored:** generate from `greatest(anchor_date, scope_today)`.
    - **`usual_cents` changed:** set `expected_cents` on entries with
      `due_date >= scope_today` and no payments.

- [ ] **Step 1: Write the failing tests** (`sql` calls `due_dates` directly):

```ts
test('monthly on the 31st falls on the last day of short months', async () => {
  const rows = await sql`select d::text from public.due_dates('monthly', null, '2027-01-31', '2027-01-31', '2027-04-30') d`;
  expect(rows.map(r => r.d)).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
});
test('monthly on the 29th in a leap year', …);             // 2028-01-29 → 2028-02-29
test('yearly on Feb 29 falls on Feb 28 in other years', …); // 2028-02-29 → 2029-02-28
test('every 2 weeks steps 14 days from the anchor', …);
test('once yields only the anchor', …);
test('a new bill gets entries 12 months ahead and none before its due date', …);
test('changing the schedule replaces only untouched future entries', …); // paid future entry survives; past entry survives
test('archiving removes untouched future entries; restoring brings them back from today', …);
test('a new usual amount updates only future unpaid entries', …);
test('clients cannot insert or delete entries', …);
test('minimum and statement can be saved on credit card entries only', …); // non-card → 'not_credit_card'
```

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement `due_dates`.**
  - **monthly:** `make_date(y, m, least(day(anchor), last_day(y, m)))`.
  - **yearly:** the anchor's month and day, clamped the same way.
  - **weeks:** `anchor + k * 7 * every_weeks`.
  - **once:** only the anchor.

  Return only dates in `[p_from, p_through]`. Then implement the rest of
  the migration.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "Add schedules and stored entries"`

### Task 6: Payments and entry status

**Files:**
- Create: migration `payments`, `tests/security/payments.test.ts`, `tests/db/status.test.ts`

**Interfaces:**
- Produces:
  - The `payments` table, with a `payments_set_payer` trigger
    (`new.paid_by := auth.uid()`).
  - `entry_view`, exactly as in the Data model.

- [ ] **Step 1: Write the failing tests:**

```ts
// status.test.ts
test('a regular bill is paid after any payment', …);
test('a credit card with a minimum is paid only once payments reach it', …); // min 5000: pay 3000 → upcoming/overdue; pay 2000 more → paid
test('a credit card with no minimum is paid after any payment', …);
test('overdue starts the day after the due date in the household time zone', async () => {
  // household tz 'America/Los_Angeles', entry due 2027-03-10.
  // statusAt = sql`select public.entry_status_at(${entry}, ${now})` (as postgres)
  expect(await statusAt(entry, '2027-03-11T06:30:00Z')).toBe('upcoming'); // 23:30 PDT on Mar 10
  expect(await statusAt(entry, '2027-03-11T07:30:00Z')).toBe('overdue');  // 00:30 PDT on Mar 11
});
test('target_cents is the minimum for cards that have one, else expected', …);
// payments.test.ts
test("a member cannot see or add payments on another member's personal bill", …);
test('paid_by is always the caller, even if the client sends someone else', …); // insert {paid_by: other.id} → error (no column grant); row paid_by === caller
test('a member can undo a household payment; a stranger cannot', …);
test('entry_view hides personal entries from other members', …);  // proves security_invoker works
```

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** The status rule exists once, in
  `status_rule`. `entry_view` calls it with `scope_today(...)`, and
  `entry_status_at` calls it with the local date of `p_now`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "Add payments and entry status"`

### Task 7: Change history

**Files:**
- Create: migration `history`, `tests/db/history.test.ts`

**Interfaces:**
- Produces: the `history` table and triggers on `bills`, `payments`,
  `invites`, and `memberships`, which write the kinds listed in the Data
  model (`actor_id = auth.uid()`).

- [ ] **Step 1: Write the failing tests:**

```ts
test('creating, editing, archiving and restoring a bill is recorded with old and new values', …);
// usual_cents 198000 → 200000 gives {kind:'bill_changed', detail:{field:'usual_cents', old:198000, new:200000}}
test('a last4 change is recorded without the digits', …);       // detail = {field:'last4'}
test('payments added and removed are recorded', …);
test('joins, leaves, removals, invites and role changes are recorded on the household', …);
test("personal bill history is visible only to its owner", …);
test('clients cannot write or edit history', …);
```

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement the migration.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "Record change history for bills, payments, and membership"`

### Task 8: Deleting a household and deleting an account

**Files:**
- Create: migration `deletion`, `supabase/functions/delete-account/index.ts`, `tests/security/deletion.test.ts`
- Modify: `supabase/config.toml` (`[functions.delete-account] verify_jwt = true`)

**Interfaces:**
- Produces:
  - `delete_household(p_household)`.
  - `account_deletion_blocker()`.
  - An `after delete on auth.users` trigger that:
    - deletes `invites` with that email,
    - strips `detail->'email'` equal to that email from `history`.
  - Edge Function `POST /functions/v1/delete-account`, called with the
    user's JWT and no body:
    - **blocker not null:** `409 {"error": "<blocker>"}`.
    - **otherwise:** `admin.auth.admin.deleteUser(uid)` → `204`.

- [ ] **Step 1: Write the failing tests:**

```ts
test('deleting an account removes personal bills, entries, payments, categories and history', …);
test('household payments by a deleted member remain, with paid_by null ("former member")', …);
test('household_names no longer returns a deleted member', …);
test('a last owner with other members is blocked (409 last_owner) and nothing is deleted', …);
test('a sole member must delete the household first (409 sole_member)', …);
test('a sole owner can delete the household and everything in it is gone', …); // sql counts in every table for that household_id = 0
test('a non-sole owner or a member cannot delete the household', …);           // 'not_sole_owner'
test('a deleted account’s email disappears from invites and history', …);
```

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement the migration and the function.**
  - The function calls `account_deletion_blocker` with a client built from
    the request's `Authorization` header, and uses the service-role client
    only for `deleteUser`.
  - Deleting a household writes no history event: all its history is
    deleted with it (§5). *(Claude's call, listed in the snapshot.)*
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "Add household deletion and account deletion"`

### Task 9: Whole-schema security sweep

**Files:**
- Create: `tests/security/schema.test.ts`

- [ ] **Step 1: Write the tests** (they read the catalog through `sql`):

```ts
test('every table in public has row-level security enabled', async () => {
  expect(await sql`select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`).toEqual([]);
});
test('every view in public is security_invoker', …);  // reloptions contains 'security_invoker=true'
test('every security definer function pins search_path', …); // proconfig contains 'search_path='
test('anon can execute only health_check in public', …);  // has_function_privilege('anon', oid, 'execute')
test('anon has no table privileges in public', …);
test('signed out, the API returns nothing from any table', …); // loop every table via anonClient().from(t).select()
```

- [ ] **Step 2: Run.** Expected: PASS. **If anything fails,** fix it in a
  new migration, then rerun.
- [ ] **Step 3: Commit.** `git add -A && git commit -m "Add a whole-schema security sweep"`
- [ ] **Step 4: Push the schema to production.** Run `npx supabase db push`
  to project A, then `npx supabase gen types` (if anything changed). Ask
  Aamir before pushing the branch to GitHub.

---

## Phase 3: App

Every screen follows design §7 and the mockups in
`.superpowers/brainstorm/` (local). **At the end of each screen task, show
Aamir the screen at iPhone size (screenshot or `npm run dev` on his phone)
and get an OK before committing.** He reacts best to visuals. Components
render user text only as React children, never with
`dangerouslySetInnerHTML`. Data hooks live in `src/lib/queries.ts` and are
named in each task.

### Task 10: Money, calendar, totals, donut, and CSV logic

**Files:**
- Create: `src/lib/money.ts`, `calendar.ts`, `totals.ts`, `csv.ts`, and a `*.test.ts` beside each

**Interfaces:**
- Produces:
  - `parseCents(input: string): number | null`
  - `formatCents(cents: number): string`: `$1,980` when the amount is
    whole dollars, else `$1,980.50`.
  - `monthGrid(year: number, month: number): (string | null)[][]`: weeks
    of ISO dates, Sunday first.
  - `dayStatus(statuses: Status[]): Status | null`: overdue beats
    upcoming beats paid.
  - `type EntryRow = { id: string; dueDate: string; status: Status; targetCents: number; paidCents: number; categoryId: string; billName: string }`
  - `monthTotals(rows: EntryRow[]): { paidCents: number; overdueCents: number; leftCents: number }`
  - `donutSlices(rows: EntryRow[], categories: Map<string, { name: string; color: string }>): { categoryId: string; name: string; color: string; sizeCents: number; paidCents: number; overdueCents: number; owedCents: number }[]`
    (largest first), plus `donutCenter(slices): { leftCents: number; totalCents: number }`.
  - `toCsv(rows: ExportRow[]): string`, where `ExportRow = { bill: string; scope: 'Household' | 'Mine'; category: string; dueDate: string; status: Status; expected: string; paymentAmount: string; paidOn: string; paidBy: string }`.

- [ ] **Step 1: Write the failing tests** (the key assertions):

```ts
test.each([['1980', 198000], ['$1,980', 198000], [' 1980.5 ', 198050], ['0.01', 1]])('parseCents(%s)', (i, o) => expect(parseCents(i)).toBe(o));
test.each(['', '0', '-5', '12.345', 'abc', '1e3', '1,98,0', '1000000'])('parseCents rejects %s', i => expect(parseCents(i)).toBeNull());
test('formatCents', () => { expect(formatCents(198000)).toBe('$1,980'); expect(formatCents(198050)).toBe('$1,980.50'); });
test('Oct 2026 grid starts on Thursday the 1st', () => expect(monthGrid(2026, 10)[0]).toEqual([null, null, null, null, '2026-10-01', '2026-10-02', '2026-10-03']));
test('dayStatus picks the most urgent', () => expect(dayStatus(['paid', 'overdue', 'upcoming'])).toBe('overdue'));
test('totals: paid sums payments; overdue and left sum what is still owed', () => {
  expect(monthTotals([
    row({ status: 'paid', targetCents: 10000, paidCents: 10000 }),
    row({ status: 'overdue', targetCents: 5000, paidCents: 2000 }), // card paid part of its minimum
    row({ status: 'upcoming', targetCents: 7000, paidCents: 0 }),
  ])).toEqual({ paidCents: 12000, overdueCents: 3000, leftCents: 7000 });
});
test('donut slice size is max(paid, target) per entry; center is owed of total', …);
test('csv neutralizes formulas and quotes commas, quotes and newlines', () => {
  const out = toCsv([exportRow({ bill: '=HYPERLINK("x")', category: 'Car, loan', paidBy: 'Al "Mo"' })]);
  expect(out).toContain(`"'=HYPERLINK(""x"")"`); expect(out).toContain('"Car, loan"'); expect(out).toContain('"Al ""Mo"""');
});
```

- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **`parseCents`:** strip `$` and well-placed thousands commas
    (`^\d{1,3}(,\d{3})*(\.\d{1,2})?$` or `^\d+(\.\d{1,2})?$`), then
    `> 0` and `< 1,000,000` dollars.
  - **Totals:** overdue and left are `max(target − paid, 0)` for those
    entries. *(Claude's call: this avoids counting a partial credit card
    payment as both paid and still owed. Listed in the snapshot for
    Aamir.)*
  - **CSV:** prefix `'` to cells starting with `= + - @` or a tab or CR,
    then quote per RFC 4180. Header row: `Bill, Household or mine,
    Category, Due date, Status, Expected, Payment amount, Paid on, Paid by`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.** `git add src/lib && git commit -m "Add money, calendar, totals, donut, and CSV logic"`

### Task 11: App shell, theme, first run

**Files:**
- Create: `src/ui/theme.css` (complete), `GroupedList.tsx`, `Sheet.tsx`, `Switch.tsx`, `Picker.tsx`, `OfflineBanner.tsx`, `src/auth/NameStep.tsx`, `src/lib/errors.ts`, `src/lib/queries.ts` (`useProfile`, `useUpdateProfile`, `useMyHousehold`, `useMyInvites`, `useAcceptInvite`), `src/settings/InviteBanner.tsx`, and a `*.test.tsx` for NameStep, OfflineBanner, and errors
- Modify: `src/App.tsx`, `src/main.tsx`

**Interfaces:**
- Consumes: `useSession`, generated `Database` types, and `accept_invite` /
  `my_invites`.
- Produces:
  - **Routes:** `/` Home, `/bills/new`, `/bills/:id`, `/settings`,
    `/settings/household`, `/settings/archived`, `/settings/delete-account`.
  - **Gate order:** not signed in → `SignIn`; `display_name` null →
    `NameStep`; a pending invite → `InviteBanner` ("Join <household>?"
    Accept / Not now); otherwise the route.
  - `errorMessage(e: unknown): string`, which maps each SQL error key to
    copy.

- [ ] **Step 1: Write the failing tests:**
  - NameStep trims the name, refuses an empty or 41-character name, and
    saves `display_name` once.
  - OfflineBanner appears on the window `offline` event and hides on
    `online`.
  - `errorMessage({ message: 'last_owner' })` returns "Make someone else
    an owner first."
  - Every key in the Data model has copy (iterate a list of keys, with no
    `undefined`).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **`theme.css` tokens:** `--cream` background, `--ink` text, status
    `--sage`, `--rose`, `--butter` (each with a `-pale` tint), and six
    `--cat-*` pastels (the same hex values as the seeded categories in
    Task 4).
  - **Fonts:** the system font stack only.
  - **Contrast:** text on any pastel fill must reach WCAG AA 4.5:1. Add a
    unit test that checks each token pair with a small luminance function.
- [ ] **Step 4: Run.** Expected: PASS. Then show Aamir sign-in → name →
  empty home.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "Add the app shell, theme, and first-run flow"`

### Task 12: Home calendar view

**Files:**
- Create: `src/home/Home.tsx`, `CalendarView.tsx`, `Totals.tsx`, `CalendarView.test.tsx`
- Modify: `src/lib/queries.ts` (`useMonthEntries(view: 'household' | 'mine', year: number, month: number): EntryRow[]`, which reads `entry_view` with `archived_at is null` filtered by scope and month; `useSetLastView`)

**Interfaces:**
- Consumes: `monthGrid`, `dayStatus`, `monthTotals`, `formatCents`.
- Produces: `<Home />`, which owns `view` (initial `profile.last_view`;
  `'mine'` forced when there's no household), `year`/`month` (today), and
  `mode: 'calendar' | 'donut'`. Tapping a day opens `<DayList>`
  (Task 13).

- [ ] **Step 1: Write the failing tests** (with fake rows):
  - A day with paid and overdue entries has the class `status-overdue`.
  - Today has an outline class.
  - The totals show "$120 paid", "$30 overdue", and "$70 left", each
    exactly once.
  - **No bill count appears anywhere.** Assert that no text matches
    `/\b\d+ bills?\b/`.
  - The Household/Mine switch is hidden when there's no household.
  - Switching calls `useSetLastView`.
  - ‹ › change the month.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement the components.**
- [ ] **Step 4: Run.** Expected: PASS. Show Aamir.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "Add the home calendar with totals and the Household/Mine switch"`

### Task 13: Day list and pay sheet

**Files:**
- Create: `src/home/DayList.tsx`, `src/bills/PaySheet.tsx`, `PaySheet.test.tsx`
- Modify: `src/lib/queries.ts` (`useAddPayment({ entryId, amountCents, paidOn })`, `useRemovePayment(paymentId)`, `useSaveCardFigures({ entryId, minimumCents, statementCents })`, `useUpdateBill(id, patch)`, `useEntryPayments(entryId)`)

**Interfaces:**
- Consumes: `entry_view` rows, `parseCents`, `formatCents`.
- Produces: `<PaySheet entryId onClose />`.

- [ ] **Step 1: Write the failing tests:**
  - The sheet pre-fills the usual amount.
  - Typing a different amount shows "usually $X" and the "Use $X from now
    on" row (off by default). With the switch on, Mark paid calls
    `useUpdateBill(id, { usual_cents })` and then `useAddPayment`. With
    it off, only `useAddPayment` is called.
  - An invalid amount disables Mark paid.
  - "Open payment page ↗" appears only with a `pay_url`, and renders
    `target="_blank" rel="noopener noreferrer"`.
  - Credit card variant:
    - The minimum and statement fields show.
    - Closing after typing a minimum calls `useSaveCardFigures` without a
      payment.
    - "Minimum covered ✓" shows when paid ≥ minimum.
  - A recorded payment shows "Remove" (undo), which calls
    `useRemovePayment`.
  - Tapping the bill name in the sheet opens `/bills/:id` (Edit bill).
  - The overdue pill shows for overdue entries.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** "Paid on" defaults to today's local date.
- [ ] **Step 4: Run.** Expected: PASS. Show Aamir.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "Add the day list and the pay sheet"`

### Task 14: New bill

**Files:**
- Create: `src/bills/NewBill.tsx`, `BillRows.tsx`, `NewBill.test.tsx`
- Modify: `src/lib/queries.ts` (`useCategories(view)`, `useCreateBill(input)`, `useCreateCategory({ name, color, scope })`)

**Interfaces:**
- Produces: `<BillRows value onChange />`, reused by Edit bill. It has
  rows for Amount, Due, and Category, and "More details" (nickname, last 4,
  payment link).

- [ ] **Step 1: Write the failing tests:**
  - Save is disabled until the name, amount, due date, and category are
    set.
  - "Household / Just mine" is hidden without a household.
  - The schedule picker offers Every month (day N, shown from the due
    date), Every N weeks, Every year, and Just once.
  - Last 4 accepts only 4 digits.
  - A payment link without `https://` shows "Use a link that starts with
    https://".
  - Saving sends exactly the insert columns in the Data model. The test
    snapshots the payload's keys.
  - A new custom category can be added inline, with a pastel from the
    palette.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS. Show Aamir.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "Add the new bill page"`

### Task 15: Edit bill, history timeline, archive

**Files:**
- Create: `src/bills/EditBill.tsx`, `HistoryTimeline.tsx`, `src/settings/ArchivedBills.tsx`, `HistoryTimeline.test.tsx`
- Modify: `src/lib/queries.ts` (`useBill(id)`, `useBillHistory(id)`, `useHouseholdNames()`, `useArchivedBills(view)`)

**Interfaces:**
- Consumes: `BillRows`, `history`, `household_names()`.

- [ ] **Step 1: Write the failing tests:**
  - Each kind renders its line: `payment_added` → "Paid $1,980" with a
    green dot; `bill_changed usual_cents` → "Amount changed to $2,000"
    with "was $1,980 · <date> · <name>" in small grey text and a
    lavender dot.
  - A null or unknown actor shows "Former member".
  - The Edit page has no scope switch.
  - "Archive bill" asks for confirmation, then sets `archived_at`.
  - Archived bills list Restore, which sets `archived_at` to null.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS. Show Aamir.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "Add bill editing, history timeline, and archiving"`

### Task 16: Donut view

**Files:**
- Create: `src/home/DonutView.tsx`, `DonutView.test.tsx`

**Interfaces:**
- Consumes: `donutSlices`, `donutCenter`, and the same rows as the
  calendar.

- [ ] **Step 1: Write the failing tests:**
  - The center reads "$X left of $Y".
  - There's one legend row per category: fully paid shows "$N · paid";
    otherwise the overdue amount (rose) and "$N of $M left".
  - Each slice is one `<path>` for the paid part (solid) and one for the
    owed part (`-pale`).
  - The view follows Household/Mine.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement as inline SVG arcs.** No chart library. Use
  rounded ends (`stroke-linecap: round`) and about 2° gaps.
- [ ] **Step 4: Run.** Expected: PASS. Show Aamir.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "Add the category donut view"`

### Task 17: Settings and CSV export

**Files:**
- Create: `src/settings/Settings.tsx`, `Settings.test.tsx`
- Modify: `src/lib/queries.ts` (`useExportRows(): ExportRow[]`, which joins `entry_view`, payments, categories, and `household_names` for everything the person can see)

**Interfaces:**
- Consumes: `toCsv`, `useUpdateProfile`.

- [ ] **Step 1: Write the failing tests:**
  - The reminder toggles and the lead time picker (1, 2, 3, 5, 7, 10, 14
    days) save to `profiles`.
  - Keep history for (1, 2, 3, 5 years, Never) saves `retention_months`
    (12/24/36/60/null).
  - Export downloads `bills-YYYY-MM-DD.csv` built by `toCsv`.
  - "Sign out of all devices" calls `auth.signOut({ scope: 'global' })`.
  - "Leave household" asks for confirmation, then deletes the person's
    own membership row. On `last_owner`, it shows the mapped copy.
  - "Create household" shows only without a household.
  - The display name can be edited.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS. Show Aamir.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "Add settings and CSV export"`

### Task 18: Household screen and the invite email

**Files:**
- Create: `src/settings/HouseholdScreen.tsx`, `HouseholdScreen.test.tsx`, `supabase/functions/invite/index.ts`, `tests/db/invite-function.test.ts`
- Modify: `src/lib/queries.ts` (`useMembers`, `useInvites`, `useInvite(email)`, `useCancelInvite(id)`, `useSetRole`, `useRemoveMember`, `useCreateHousehold`, `useDeleteHousehold`, `useUpdateHousehold`)

**Interfaces:**
- Produces: Edge Function `POST /functions/v1/invite` with body
  `{ "email": string }` and the user's JWT. It:
  1. normalizes the email,
  2. inserts into `invites` **with the caller's client**, so RLS decides,
  3. on success, `sendEmail` to the invitee: subject "You're invited to a
     household on Bills"; plain-text body naming the household, the
     inviter's display name, the app URL (env `APP_URL`), and "Sign in
     with this email address. The invite expires in 7 days."
  4. returns `{ ok: true }`, or `{ error: '<key>' }` with 400/403.

- [ ] **Step 1: Write the failing tests:**
  - **`invite-function.test.ts`** (local stack, Mailpit):
    - An owner's invite creates a row and exactly 1 email.
    - A member's invite returns 403, with no row and 0 emails.
    - `already_invited` and `too_many_invites` surface as 400s.
  - **Screen:**
    - Members show Owner/Member labels.
    - An owner sees pending invites with their expiry date and Cancel,
      "+ Invite someone by email", a tap-member sheet (Make owner,
      Remove), and the household's Keep history for setting.
    - A member sees the list and Leave only.
    - A sole member sees "Delete household". It warns, offers export,
      then calls `delete_household`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Function env:
  - `APP_URL`, `MAIL_FROM_NAME`, and the SMTP variables (production:
    Supabase secrets).
  - Local: `supabase/functions/.env` copied from `.env.example`, using the
    Mailpit SMTP container. Find its hostname with `docker ps`; port 1025,
    no TLS.
- [ ] **Step 4: Run.** Expected: PASS. Show Aamir.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "Add the household screen and invite emails"`

### Task 19: Delete account flow

**Files:**
- Create: `src/settings/DeleteAccount.tsx`, `DeleteAccount.test.tsx`

**Interfaces:**
- Consumes: `delete-account` (Task 8) and `useExportRows`.

- [ ] **Step 1: Write the failing tests:**
  - The page shows the permanent-deletion warning and an Export button
    first.
  - Delete needs typing `DELETE`.
  - A 409 `last_owner` or `sole_member` shows the mapped copy and a link
    to the household screen.
  - A 204 signs out locally and shows "Your account was deleted."
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "Add the delete account flow"`

### Task 20: Deploy the app to production and smoke-test it

- [ ] **Step 1:** Run `npx supabase db push` and
  `npx supabase functions deploy invite delete-account`. Set secrets
  (`APP_URL`, SMTP vars, `MAIL_FROM_NAME`) with `npx supabase secrets set`.
  Record each name (not its value) in `docs/operations.md`.
- [ ] **Step 2:** Run `npm run deploy`.
- [ ] **Step 3 (Aamir, on iPhone):** Create the household, invite a second
  address he owns, accept it there, add a household bill and a personal
  bill, and mark one paid. Confirm the second account can't see the
  personal bill.
- [ ] **Step 4: Commit** the operations doc. `git commit -am "Document production deploy steps"`

---

## Phase 4: Jobs and operations

### Task 21: Hourly reminders (idempotent)

**Files:**
- Create: migration `reminders`, `supabase/functions/_shared/reminder-email.ts`, `supabase/functions/daily/index.ts`, `supabase/seed.sql`, `src/lib/reminder-email.test.ts` (imports the shared file by relative path), `tests/db/reminders.test.ts`
- Modify: `supabase/config.toml` (`[functions.daily] verify_jwt = false`)

**Interfaces:**
- Produces:
  - Tables: `job_runs`, `digest_sends`, `reminder_sends`.
  - `claim_reminders(p_now timestamptz) → table(profile_id uuid, email text, local_date date, entry_id uuid, kind text, bill_name text, due_date date, amount_cents bigint)`.
    It inserts digest and reminder claims and returns only rows it
    claimed. Rules:
    - Effective time zone = the household's if the person is a member,
      else the profile's.
    - The person's local hour must be ≥ 8, and they must have no
      `digest_sends` row for their local date.
    - Entries: not paid, bill not archived. Household bills need the
      person to be a member with `remind_household`; personal bills need
      the owner with `remind_personal`.
    - Kinds, with `d = due_date − local_date`: `lead` if `0 < d ≤
      lead_days`; `due` if `d = 0`; `overdue` if `−7 ≤ d ≤ −1`.
    - Skip anything already in `reminder_sends`.
    - `amount_cents = greatest(target − paid, 0)`.
  - `release_reminders(p_profile, p_local_date)`.
  - `record_job_run(p_job, p_ok, p_detail)`.
  - `buildReminderEmail(items: ReminderItem[], appUrl: string): { subject: string; text: string }`.
    Pure, no imports. `ReminderItem = { kind: 'lead' | 'due' | 'overdue'; billName: string; dueDate: string; amountCents: number }`.
  - The `daily` function checks the header `x-cron-secret` against env
    `CRON_SECRET` (else 401). It calls `claim_reminders(now())`, groups by
    person, and sends one email each. On a send error it calls
    `release_reminders` and marks the run failed. It then handles
    heads-ups (Task 22) and calls `record_job_run('reminders', ok, summary)`.
    The summary holds counts only, never names or emails.
  - A pg_cron job `reminders-hourly` at `'5 * * * *'`. It uses `net.http_post`
    to `<vault functions_url>/daily` with the `x-cron-secret` header from
    the Vault secret `cron_secret`. `seed.sql` creates the local Vault
    values; production values are set by hand (operations doc).

- [ ] **Step 1: Write the failing tests:**

```ts
// reminder-email.test.ts (unit)
test('one email lists all items, overdue first, then due today, then upcoming', …);
test('bill names go through as plain text, unchanged', () => {
  const { text } = buildReminderEmail([item({ billName: '<b>Visa</b> =1+1' })], 'https://x');
  expect(text).toContain('<b>Visa</b> =1+1');
});
// reminders.test.ts: last-4 can't leak because it never reaches the sender
test('claim_reminders returns no last4, nickname, or pay_url column', …); // Object.keys(row) equals the Interfaces list
// reminders.test.ts (db): calls sql`select * from public.claim_reminders(${now})`
test('a household bill reminds members with household reminders on, at 8 a.m. their time, not before', …);
test('lead reminder N days before uses the person’s lead_days', …);
test('due-day and one overdue reminder; none on day 2+ for overdue beyond 7 days', …);
test('paid entries and archived bills get nothing', …);
test('personal bills remind only their owner', …);
test('reminders off means nothing', …);
test('running twice in the same day claims nothing the second time', …);
test('two concurrent claims never return the same row', async () => {
  const [a, b] = await Promise.all([claim(now), claim(now)]);
  expect(intersect(ids(a), ids(b))).toEqual([]);
});
test('a released claim is claimed again on the next run', …);
test('the daily function rejects a missing or wrong cron secret', …);   // fetch → 401
test('the daily function sends one Mailpit email per person and logs a job run', …);
```

- [ ] **Step 2: Run** `npm test && npm run test:db`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `claim_reminders` does its claim as one statement: `insert … on
    conflict do nothing returning`, which is safe under concurrency.
  - Email text, kept calm. Subject: "Bills: 2 reminders for today".
    Lines: "Due today: Car payment, $412", "Due Oct 30: Electric, $86",
    "Overdue since Oct 24: Visa, $35". Then the app link and "Turn
    reminders off in Settings."
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "Add hourly email reminders"`

### Task 22: Retention, heads-up emails, session cap, and nightly upkeep

**Files:**
- Create: migration `maintenance`, `tests/db/retention.test.ts`
- Modify: `supabase/functions/daily/index.ts`, `supabase/functions/_shared/reminder-email.ts` (`buildHeadsUpEmail(scope: 'household' | 'personal', householdName: string | null, removalMonth: string, appUrl: string)`), `src/lib/reminder-email.test.ts`

**Interfaces:**
- Produces:
  - The `heads_up_sends` table.
  - `claim_heads_ups(p_now) → table(profile_id uuid, email text, scope text, household_name text, removal_month date)`.
    It covers scopes whose window isn't null and that have entries with
    `due_date < scope_today − window + 1 month`, with no `heads_up_sends`
    row. Recipients: the owners (household) or the person (personal).
  - A trigger clearing `heads_up_sends` for a scope when its
    `retention_months` changes.
  - `run_maintenance()`, which runs these in order:
    1. `extend_entries()`
    2. deletes entries (and their payments) with `due_date < scope_today −
       window`
    3. deletes history older than the window
    4. deletes archived bills archived before the window that have no
       entries left
    5. deletes `auth.sessions` with `created_at < now() − 30 days`
    6. prunes `digest_sends` older than 60 days, invites ended over 30
       days ago, and `job_runs` older than 90 days
    7. `record_job_run('maintenance', …)`

    Each step's exception is caught and recorded as `ok = false`.
  - A pg_cron job `maintenance-daily` at `'15 9 * * *'` (UTC).

- [ ] **Step 1: Write the failing tests:**
  - With a 36-month window, an entry 37 months old (and its payments) is
    deleted, and one 35 months old stays.
  - `null` (never) keeps everything.
  - The household window applies to household data and the person's
    window to personal data.
  - History follows the same windows.
  - A heads-up is claimed once per scope, the first time data is within
    one month of the window, to owners only for household data. It's
    claimed again only after the window changes.
  - A 31-day-old session row is deleted and a 29-day-old one stays.
    Insert both via `sql` into `auth.sessions` for a test user.
  - Entries are extended to 12 months after time passes. Simulate this
    by setting a bill's entries to stop at 6 months, then run
    `run_maintenance`.
  - A failing step records `ok = false`.
  - Unit: the heads-up text names the month being removed and the export
    path ("Settings → Export").
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** The daily function sends heads-ups after the
  reminders, using claim → send → (on failure) delete the claim.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "Add retention, heads-up emails, session cap, and nightly upkeep"`

### Task 23: Health check and watchdog (D27)

**Files:**
- Create: migration `health`, `tests/db/health.test.ts`
- Modify: `.github/workflows/daily-health.yml`, `docs/operations.md`

**Interfaces:**
- Produces: `health_check(p_token text) → jsonb` returning
  `{ ok, last_reminders_ok_at, last_maintenance_ok_at, failures_24h }`. It
  raises `forbidden` unless `p_token` equals the Vault secret
  `health_token`. `ok` requires all three:
  - a reminders success within 3 hours,
  - a maintenance success within 26 hours,
  - `failures_24h = 0`.

- [ ] **Step 1: Write the failing tests:**
  - A wrong token gives `forbidden`.
  - With fresh successful runs, `ok` is true.
  - A reminders run 4 hours old makes `ok` false.
  - A failed run in the last day makes `ok` false.
  - The response contains no emails or names.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement the function.** Harden the workflow:
  - `permissions: { actions: write, contents: read }`.
  - The health step fails the job when `ok` is false and prints only the
    field names and timestamps.
  - A final step, `if: always()`, runs `gh workflow enable daily-health.yml`
    and `gh workflow enable backup.yml`, with `GH_TOKEN: ${{ github.token }}`.
  - Confirm in GitHub settings that failed-workflow emails reach Aamir.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Switch to production.**
  - Ask Aamir to update the repo secrets to project A, and to set Vault
    secrets `health_token`, `cron_secret`, and `functions_url` in project
    A's SQL editor.
  - Set the function secret `CRON_SECRET`, then deploy `daily`.
  - Run the workflow manually. Expected: green.
  - Then break it on purpose (temporarily set a wrong `HEALTH_TOKEN`).
    Expected: red, and the failure email arrives. Restore the token.
- [ ] **Step 6: Commit.** `git add -A && git commit -m "Add the health check and the daily watchdog"`

### Task 24: Weekly encrypted backups and a tested restore (D26)

**Files:**
- Create: `.github/workflows/backup.yml`, migration `backup_role`
- Modify: `docs/operations.md` (Restore section), `docs/verify-early.md` (restore result)

- [ ] **Step 1 (Aamir):** Do the account setup:
  - Create a Backblaze B2 account (no card) and a **private** bucket.
  - Add a lifecycle rule: keep only the last version, and delete files
    older than 56 days.
  - Create an application key limited to that bucket, with
    `writeFiles` and `listFiles` and **no** `deleteFiles`.
  - Run `age-keygen` locally. Save the **private** key in Apple
    Passwords plus a printed copy, and never anywhere else.
- [ ] **Step 2: Write the migration `backup_role`.** It creates a login
  role `backup_reader`, granted `pg_read_all_data`, with no other rights.
  Aamir sets its password in the SQL editor; the password is never in the
  migration. **If `pg_read_all_data` can't be granted on Supabase,** stop
  and ask Aamir before using the `postgres` connection string instead.
- [ ] **Step 3: Write the workflow.**
  - Triggers: `schedule: '0 10 * * 0'` and `workflow_dispatch`, with
    `permissions: contents: read`.
  - Install the PostgreSQL 17 client (PGDG apt) and `age`.
  - Run, with `set -euo pipefail`:

    ```bash
    pg_dump "$BACKUP_DB_URL" --data-only --schema=public --schema=auth --disable-triggers \
      --exclude-table=auth.schema_migrations | gzip | age -r "$AGE_RECIPIENT" > "$RUNNER_TEMP/b.age"
    ```

  - Upload with `aws s3 cp` to
    `s3://$B2_BUCKET/bills-$(date -u +%F).sql.gz.age`, with
    `--endpoint-url $B2_ENDPOINT`.
  - Verify the upload is over 1 KB with `aws s3 ls`.
  - Nothing is echoed, and there's no `upload-artifact`.
  - Secrets: `BACKUP_DB_URL` (session pooler, `backup_reader`),
    `B2_KEY_ID`, `B2_APP_KEY`, `B2_BUCKET`, `B2_ENDPOINT`. `AGE_RECIPIENT`
    is a public key, stored as a repo variable.
- [ ] **Step 4: Run it manually.** Expected: green, and one file in the
  bucket.
- [ ] **Step 5: Restore test.** Download the file, then run
  `age -d -i <key> | gunzip > restore.sql` in the scratch folder. Load it
  into a fresh local stack: `npx supabase db reset`, then
  `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f restore.sql`.
  **If `--disable-triggers` is refused,** connect as `supabase_admin`
  instead (the local superuser). Sign in locally as a restored user.
  Expected: their bills are there. Delete the plaintext file afterward.
- [ ] **Step 6: Document the restore** in `operations.md` (exact commands,
  and where the key is). Record the restore date in `verify-early.md`.
- [ ] **Step 7: Commit.** `git add -A && git commit -m "Add weekly encrypted backups and document a tested restore"`

---

## Phase 5: Release

### Task 25: Security headers and a shipped-bundle check

**Files:**
- Create: `scripts/write-headers.mjs`, `scripts/check-bundle.mjs`
- Modify: `package.json` (`deploy` runs both after build), `.github/workflows/ci.yml` (runs `check-bundle` after build)

- [ ] **Step 1: Write the bundle check** `check-bundle.mjs`. It fails if
  `dist/` contains:
  - the string `service_role`,
  - any JWT whose payload has `"role":"service_role"`,
  - `sb_secret_`,
  - or any `SMTP_`/`GMAIL` text.

  Run it on the current build. Expected: PASS. Plant a fake service-role
  JWT in a temp copy of `dist/`. Expected: FAIL.
- [ ] **Step 2: Write `write-headers.mjs`.** It writes `dist/_headers` for
  `/*`:
  - `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' <VITE_SUPABASE_URL>; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`
  - `Strict-Transport-Security: max-age=31536000`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: no-referrer`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- [ ] **Step 3: Deploy and check.** Run `npm run deploy`, then
  `curl -sI <pages url>`. Expected: all the headers. Open the app on
  iPhone and Mac Safari. Expected: no CSP errors in the console (Mac Web
  Inspector), and sign-in, the calendar, and the pay sheet all work.
- [ ] **Step 4: Commit.** `git add -A && git commit -m "Add security headers and a shipped-bundle secret check"`

### Task 26: Production checklist and household acceptance

**Files:**
- Modify: `docs/operations.md`, `docs/SNAPSHOT.md`

- [ ] **Step 1: Walk the production checklist** in `operations.md` against
  the live dashboards.
  - **Auth:** settings from V3; hook on; SMTP on 465; templates
    code-only; Site URL.
  - **Secrets:** all set, and every one listed by name.
  - **Cron:** jobs present (`select * from cron.job`).
  - **Watchdog:** daily-health green 3 days running.
  - **Backups:** a backup exists.
  - **Accounts:** 2FA on the Supabase, Gmail, GitHub, Cloudflare, and
    Backblaze accounts. One admin (Aamir).
- [ ] **Step 2: Run the full test suite** from a clean clone:
  `npm ci && npx supabase start && npx supabase db reset && npm test && npm run test:db`.
  Expected: all green. CI is green on `main`.
- [ ] **Step 3: Household acceptance (Aamir, with the family).**
  1. Add Aamir's household's emails to invites.
  2. Each person installs the app and signs in.
  3. The parents turn on household reminders.
  4. Enter the real bills.
  5. Over the next week, confirm reminder emails arrive at about 8 a.m.
     and stop once a bill is marked paid.
- [ ] **Step 4: Update the snapshot** (stage: v1 live) and commit:
  `git commit -am "Mark v1 live"`. Ask Aamir before pushing.

---

## Design coverage

| Design section | Tasks |
|---|---|
| §5 sign-in, invite-only | V3, V4, V5, 3, 11 |
| §5 households, roles, joining, leaving, account deletion | 2, 3, 8, 17, 18, 19 |
| §6 bills, categories, schedules, entries, status, payments, credit cards, undo, archive, history | 4, 5, 6, 7, 13, 14, 15 |
| §7 look, home calendar, donut, pay sheet, new/edit bill, settings, household screen, first run, offline message | 10–19 |
| §8 reminders, email format, idempotency | 21 |
| §8 retention, heads-up, export | 10, 17, 22 |
| §9 RLS and security tests | 2–9, V5 |
| §9 secrets, admin account, input validation, https links | 1, 4, 25, 26 |
| §9 keep-alive, backups, email sender, health | V1, V2, 23, 24 |
| §11 verify early | V1–V4 (+ V5) |
