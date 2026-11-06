# Project Snapshot

**Last updated:** 2026-11-05 (end of session 8: V1 and V3 done; CI blocked by a GitHub billing lock)

Paste this whole file into a new session to pick up where we left off. The
full reasoning behind each decision is in its own file under
[`docs/decisions/`](decisions/) (linked from the table below), and what the
household needs is in [`docs/requirements.md`](requirements.md). **The
approved design, the single source of truth for building, is
[`docs/design.md`](design.md).** This file is the short version plus where we
are.

---

## Paste-in prompt for a new session

> I'm building a household bill/finance tracker in this repo
> (`~/Developer/finance-tracker`). Brainstorming is done, the design is
> **approved** (`docs/design.md`), and the implementation plan is written
> (`docs/plan.md`). Building has started: Task 1, V1, and V3 are done. Read `docs/SNAPSHOT.md`,
> `docs/design.md`, and `docs/plan.md`, then continue from "Next step"
> below. Record any new decision (with trade-offs and why) as a new file
> `docs/decisions/NNN-short-slug.md`, add it to the table in this snapshot,
> commit in small separate commits, and update this snapshot at the end of
> the session.

---

## What we're building

A tracker that keeps a household from losing track of bills. Today, bills are
tracked by hand with notes. The notes get misplaced, bills get forgotten, and
the first sign of a miss is a late-payment email. The problem is visibility,
not money. Core needs:
- See when each bill is due.
- See whether it's paid or pending.
- See how much is paid, overdue, and left. (Originally "how many"; changed
  to money totals in D11a, since the calendar colors already show status.)
- Data persists between sessions.

## Where we are

- **Stage:** **Building (since 2026-11-01).** The plan, D23–D32, and the
  session 5 calls were approved by Aamir. Task 1 (repo, tooling, CI),
  V1 (Gmail SMTP), and V3 (OTP limits) are done; V4 and V5 are next. Brainstorming followed the superpowers process: questions →
  playback → written design → reviewer check → approval → plan.
- **Repo contents:** `README.md`, `.gitignore`, `docs/SNAPSHOT.md` (this
  file), `docs/design.md` (approved design), `docs/plan.md` (implementation
  plan), `docs/requirements.md`, `docs/decisions/` (one file per
  decision, D1–D32), the app scaffold (Vite + React + TypeScript,
  `src/lib/config.ts`, `vitest.config.ts`), local Supabase config
  (`supabase/`), `.env.example`, CI (`.github/workflows/ci.yml`),
  `supabase/functions/_shared/email.ts` (`sendEmail`),
  `docs/verify-early.md` (V1, V3 results), and `docs/operations.md`
  (accounts, secret names, the production settings checklist).
- **Session 2:** the home screen was designed using browser mockups (the
  superpowers visual companion). The home screen direction is now settled
  (D11, D11a, D11b).
- **Session 3:** data retention, leaving/rejoining/removing members, account
  deletion, and reminder timing were settled (D12–D16). It ended mid-question
  on how reminders are delivered.
- **Session 4:**
  - The decision log was split into one file per decision.
  - Settled: reminder delivery (D17), sign-in (D18), joining (D19), the
    tech stack after researching Supabase and Firebase (D20), the other
    screens via mockups (D21), and invite-only sign-up (D22).
  - All of Claude's calls were confirmed.
  - The design doc was written, reviewed by a builder-check subagent (its
    gaps were settled), moved to `docs/design.md`, and **approved**.
- **Session 5:**
  - Wrote `docs/plan.md` with the superpowers `writing-plans` skill: 5 phases,
    30 tasks, each ending in a small commit.
  - The plan starts with the four design §11 checks (V1–V4) plus a fifth,
    V5: proving the invite-only gate sends nothing to unknown emails.
  - Each §9 security rule maps to a named test file.
  - Checked the free-plan facts the plan depends on:
    - Supabase's "Before User Created" auth hook is on the Free plan.
    - GitHub turns off scheduled workflows in public repos after 60 days
      without activity.
    - Backblaze B2 has 10 GB free with no card.
  - Builder decisions recorded as D23–D28 (Claude's calls, listed below for
    review).
- **Session 5, continued (2026-10-28):**
  - A subagent reviewed the plan and D23–D28 adversarially, checking every
    free-tier claim against current official pages. Everything stays $0
    with no card.
  - It found four problems, now fixed in the plan:
    - **Backups would have been empty:** the backup role needs `BYPASSRLS`.
    - **The scheduled call to the reminder function would have timed out**
      after pg_net's 2-second default.
    - **The plan used Supabase's retiring anon and service_role keys**
      (D30).
    - **A missing test:** an attacker could set a password on an invited
      email before the real person signs in.
  - Aamir chose:
    - **reminders once a day** (D29),
    - **keep the 30-day sign-out,**
    - **keep the GitHub Action as the watchdog,**
    - **drop the early pause test V2** (D31).
  - Also cut:
    - gitleaks (GitHub push protection replaces it),
    - the header-generating and bundle-scanning scripts (a static file and
      a one-line check replace them),
    - a test-only SQL function,
    - two single-use tables.
  - The invite limit now counts invites sent per day.
  - The plan is now 29 tasks.
  - **Pre-push security check:** all git history was scanned. No secrets,
    keys, project URLs, or dumps; only general household facts and Aamir's
    commit email. Publishing the design is safe, because its security
    doesn't depend on secrecy.
  - Two rules came out of the check (D32):
    - nothing in the repo identifies the live deployment (the deploy script
      fills those values in from git-ignored files),
    - Supabase Auth sends at most 10 emails an hour, so code-request spam
      to Aamir's public email can't use up Gmail's daily limit.
  - Everything is pushed to `origin/main`.
- **Session 6 (2026-11-01):**
  - Aamir approved the plan and the session 5 calls, and chose
    subagent-driven execution on `main`, with a small first step.
  - **Task 1 part A done** (Steps 1–6 plus Step 9's `.gitignore` lines):
    - Vite 8, React 19, and TypeScript 7 scaffold, with all the plan's
      dependencies (Vitest 5, Supabase JS and CLI, TanStack Query, React
      Router, vite-plugin-pwa, wrangler, postgres).
    - `src/lib/config.ts` (test-first): `APP_NAME = 'Bills'`, and a clear
      error naming the missing Supabase URL or publishable key. 3 tests
      pass.
    - `vitest.config.ts` with the `unit` and `db` projects.
    - Two commits, reviewed by a subagent, and pushed.
  - Aamir approves every commit before it's made (implementers only stage).
- **Session 7 (2026-11-04):**
  - **Task 1 part B done**, in four commits, reviewed by a subagent and
    pushed:
    - `supabase/config.toml` locked to the production Auth settings
      (6-digit codes, 600 s expiry, 60 s between requests, 10 emails an
      hour, confirmations on, anonymous/SMS/Apple off), and
      `supabase/templates/code.html` (code only, no link). A local test
      email showed a 6-digit code, the 10-minute line, and no link.
    - `.env.example` and `supabase/functions/.env.example` (names only).
    - CI: typecheck, unit tests, build, the bundle secret check, then a
      local Supabase, `db reset`, and the db tests. Read-only token, no
      secrets. **The first run on GitHub passed.**
    - `docs/operations.md` (four empty sections) and a README paragraph.
  - GitHub push protection and secret scanning are confirmed on (read
    through `gh api`), which covers Step 10b.
  - Aamir's pace: about 7 commits per session at most, each approved first.
- **Session 8 (2026-11-05):**
  - **Accounts (Aamir):** the dedicated Gmail sender (2-Step Verification,
    app password "Supabase") and Supabase project A (Free plan, 2FA). The
    repo is linked; the ref lives only in git-ignored `supabase/.temp/`.
  - **V1 passed:** Gmail is the Auth SMTP sender (port 465, name "Bills").
    Sign-in codes and an Edge Function email each reached the inbox in
    under a minute, with no link. `sendEmail` is committed. The temporary
    test function and its secret were deleted.
  - **V3 passed:**
    - an 11-minute-old code is rejected, and codes are single use,
    - one code request per 60 s,
    - about 30 code checks per 5 minutes per IP,
    - `postgres` can delete from `auth.sessions` and has `BYPASSRLS`.
  - **The live project doesn't read `config.toml`.** The first live code
    had 8 digits. Every Auth setting is now set by hand, and listed in the
    production settings checklist in `docs/operations.md`.
  - All six Auth email templates are code-only, in the dashboard and in
    `config.toml`.
  - A security review flagged that `email.ts` could fall back to plain
    text on a STARTTLS port. Fixed with `requireTLS`. It wasn't
    exploitable on port 465.
  - Five commits, pushed. **CI didn't run on the last push:** GitHub says
    "the job was not started because your account is locked due to a
    billing issue." It's not a code failure. The account's paid usage is
    $0 on the Free plan.
- **Mockups:** stored locally in `.superpowers/brainstorm/` (git-ignored, not
  pushed). The final picks are `minimal-v1.html` (layout), `pastel-v1.html`
  (theme, calendar, and donut A), and `screens-v1.html` + `screens-v2.html`
  (the other screens, D21). To view them again,
  restart the visual companion server with
  `--project-dir ~/Developer/finance-tracker`.

## Decisions so far

Click a decision number for the full reasoning. Status key: **Decided**
(settled), **Leaning** (current direction, not final), **Open** (still being
discussed).

| # | Decision | Status |
|---|---|---|
| [D1](decisions/001-the-problem.md) | The problem is losing track of bills, not affording them. Focus on visibility and reminders, not budgeting. | Decided |
| [D2](decisions/002-primary-user-household.md) | Main user is the household; also works for one person. | Decided |
| [D3](decisions/003-multiple-people-updating.md) | Multiple people, each signing in from their own phone. Started as a nice-to-have, now required by D8, D14, and D16. | Decided |
| [D4](decisions/004-devices.md) | iPhone first, Mac second. No Windows or Android. | Decided |
| [D5](decisions/005-web-app-first.md) | **Free web app**, installable on the iPhone home screen, with a hosted online database. Can pivot to a native iPhone/Mac app later on the same data. | Decided |
| [D6](decisions/006-security-first.md) | **Security is the top priority.** The database enforces access, protection is layered, and sensitive data is kept to a minimum. | Decided |
| [D7](decisions/007-minimal-sensitive-data.md) | Never store card numbers, full account numbers, or logins. A nickname, last 4 digits, and a payment link are OK. Logins go in Apple's Passwords app. | Decided |
| [D8](decisions/008-bill-visibility.md) | Household bills are shared with every member. **Personal bills are private to their owner.** Any member can add, edit, or mark household bills paid. | Decided |
| [D9](decisions/009-database-admin-access.md) | The database admin (a family member) could see everything. Accepted; lock the admin account down with a strong password, two-step login, one admin, and no secret keys in code. No encryption for now, but leave room to add it. | Decided |
| [D10](decisions/010-bill-model.md) | Bill model: set up once; each due date is its own entry (pending, paid, or overdue); marking paid records the amount, date, and who paid. The amount is pre-filled but editable, with "Just this time, or from now on?" Every bill has a category (needed by D11b). | Decided |
| [D11](decisions/011-home-screen-calendar.md) | Home screen is a **month calendar**, with due dates color-coded by status. | Decided |
| [D11a](decisions/011a-minimal-and-quiet.md) | **Minimal and quiet; never show the same info twice.** No bill counts, because the colors carry status (green paid, red overdue, yellow upcoming). Show three money totals: paid, overdue, and left. A toggle switches between the calendar view and a chart view. | Decided |
| [D11b](decisions/011b-theme-and-category-donut.md) | **Cream and pastel light theme.** The chart view is a **category donut** ("where does the money go?"): slices are categories sized by their share of the month, solid for paid and pale for still owed. The center shows the amount left of the month's total. | Decided |
| [D12](decisions/012-data-retention.md) | Keep **3 years** of history; older entries auto-delete. **CSV export** anytime. A heads-up a month before deletion with one-tap export, and the window is an adjustable household setting, including "never" (these two are Claude's additions). Storage cost is negligible; the trade-off is privacy. | Decided |
| [D13](decisions/013-leaving-and-rejoining.md) | **Leaving is a deliberate choice** by the member. They keep their account and personal bills and lose access to household bills. They **can rejoin, but only with an owner's approval.** Joining for the first time uses the same flow. History keeps who paid. | Decided |
| [D14](decisions/014-household-owners.md) | **Owner role.** The household creator is the first owner and can make others owners (e.g. both parents). The last owner must hand off before leaving. **Only owners invite, approve joins and rejoins, and remove members.** Owners have no extra power over bills. Named "owner," not "admin," to avoid confusion with D9. | Decided |
| [D15](decisions/015-account-deletion.md) | **Deleting an account** removes personal bills right away. Past household payments show "former member." A permanent-deletion warning and an export are offered first. Provider backups may hold the data briefly. (Claude's recommendation; Aamir asked for it.) | Decided |
| [D16](decisions/016-reminders.md) | **Reminders**, sent only while a bill is unpaid: **1 week before**, **on the due date**, and **once when overdue** (the day after). Marking paid cancels the rest. In this household, the parents get the household bill reminders. | Decided (delivery in D17) |
| [D17](decisions/017-reminder-delivery.md) | Reminders go out by **email**, from a daily server job. Sending needs either a domain (~$10–12/yr) or a dedicated Gmail account (free), to settle with the stack. **Email only for now**; phone notifications (Web Push) can be added later. **Anyone can turn reminders off entirely.** | Decided |
| [D18](decisions/018-sign-in.md) | **Sign in with an emailed 6-digit code**, no passwords. **Face ID (passkeys) later** as an upgrade. Ruled out: passwords, emailed links (an iPhone quirk opens Safari), and Sign in with Apple ($99). | Decided |
| [D19](decisions/019-joining-a-household.md) | **Joining = an owner invites by email.** The invitee signs in with that email and taps Accept. **Rejoining = being invited again** (no request button). Invites expire in 7 days and can be cancelled. Ruled out: shareable links and join codes. (Claude's recommendation; Aamir asked for it.) | Decided |
| [D20](decisions/020-tech-stack.md) | **Supabase** (free) for the database, sign-in codes, and the daily job. A **dedicated Gmail account** sends all email. **React + TypeScript**, installable on the home screen. **Free static hosting** (e.g. Cloudflare Pages). Free-plan catches are handled with a daily keep-alive (it pauses after 1 week idle) and our own encrypted weekly backups (no backups on free). Firebase was ruled out: no 6-digit email code. | Decided |
| [D21](decisions/021-other-screens.md) | **Other screens, mocked up.** The Settings look (grouped rows, one thing per line) sets the style everywhere. Pay sheet: pre-filled, one tap; if the amount differs, a quiet "Use $X from now on" switch. New bill: one calm page (name, Household/Mine, then Amount / Due / Category; extras under "More details"). Edit bill: history as a timeline. Settings and the owner household view approved. | Decided |
| [D22](decisions/022-who-can-sign-up.md) | **Invite-only sign-up.** Only existing accounts, invited emails, or an admin-approved list can sign in; unknown emails get no email at all (protects the Gmail sender). **Other households run their own copy** from the public repo (setup guide later, not v1). | Decided |
| [D23](decisions/023-server-side-sign-in-rules.md) | **Invite-only is enforced by a "Before User Created" auth hook** (Free plan) that allows only pending invites and the `approved_emails` list. Emails are compared lowercased. **30-day sessions** come from a daily cleanup of old sessions. Fallback if the hook leaks email: turn off sign-ups and create accounts on invite. (Claude's call.) | Decided |
| [D24](decisions/024-testing-setup.md) | **Testing:** a local Supabase in Docker plus Vitest. The security tests sign in as real test users and attack each other's data through the real API. GitHub Actions runs everything, plus a secret scan, on every push. (Claude's call.) | Decided |
| [D25](decisions/025-how-entries-are-stored.md) | **Entries are stored 12 months ahead**, made by one SQL schedule function. **Status is computed by a view, never stored.** Schedule changes and archiving replace only untouched future entries. (Claude's call.) | Decided |
| [D26](decisions/026-backups.md) | **Backups:** a weekly dump encrypted with `age` (the Action holds only the public key) to a private **Backblaze B2** bucket (free, no card), auto-deleted after 56 days. Never in Action logs or artifacts. (Claude's call.) | Decided |
| [D27](decisions/027-job-health-and-keep-alive.md) | **Reminder job runs hourly**, sending after 8 a.m. local, and logs each run. A **daily GitHub Action is the keep-alive and the watchdog**: it fails (emailing Aamir) if reminders stopped, and re-enables workflows against GitHub's 60-day rule. (Claude's call.) | Decided |
| [D28](decisions/028-app-tooling.md) | **App tooling:** Vite, React Router, TanStack Query, vite-plugin-pwa, plain CSS tokens, money in whole cents, generated DB types, a service worker that never caches bill data, and Cloudflare Pages with strict security headers. (Claude's call.) | Decided |
| [D29](decisions/029-one-daily-reminder-run.md) | **Reminders run once a day** at a fixed time: 8 a.m. household standard time (9 a.m. in daylight saving). A failed send retries the next day. Replaces D27's hourly runs; everyone on this copy shares one time zone. (Aamir's choice after the plan review.) | Decided |
| [D30](decisions/030-new-supabase-api-keys.md) | **Use Supabase's new API keys:** the publishable key in the app, secret keys only in Edge Functions. Functions identify the caller from their token. The old anon and service_role keys are deprecated at the end of 2026. (Claude's call.) | Decided |
| [D31](decisions/031-pause-check-on-live-project.md) | **Drop the early pause test (V2).** Supabase documents that API calls prevent pausing. Instead, watch the live project for a pause-warning email for its first 3 weeks. (Aamir's choice after the plan review.) | Decided |
| [D32](decisions/032-public-repo-exposure.md) | **The public repo never identifies the live app:** no project URL or ref, Pages address, sender Gmail, bucket name, or family emails. The deploy script fills them in from git-ignored files. **Supabase Auth sends at most 10 emails an hour**, so code-request spam to a known email can't use up Gmail's daily limit. Turnstile CAPTCHA only if abuse appears. (Aamir, after a pre-push check.) | Decided |

## Facts about the household (from Aamir)

- Everyone uses iPhones. Laptops are macOS and Windows, but the app won't be
  used on Windows.
- **Nothing is on autopay, on purpose.** Members get paid at different times,
  and bills are paid by hand once the money is in place.
- Household bills (home, utilities, etc.) are paid from pooled funds and
  managed by the parents. Each person handles their own personal bills (credit
  cards, personal expenses).
- Most bills are steady (home, auto loans, utilities, car insurance). Credit
  cards vary: the minimum changes, and the amount paid depends on what can be
  put down.
- It must be flexible enough for any kind of bill, not just this household's.
- Aamir's experience: HTML, and small React apps (beginner to intermediate).
  No iOS experience. The goal is the best tool for the home, not learning or a
  portfolio piece.

## Claude's calls

All of Claude's calls through D21 were reviewed and **confirmed by Aamir on
2026-10-25**: change history, archiving instead of deleting, the credit card
minimum rule, one month at a time, tap a day for its bills, control placement,
per-person reminder settings, a single overdue reminder, the deletion heads-up
and adjustable window, owners managing owners, sign-in code/session details,
and the invite details.

**Calls from session 5 (confirmed by Aamir on 2026-11-01):**
- D23–D28 as a whole: how the server enforces invite-only and 30-day
  sessions, the testing setup, stored entries, backups, the job watchdog,
  and the app tooling.
- **Totals count what's still owed.** "Overdue" and "left" use the expected
  amount minus anything already paid on that entry. A partial credit card
  payment is then not counted as both paid and owed. (Design §7 said
  "expected amounts.")
- **Household reminders start off; personal reminders start on.** The
  parents turn household ones on, as §8 describes.
- **The retention heads-up is sent once per household or person,** the first
  time data nears the window, and again only if the window is changed. A
  monthly email after year 3 would break "quiet."
- **Overdue reminders are skipped for bills more than 7 days late.** Turning
  reminders back on after months then doesn't send a flood.
- **At most 20 invites created per household per day,** to protect the
  Gmail sender. (Revised after the review: it used to cap pending invites,
  which cancel-and-reinvite could get around.)
- **Deleting a household leaves no history event,** because all its history
  is deleted with it.
- **The working name is "Bills"** (one constant; rename anytime).
- **A sole member must delete the household before deleting their
  account.** The database blocks it otherwise, the same way it blocks a
  last owner.

**New calls from session 6 (build details, not yet reviewed by Aamir):**
- **The Vite scaffold is made in a scratch folder and copied in,** because
  `npm create vite` in the repo can offer to delete existing files.
- **The config test uses `vi.resetModules()` instead of
  `import('./config?missing')`,** which `tsc` can't type-check. Same checks,
  plus one for a missing publishable key.
- **`passWithNoTests` lives in the `test:db` script,** because Vitest 5
  allows it only at the root, not per project.
- **Step 9's `.gitignore` lines came in with the scaffold,** so secrets are
  ignored before any env var exists.

**New calls from session 7 (build details, not yet reviewed by Aamir):**
- **esbuild and workerd install scripts stay unapproved** until something
  needs them (least privilege). Build, tests, and the Supabase CLI work
  without them. Wrangler may need workerd in V4.
- **CI uses Node 26** (the local version), `actions/checkout@v7` and
  `actions/setup-node@v7`, and a read-only token.
- **No `deploy` script yet;** V4 adds it with `scripts/deploy.mjs`.
- **The Supabase CLI stays on v2.122.0** for now (v3.0.0 is out).
- **Only the code and confirmation emails are code-only so far.** The
  password-reset, email-change, invite, and re-authentication templates
  still have Supabase's default links. They go only to the account's own
  inbox. Make them code-only in V3.

**New calls from session 8 (not yet reviewed by Aamir):**
- **The Gmail app password never passes through Claude.** Aamir typed it
  into the dashboard and into a file outside the repo, which went straight
  to `supabase secrets set` and was then deleted.
- **Edge Functions that import `_shared/email.ts` get their own
  `deno.json`** (`{"imports":{},"nodeModulesDir":"none"}`). Without it,
  Deno resolves through the root `package.json` and fails.
- **Deploy with `--use-api`,** so Supabase bundles on its side and Docker
  isn't needed.
- **`sendEmail` sets `requireTLS` on non-465 ports,** so it never sends
  the password unencrypted.
- **The four unused Auth templates use the same code-only body,** with
  the subject "Your Bills code".
- **Claude wrote the verify-early results and `operations.md` itself,**
  because they record what was seen and set together in the session.

Any new calls go in a fresh list here.

## Ruled out (and why)

- **Native iOS app for now:** it needs the $99/year Apple Developer Program.
- **Free Xcode installs:** they expire every 7 days and have no iCloud sync.
- **AltStore/SideStore:** hacky, no iCloud sync, 3-app limit.
- **App Store or TestFlight:** they still need the $99 program.
- **Browser-only storage:** iOS can wipe it, and it can't be shared.
- **Encrypting personal bills on the device:** a forgotten passphrase means
  permanent loss; deferred.
- **Home screen layouts:** a donut on top, and number tiles with a progress
  bar. The calendar won.
- **Counts above the calendar** (chips, big tiles, or a small donut): too
  cluttered, and they repeat the calendar colors.
- **A plain pie of paid/overdue/left:** it looked plain and repeated the
  calendar. Sized by dollars, a small overdue bill also became an invisible
  sliver.
- **Progress rings per category:** pretty, but they hide how big each
  category is.
- **Letting anyone remove anyone:** too lax. **A single admin:** a single
  point of failure. **Hard-coding "parents":** doesn't fit other households.
  The multi-owner role replaced all three.
- **Former members rejoining on their own:** anyone ever in the household
  could look again at will.
- **Keeping a deleted account's name on household history:** "delete" should
  mean gone.

## Open topics

None. Everything needed to plan the build is decided.

## Next step

1. **Aamir: clear the GitHub billing lock.** Go to github.com → Settings →
   Billing and licensing, look for a locked-account or failed-payment
   banner, and fix or remove the payment method it names. Then re-run the
   last CI run (`gh run rerun <id>`) and check it's green.
2. **V5: the invite-only gate.** This is mostly Claude's work, with no new
   accounts: the "Before User Created" hook, `tests/helpers/env.ts` and
   `db.ts`, and `sign-up-gate.test.ts`, then applying the hook to project
   A and proving an unknown email gets no email and no account.
3. **V4: the iPhone install check.** Aamir creates a free Cloudflare
   account. The app is deployed once, added to the iPhone home screen,
   and a sign-in code is used inside it. Wrangler may need the skipped
   workerd install script approved first.
4. **Then Phase 2** (Tasks 2–9: schema, RLS, and the §9 security tests).
5. **Ask before every commit and every push.** About 7 commits per
   session.

## Working conventions

- Design taste: minimal, quiet, no repeated information, cream and pastels.
  Aamir prefers reacting to visual mockups for anything on screen.
- Docs live flat under `docs/` (`design.md`, `plan.md`, `decisions/`), not
  in nested skill-default folders.
- Small, meaningful commits, including for planning docs. One decision per
  commit where practical.
- Each decision gets its own file, `docs/decisions/NNN-short-slug.md`, under
  a page long: context, decision, why, and the options ruled out. If a later
  decision changes an earlier one, add a short dated "Update" note to the
  earlier file instead of rewriting it.
- Commit as `Aamir Khan <aamirksfg@gmail.com>` (check `git config
  user.email` before the first commit of a session).
- Remote: `origin` → `https://github.com/Akhan521/Finance-Tracker.git`,
  branch `main`.
