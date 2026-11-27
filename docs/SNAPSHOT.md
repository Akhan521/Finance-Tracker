# Project Snapshot

**Last updated:** 2026-11-26 (end of session 19: the Household screen, invites by email, and deleting a household done)

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
> (`docs/plan.md`). Phase 2 is complete and live; Phase 3 (the app) is under way: Tasks 10 to 18 and V4's local sign-in are done. Read `docs/SNAPSHOT.md`,
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
  V1 (Gmail SMTP), V3 (OTP limits), and V5 (the invite-only gate) are
  done. Phase 2 is under way: Tasks 2 (profiles, households, memberships),
  3 (invites, joining, roles), 4 (categories, bills), 5 (schedules,
  stored entries), 6 (payments, entry status), 7 (change history), and
  8 (deleting households and accounts), and 9 (the whole-schema sweep
  and the first push to project A) are done: **Phase 2 is complete and
  live.** The keep-alive part of Task 23 is live too. **Phase 3 has
  started:** Task 10 (pure logic), V4's local half (code sign-in), and
  Task 11 (app shell, theme, first run) are done, and so are Tasks 12
  (home calendar), 13 (day list and pay sheet), 14 (new bill), 15 (edit
  bill, history, archive), 16 (category donut), and 17 (settings, create and
  leave household, CSV export), and 18 (household screen, invites by email,
  delete household). V4's
  iPhone half (PWA,
  deploy, home-screen check) waits until Aamir has his iPhone. Brainstorming followed the superpowers process: questions →
  playback → written design → reviewer check → approval → plan.
- **Repo contents:** `README.md`, `.gitignore`, `docs/SNAPSHOT.md` (this
  file), `docs/design.md` (approved design), `docs/plan.md` (implementation
  plan), `docs/requirements.md`, `docs/decisions/` (one file per
  decision, D1–D34), the app scaffold (Vite + React + TypeScript,
  `src/lib/config.ts`, `vitest.config.ts`), local Supabase config
  (`supabase/`), `.env.example`, CI (`.github/workflows/ci.yml`),
  `supabase/functions/_shared/email.ts` (`sendEmail`),
  `docs/verify-early.md` (V1, V3, V5 results), `docs/operations.md`
  (accounts, secret names, the production settings checklist), the first
  migrations (`sign_up_gate`, `households`, `invites`, `bills`,
  `entries`, `lock_schedule_helpers`, `payments`, `history`, `deletion`,
  `health`), the `delete-account` Edge Function, the daily-health
  workflow, generated DB types, and the
  db test helpers and security tests under `tests/`.
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
- **Session 9 (2026-11-06):**
  - **V5 passed.** Migration `sign_up_gate` adds `approved_emails` (RLS on,
    unreadable by clients) and the Before User Created hook. The hook
    allows only listed emails, compared as `lower(trim(email))`, and
    refuses everything else with `403 Signups not allowed`.
  - **8 security tests** in `tests/security/sign-up-gate.test.ts`, written
    first and reviewed (opus):
    - an unknown email gets no email and no account, and the same for a
      password sign-up,
    - approved emails and existing accounts get a code,
    - clients can't call the hook or read the list.
  - **Shared test helpers** (`tests/helpers/`), and `tests/**` is now
    type-checked with `strict`.
  - **Live project:** `db push --linked`, Aamir added to `approved_emails`,
    and the hook enabled in Auth Hooks.
    - Unapproved `+test` and `+test2` aliases were refused, with no email
      and no account.
    - An approved `+approved` alias got its code in under a minute. The
      test user and list entry were deleted.
  - **D23's fallback isn't needed.**
  - Four commits, plus this snapshot fix.
  - **Billing lock cleared by Aamir.** CI re-ran on `be03ea0` and passed:
    typecheck, 3 unit tests, build, the bundle check, and **8 db security
    tests** on a fresh local Supabase. It was the first CI run with db
    tests.
- **Session 10 (2026-11-07):**
  - Aamir kept the day light (2–3 commits) and **deferred V4**, because it
    needs his iPhone. Phase 2 doesn't depend on V4.
  - **Task 2 done:** migration `households` adds `profiles`,
    `households`, and `memberships`, with RLS and column grants as in the
    plan's data model:
    - the functions `is_member`, `is_owner`, `my_household_id`,
      `create_household`, and `household_names`,
    - a trigger that makes a profile for each new account, validating the
      time zone hint,
    - a deferred `memberships_keep_an_owner` rule.
  - A profile is backfilled for existing accounts, so the live account
    works after Task 9's push.
  - **Review (opus) found the plan's "new functions start closed" line was
    a no-op.** Proved on the local DB: a new function was callable by
    anon. Fixed with `alter default privileges for role postgres …`. A new
    `defaults.test.ts` proves it, and it fails under the old line.
  - **18 db tests pass** (9 membership, 1 defaults, 8 gate), all written
    first. Local only; nothing pushed to project A.
- **Session 11 (2026-11-12):**
  - **D23's deciding test failed.** An attacker's password sign-up for an
    invited email survived the real person's code sign-in, so the attacker
    could sign in as them. It was caught locally; the live project wasn't
    exposed (no invites there yet).
  - **Aamir chose D33:** a trigger on `auth.users` blanks every password,
    so no password ever works. The hook and the invite design stay.
    - Review read GoTrue's source and confirmed it treats a blank password
      as "no password".
    - Tests cover three cases: the attacker's sign-up, an account created
      with a password, and a signed-in user setting one.
  - **Task 3 done** (migration `invites`):
    - invites are owner-only: create, see, cancel, at most 20 a day, and a
      cancelled invite can't be revived,
    - `accept_invite` only for the invited, confirmed email (read from
      `auth.users`), once, before expiry,
    - `my_invites`,
    - the hook also allows pending invites,
    - leaving, removal, and role changes, with the last-owner rule intact.
  - **Review (opus) found a leak:** the definer insert trigger ran its
    checks before RLS, so a non-owner could learn whether an address was
    invited. Fixed: the owner check runs first (`42501`).
  - **36 db tests pass.** A full run sends 7 Auth emails and takes about
    80 s (one 60 s wait in the D23 test).
  - A slip, fixed before pushing: the D33 commit first swept in the
    implementer's staged files. It was soft-reset and redone. Commits now
    use an explicit file list.
- **Session 12 (2026-11-13):**
  - **Task 4 done** (migration `bills`): `categories` and `bills`.
    - Household bills: shared with members. Personal bills: private to
      their owner.
    - Scope is fixed at creation, and there is no delete.
    - Input checks: last4 is 4 digits; `pay_url` is https only, at most
      500 characters, no whitespace; money is bounded; names can't be
      blank.
    - Six default categories for every new household and person. Existing
      ones were backfilled, including the live account.
    - `can_access_bill`, which later tasks build on.
    - The category check is SECURITY INVOKER, so it can't leak (the lesson
      from Task 3).
  - **Review (opus) found** that a weekly bill could be saved without its
    interval: a CHECK passed on NULL. Fixed, with tests.
  - **Task 5 done** (migration `entries`):
    - `due_dates`, the one schedule calculation (the month-end clamp
      doesn't drift; Feb 29 falls on Feb 28),
    - `scope_today`, and entries stored 12 months ahead,
    - the sync trigger for schedule changes, archive and restore, and
      amount changes,
    - only credit card entries can hold a minimum or statement balance.
  - **Review (opus) found** that a bill with an ancient anchor created
    unlimited entries (year 0001 gave 105,757). It also found two tests
    that couldn't fail. Fixed: see the call below, plus tightened tests
    (to-the-day horizon, two time zones a full day apart).
  - **60 db tests pass.** Two commits, plus this snapshot.
- **Session 13 (2026-11-15):**
  - **Security fix first** (migration `lock_schedule_helpers`). After
    session 12's push, an automated security review flagged two issues;
    neither was live yet:
    - `due_dates` is now revoked from clients. A client could have asked it
      for huge ranges.
    - `scope_today` is now SECURITY INVOKER. As definer, it revealed any
      household's time zone to anyone who knew the id.
    - Review (opus) confirmed both closed in the catalog, with no indirect
      path. Entry generation and Task 6's view still get the right dates.
  - **Task 6 done** (migration `payments`):
    - `payments`: `paid_by` is forced to the caller; no update; undo is a
      delete; access follows the bill,
    - `status_rule`, the one copy of the rule,
    - `entry_view` (security_invoker): paid, target, and status, in the
      scope's time zone,
    - future entries with a payment now survive schedule changes,
      archiving, and amount changes (Task 5's staged gap, now closed).
  - **Task 7 done** (migration `history`):
    - read-only history for bills, payments, invites, and membership,
    - personal history goes only to its owner,
    - invite rows go only to owners (§9 wins over the plan's data model),
    - last4 and pay_url are recorded only as "changed",
    - triggers skip when the parent is gone, so deleting a household or an
      account never fails.
  - **88 db tests pass.** Three commits, plus this snapshot.
- **Session 14 (2026-11-16):**
  - **Task 8 done** (migration `deletion` plus the `delete-account` Edge
    Function):
    - `delete_household`: sole owner only, with the row locked,
    - `account_deletion_blocker`,
    - an `auth.users` delete trigger that erases the person's email from
      invites and invite history.
  - **The function:**
    - identity only from `auth.getUser(token)`,
    - the blocker is checked as the user,
    - the secret key is used only for `deleteUser`,
    - CORS from an `ALLOWED_ORIGIN` list,
    - strict key parsing that fails closed,
    - supabase-js pinned exactly, with a `deno.lock` that holds integrity
      hashes.
  - **Three review rounds (opus).** Live probes found no way to delete
    anyone but the token's owner. The second round caught a deadlock that
    the first round's new lock had introduced; fixed with `FOR NO KEY
    UPDATE` and a concurrency test. A pre-existing write-skew in the
    last-owner rule (Task 2) was also closed and tested.
  - **Task 9's sweep:** `schema.test.ts`, 24 catalog checks with "proves it
    bites" tests:
    - RLS everywhere, invoker views, a pinned `search_path`, definer
      functions owned by postgres,
    - no PUBLIC execute; anon gets nothing, including column grants and
      default ACLs,
    - authenticated may call exactly 12 functions, matched by full
      signature.
    - The schema passed on the first run.
  - **Test audit (at Aamir's request).** Two opus auditors read every
    test. The verdict was trustworthy: of 109, 97 were Sound, 11 Weak, 1 a
    flaky risk, and 0 Wrong, and the product behaved correctly
    throughout. Fixed the 4 Important gaps:
    - the "today" boundary, now biting at every hour across two zones,
    - housemate profile edits,
    - member household updates,
    - blocker error checks.
    - Plus minors, and a 30 s db test timeout.
  - **D34** (Aamir): housemates may read each other's full profile row,
    but not edit it. A test pins it.
  - **142 db tests pass.** Four commits, plus this snapshot. CI checks
    them on push.
- **Session 15 (2026-11-17):**
  - **The live project had paused**: idle for 10 days with no keep-alive
    yet. Aamir restored it from the dashboard; no data was lost. This is
    the "silent failure" risk in action, so the keep-alive was brought
    forward from Task 23.
  - **Task 9, Step 4 done:** `db push --linked` applied 8 migrations to
    project A (the sign-up gate was already live). Aamir's SQL check
    confirmed:
    - no account has a password, and the blanking trigger exists,
    - his profile and six categories exist,
    - the approved list and hook function are intact,
    - the hook is still ENABLED.
  - **Keep-alive** (migration `health` plus `.github/workflows/daily-health.yml`):
    - `job_runs`, with no client access,
    - `health_check(p_token)`: anon-only, token from Vault, a uniform
      `forbidden`, returns only timestamps and `ok`,
    - a daily Action at 17:00 UTC that calls it, masks the output, prints
      only field names and a status code on failure, and re-enables itself.
    - The watchdog switch (`WATCHDOG_ENFORCE`) is off until Task 23.
  - **Review (opus) found a Critical issue:** `job_runs` was fully open to
    `authenticated`. Postgres's default table and sequence grants for
    authenticated had never been closed; only anon had. TRUNCATE bypasses
    RLS. It was fixed before going live, along with the leftover
    `history_id_seq` grant (live since that morning's push).
    - Authenticated's defaults are now closed.
    - The sweep now catches signed-in access to policy-less tables and
      sequences, plus risky privileges (TRUNCATE, REFERENCES, TRIGGER,
      MAINTAIN) anywhere.
  - **Production setup:**
    - Aamir created the token on his Mac and stored it in Vault and as the
      `HEALTH_TOKEN` repo secret. It never passed through Claude.
    - Claude set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` as repo
      secrets, piped in without being printed.
    - The first manual run was green (`ok: false`, as expected with no
      jobs yet), and its public log contains no identifiers.
  - **163 db tests pass.** One commit, plus this snapshot.
- **Session 16 (2026-11-18):**
  - **The daily health Action's first scheduled run was green.** GitHub
    started it about 6 hours after its 17:00 UTC slot, which is normal and
    is why it runs daily.
  - **Task 10** (`src/lib/money.ts`, `calendar.ts`, `totals.ts`, `csv.ts`;
    60 unit tests):
    - money parsing with integer math only,
    - `$1,980` / `$1,980.50`,
    - time-zone-proof month grids,
    - day status,
    - totals where owed is `max(target − paid, 0)`,
    - donut slices whose center always equals totals overdue + left,
    - CSV with every cell quoted and formulas neutralized.
  - **V4's local half: code sign-in** (`src/lib/supabase.ts`,
    `src/auth/useSession.ts`, `SignIn.tsx`):
    - the email is trimmed and lowercased,
    - the neutral message shows in every case, including 429 (review
      reversed my distinct wait message),
    - digits only, and pasted codes are cleaned (review caught that
      `123 456` broke),
    - a 60 s resend lock.
  - **Task 11: the app shell:**
    - router and gate: sign-in → name step → "Join <household>?" → app,
    - calm loading and error states with Try again,
    - the query cache is cleared on every sign-out, with no cross-user
      flash,
    - `errors.ts` covers every key the migrations raise (derived in the
      test),
    - the full theme, with a contrast test bound to `theme.css`,
    - UI primitives,
    - first-run Home.
  - **Every screen was shown to Aamir at iPhone width** (390 px, in the
    browser against the local stack) before its commit, and approved.
  - **143 unit tests and 163 db tests pass.** Three commits, plus this
    snapshot.
  - **After the snapshot: a CI false alarm.** The bundle secret check
    failed on the first app build because supabase-js itself contains the
    text `sb_secret_` (it refuses secret keys in the browser). The check
    now matches key values (`sb_secret_` plus 16 or more key characters),
    and was confirmed to still catch a fake key. One more commit.
- **Session 17 (2026-11-24):**
  - **The daily health Action stayed green:** 7 scheduled runs, 11/18 to
    11/24.
  - **Task 12: the home calendar** (`src/home/`):
    - the month grid, each day filled with its most urgent status, today
      outlined,
    - totals ("$X paid / overdue / left"), each labelled once, and no bill
      counts anywhere, including screen-reader labels,
    - month arrows, the calendar/chart toggle (chart is a placeholder until
      Task 16), and the Household / Mine switch, remembered in `last_view`
      and hidden without a household,
    - "today" and the default month come from the scope's time zone
      (`todayIn`),
    - review caught a top bar that overflowed at 390 px and a false
      "Nothing due this month. $0" flash while loading; both fixed.
  - **Task 13: the day list and pay sheet** (the first screen that writes):
    - tap a day to list its bills, tap a bill for the pay sheet,
    - amount pre-filled; a different amount offers "Use $X from now on",
    - "Paid on" defaults to the scope's today and can't be in the future,
    - credit cards get minimum and statement fields, saved on close
      without a payment,
    - recorded payments with an inline "Remove this payment?" undo,
    - `Sheet` now traps Tab focus,
    - the preview caught a paid bill still inviting a second full payment
      (now blank with a "Paid" pill) and the day list reusing the calendar's
      fill classes (status showed as a full-width bar).
  - **Task 14: the new bill page** (`src/bills/`):
    - name, Household / Just mine, Amount, Due with schedule, Category,
      More details (nickname, last 4, https payment link),
    - checks match the database limits, and the insert sends exactly the
      granted columns (tested against the real calls),
    - custom categories inline, with a 12-colour palette
      (`src/lib/palette.ts`, contrast-tested).
  - **Every screen was tried against the local database at iPhone width**
    (390 px) and shown to Aamir before its commit.
  - **258 unit tests and 163 db tests pass.** Three commits, plus this
    snapshot. From this session on, commits carry no AI attribution
    trailer (Aamir's global instructions).
- **Session 18 (2026-11-25):**
  - **The daily health Action stayed green** (11/24 and 11/25 runs).
  - **Task 15: edit bill, history timeline, archive** (`src/bills/EditBill.tsx`,
    `HistoryTimeline.tsx`, `src/settings/ArchivedBills.tsx`):
    - the same rows as New bill; Save sends only changed columns; "Done"
      when nothing is pending,
    - the history timeline (green dots for payments, lavender for changes;
      "was <old> · <date> · <name>"; dates in the scope's zone; last 4 and
      payment-link changes never show values; a schedule change is one line),
    - archive with an inline confirm; the Archived bills page with Restore.
  - **Task 16: the category donut** (`src/home/DonutView.tsx`, `arcs.ts`,
    `deepen.ts`):
    - inline SVG arcs, rounded ends, 2° gaps, a minimum slot so small
      categories stay visible,
    - paid in a deeper shade of each category colour, owed in the stored
      pastel (matches mockup A within a tested margin),
    - center "$X left of $Y"; the legend drops "of $N left" when all of it is
      overdue; the totals row hides in chart view,
    - review caught a real bug, also present in Task 12's calendar: after a
      Household/Mine switch the previous scope's rows showed until the new
      fetch landed. Placeholder data is now kept across months only, never
      across scopes.
  - **Task 17 in three commits (Aamir asked for meaningful pieces):**
    - **17a, the settings screen:** reminders, lead time, keep history, name,
      Sign out and Sign out of all devices, links; saves on change, a failed
      save reverts with calm copy; Home's temporary Sign out is gone.
    - **17b, create and leave household:** create (device zone, fixed after);
      leave with an inline confirm; last owner blocked with mapped copy; a
      sole member sees a note instead; every household-scoped cache is
      removed only after the server confirms the leave.
    - **17c, CSV export:** `bills-YYYY-MM-DD.csv` with the Excel marker (BOM,
      Aamir's choice), plain decimal amounts, one row per payment, every
      select paged in a stable order, entries through the end of the current
      month plus any entry with a payment; never last 4, links or nicknames.
  - **Every screen was tried against the local database at iPhone width**
    (archive and restore, leave and create, sign out and back in, a captured
    export) and shown to Aamir before its commit. Test data was restored
    after each check.
  - **398 unit tests and 163 db tests pass.** Five commits, plus this
    snapshot.
- **Session 19 (2026-11-26):**
  - **The daily health Action stayed green** (11/25 and 11/26 runs).
  - **Task 18 in three commits:**
    - **18a, the Household screen** (`src/settings/HouseholdScreen.tsx`,
      `LeaveHousehold.tsx`): members with Owner/Member labels and "(you)";
      owners tap another member to make them owner/member or remove them
      (inline confirm); the household's Keep history for (owners only);
      Leave shared with Settings. Writes that RLS silently filters now
      raise `no_access` ("You can't do that anymore. Refresh and try
      again."); checked live by demoting the owner behind the app's back.
    - **18b, invites by email** (`supabase/functions/invite/`,
      `_shared/smtp.ts`): the caller is identified only by its token, the
      insert runs as the caller (RLS and the trigger decide), one email per
      invite, a failed send cancels the invite, nothing reveals whether an
      address has an account, and the function never loads the secret key.
      An opus security review found that the address check let address-list
      syntax through (nodemailer would deliver elsewhere and bypass
      already_invited); it is now a strict pattern in the function and the
      app. Local email goes to Mailpit through a plaintext mode that needs an
      exact local host AND a local `SUPABASE_URL` and sends no credentials;
      production SMTP options are pinned by a test. invite's `deno.lock` was
      hand-merged (no Deno here); its hashes were checked against npm.
    - **18c, deleting a household:** sole owner only; warning, "Export first"
      (shared `useCsvExport`), the household name typed exactly to enable
      Delete; caches removed and straight to Settings ("Household deleted.").
      A new contrast-tested `--danger` colour marks every destructive link,
      and disabled link buttons now look disabled.
  - **Every piece was tried against the local stack at iPhone width:** roles
    and removal, invites read back from Mailpit, a throwaway household
    deleted with its cascade checked. Test data was restored each time.
  - **476 unit tests and 209 db tests pass.** Three commits, plus this
    snapshot.
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
| [D33](decisions/033-no-passwords-at-all.md) | **No password ever works.** A trigger on Supabase's user table blanks every password, so an attacker's sign-up for an invited email (which D23's test showed survives the real person's code sign-in) can never be used. Sign-in stays code-only (D18); the invite design and the hook (D23) stay. Tests and CI guard it; D23's fallback stays in reserve. (Aamir, after Task 3's test failed.) | Decided |
| [D34](decisions/034-housemates-read-full-profiles.md) | **Housemates may read each other's full profile row** (time zone, reminder settings), as the plan's data model has it, but **not edit it**; the app shows only names. A deliberate exception to §9's wording; a test pins it. (Aamir, after the test audit.) | Decided |

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

**New calls from session 9 (not yet reviewed by Aamir):**
- **Generated DB types start in V5** (`src/lib/database.types.ts`), the
  first migration, instead of waiting for Task 2.
- **The test helpers use the local publishable and secret keys** (D30),
  read from `npx supabase status -o env`.
- **Local Auth keeps the production email limit** (10 an hour); the
  gate's tests send 3 emails a run. A rerun that trips the limit needs a
  stack restart.
- **Extra tests beyond the plan:** clients can't call the hook or read
  `approved_emails`, and the hook's exact 403 for missing, blank, and
  unknown emails.
- **`tests/**` is type-checked, with `strict`.**
- **Two facts later tasks must respect:**
  - admin `createUser` (secret key) skips the hook, so server code that
    creates users must check invites itself,
  - Auth rejects emails with spaces around them, so the sign-in screen
    trims and lowercases first (Task 11).
- **The fix round after review was verified by Claude directly,** not by
  a second subagent review (small, test-only changes).

**New calls from session 10 (not yet reviewed by Aamir):**
- **Phase 2 started before V4.** Nothing in the schema depends on the
  iPhone check.
- **The households migration backfills profiles** for accounts that
  already exist.
- **The plan's Task 2 default-privileges line was replaced.** The plan's
  intent (new functions and tables start closed) wins over its literal
  text. Task 9's sweep should keep asserting this.
- **Clients can edit `time_zone`,** so a trigger validates it
  (`bad_time_zone`), beyond the plan.
- **Deferred:**
  - `create_household` turns a bad name into a raw constraint error, not
    a plan key, and names are stored untrimmed (the UI trims, Task 11),
  - a `not_signed_in` error key exists that isn't in the plan's list (add
    it to `src/lib/errors.ts`).

**New calls from session 11 (not yet reviewed by Aamir):**
- **New error key `invite_not_pending`** (cancelling an invite that isn't
  pending). Add it to `src/lib/errors.ts` in Task 11.
- **Invite inserts force server-set columns** (`invited_by`, dates).
  Clients may send only `household_id` and `email`.
- **`my_invites` also requires a confirmed email,** matching
  `accept_invite`.
- **Generated types stay as the generator's raw output,** never
  reformatted.
- **At Task 9's push:** check that the live database has the
  `auth_users_blank_password` trigger and no password, and that the
  profile trigger works. It's the first migration that writes to
  `auth.users` on the live project.

**New calls from session 12 (not yet reviewed by Aamir):**
- **A new bill's entries start from its due date, but at most 1 month
  back.** A just-missed bill still shows as overdue, and a mistyped year
  can't flood the database. Schedule changes and restores never add past
  entries.
  - Edge case: a one-time bill dated more than a month ago gets no entry.
- **"Untouched" future entries currently means "no saved minimum".**
  Task 6 adds "and no payments", in both the schedule-change and the
  usual-amount paths.
- **The six category colors** (Housing #F7D9C4, Car #CFE3F7, Utilities
  #FBEFB5, Insurance #D9D2F0, Credit card #F5CBD6, Internet & phone
  #CDEBDD) sit close to the status colors (butter, rose, sage). Task 11
  should pick category hues that are clearly distinct from the status
  colors.
- **Names are trimmed for length and uniqueness checks.** Whitespace-only
  names are refused, and "Housing " counts as "Housing".
- ~~`scope_today` stays security definer.~~ Superseded in session 13: it
  is now SECURITY INVOKER (see below).

**Calls from session 13** (see session 14 for follow-ups):
- **`scope_today` is SECURITY INVOKER and `due_dates` is internal-only.**
  The plan's data model listed both as definer and client-callable.
- **Plan correction:** Task 6's time zone test assumed daylight time on
  2027-03-10, but US daylight saving starts 2027-03-14. The test instants
  were corrected (07:30Z upcoming, 08:30Z overdue).
- **A new usual amount updates every future entry with no payment** (D25,
  "future unpaid"). A saved minimum doesn't block it, which keeps
  `target_cents` from going stale.
- **Invite history (`invite_sent`, `invite_cancelled`) is owners-only,**
  per design §9. Other household history goes to all members.
- **History triggers skip writing when the parent is gone,** so cascaded
  deletes never fail. Deleting a household leaves no event.
- **For Task 8:**
  - Deleting an account in the same transaction that inserted one of its
    payments fails (a pre-existing FK ordering issue). Don't do both in one
    transaction.
  - Invite rows and invite history keep an invitee's email after they
    delete their account. Decide whether to clear it.
  - Expired invites that are auto-retired show as `invite_cancelled` by
    the re-inviting owner.

**New calls from session 14 (not yet reviewed by Aamir):**
- **`delete-account` CORS** uses an `ALLOWED_ORIGIN` list (exact match).
  The local value is `http://localhost:5173`; production is set at deploy.
- **The function prefers the new key env vars** (`SUPABASE_*_KEYS`, JSON
  maps; `default` wins). It falls back to the legacy names only when those
  are absent, and fails closed if they're present but invalid.
- **Edge Function libraries are pinned exactly.** `delete-account` keeps a
  `deno.lock`. Future functions that import `_shared/email.ts` need their
  own lock.
- **Locks:**
  - `delete_household` takes `FOR UPDATE` on the household,
  - the last-owner trigger takes `FOR NO KEY UPDATE`, which serializes
    without clashing with history's foreign keys,
  - this relies on READ COMMITTED.
- **The sweep's anon allow-list is `health_check`** (Task 23). The
  authenticated allow-list is 12 exact signatures; add to it when a client
  function is added.
- **To verify at the first deploy:**
  - the `delete-account` preflight (the function, not the gateway, answers
    `OPTIONS`),
  - the hosted key env names and JSON shape,
  - a throwaway 204 delete,
  - a 401 for a revoked token,
  - a 409 for `last_owner`,
  - that `deno.lock` v5 is accepted,
  - that `verify_jwt` still works if the project moves to asymmetric
    signing keys.
- **For Task 19:** map `could_not_delete` (not a plan key) in
  `src/lib/errors.ts`, and treat `FunctionsFetchError` (a gateway 401 with
  no CORS headers) as "sign in again".
- **Kept as is:** expired invites that are auto-retired show as
  `invite_cancelled` by the re-inviting owner.
- **A full local test run sends 7 Auth emails** (the limit is 10 an hour).
  A second full run within the hour needs a stack restart.

**New calls from session 15 (not yet reviewed by Aamir):**
- **The keep-alive came before Phase 3** (Aamir agreed). It runs daily
  (Aamir's choice) at 17:00 UTC.
- **`job_runs` is created in migration `health`.** Task 21 must not
  recreate it; `docs/plan.md` still lists it under Task 21.
- **Authenticated's default privileges on tables and sequences are
  closed.** New tables and sequences start closed to everyone, and every
  grant must be explicit.
- **The anon allow-list is the exact signature `health_check(text)`.**
- **The health token lives in Vault, Apple Passwords, and the repo
  secret.** Create and rotate it in the dashboard's Vault UI; the SQL
  editor would keep it in its history.
- **For Task 23:**
  - set `WATCHDOG_ENFORCE: 'true'`,
  - add `backup.yml` to the re-enable step (Task 24),
  - note that a reminder run that *never writes a row* is caught a day
    late (25 h old at check time, under the 26 h threshold), while a
    failed run is caught at once.
- **Deferred:** `supabase_admin` default ACLs in public still grant
  everything to clients. They're harmless while every migration runs as
  postgres.

**New calls from session 16 (not yet reviewed by Aamir):**
- **V4's local half (sign-in) was built now,** because Task 11 needs it.
  PWA, deploy, and the iPhone check stay with V4.
- **Sign-in shows the same neutral message for a 429.** The app's own
  60 s lock covers the wait.
- **Accepted residual risk:** a direct API caller (not the app) might tell
  which emails have access by requesting two codes in a minute. Supabase's
  per-email 60 s limit may only apply to emails that got a code. This is a
  server-side property; D32's Turnstile is the fallback if abuse appears.
- **The donut's "left" includes overdue,** so center left = overdue + left
  from the totals.
- **CSV:** CRLF line endings, every field quoted, no BOM (add one in
  Task 17 if Excel garbles names). Task 17 must never pass a negative
  amount string.
- **The field border is darkened to #8a8378** (3.48:1, WCAG non-text).
- **The invite banner's "Not now"** hides it for the browser session,
  per user.
- **Home has a temporary Sign out** until Settings (Task 17).
- **Category colors still match the seeded hexes,** which sit near the
  status colors. Show Aamir palette options when the calendar and donut
  appear (Tasks 12 and 16).
- **For Task 13:** add a Tab focus trap to `Sheet` (`aria-modal`), and a
  persistent live region for `OfflineBanner`.
- **For Task 19:** map `FunctionsFetchError` (a gateway 401) to "sign in
  again". `could_not_delete` already has copy.

**New calls from session 17 (not yet reviewed by Aamir, except where noted):**
- **Category palette approved as is** (Aamir, 2026-11-24): the 6 seeded
  colours plus Peach, Seafoam, Periwinkle, Blush, Pistachio, Sand. Easy to
  revisit later.
- **"Today" always means the scope's local date:** the household's zone for
  household bills, the profile's zone for personal ones. This drives the
  calendar outline, the default month, and "Paid on".
- **"Minimum covered" counts only recorded payments,** matching the
  database's paid rule. A typed amount only shows a grey hint.
- **A paid bill's pay sheet opens blank** (Mark paid off) with a "Paid" pill;
  a partly paid one pre-fills what's left. Extra payments stay possible.
- **A $0 statement balance can't be entered;** blank means none.
- **A new bill starts in the last-used view,** and switching scope clears the
  chosen category (categories are per scope).
- **"Add your first bill" counts archived bills,** so it only shows when a
  scope has never had a bill.
- **Carry-forwards:**
  - Task 15 reuses `BillRows`; Edit bill must invalidate `['entries']`,
    `['entry']`, and `['has-bills']`.
  - Day buttons are 40 px and segmented buttons 36 px, under the 44 px touch
    target; revisit in a polish pass.
  - The selected day's ring overrides today's outline; add `aria-pressed` on
    the selected day.
  - `OfflineBanner` still needs a persistent live region.

**New calls from session 18 (not yet reviewed by Aamir, except where noted):**
- **CSV starts with the Excel marker** (Aamir, 2026-11-25).
- **The export is a record, not a forecast:** entries due through the end of
  the current month (profile zone), plus any entry with a payment, so an
  early payment is never dropped.
- **Export amounts are plain decimals** ("1980.00") so spreadsheets can sum
  them; a helper refuses negatives.
- **Settings has both Sign out and Sign out of all devices.**
- **A sole member can't leave;** they delete the household on the Household
  screen (Task 18).
- **The household time zone comes from the creator's device** and can't be
  changed later (no update grant).
- **Deep category shades are computed** (lightness down 13 points), so custom
  categories get a paid shade too.
- **Carry-forwards:**
  - The Archived bills title sits slightly right of centre (empty right slot
    in the shared top bar); polish pass.
  - `OfflineBanner` still needs a persistent live region.

**New calls from session 19 (not yet reviewed by Aamir):**
- **Deleting a household needs its name typed exactly** (beyond the plan's
  "warns, offers export"), because it erases everything for good.
- **Owners can also demote another owner ("Make member");** the database
  still keeps at least one owner.
- **Cancelling an invite has no confirm;** re-inviting undoes it.
- **Writes check that a row was really changed** (`no_access`) for roles,
  removal, household settings and invite cancel.
- **Open question for Aamir (not decided):** the 20-invites-a-day cap is per
  household, so a sole owner could delete and recreate a household to get
  another 20. A per-inviter cap that survives household deletion would close
  it (the sign-up gate already limits who could try). Options: a new
  decision now, the polish pass, or leave it.
- **Carry-forwards:**
  - Hardening pass: earlier writes (edit bill, archive/restore, card
    figures) should get the same zero-rows `no_access` check.
  - First deploy (Task 20): set the invite function's secrets (`APP_URL`,
    SMTP, `MAIL_FROM_NAME`, `ALLOWED_ORIGIN`), regenerate `deno.lock` with a
    real Deno if one is available, and confirm `verify_jwt`.

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

1. **Task 19: the delete account flow, then Task 20: the first real
   deploy** with security headers and a live smoke test. Task 20 needs Aamir:
   a free Cloudflare account and a short iPhone check (which also finishes
   V4). Then Phase 4 (reminders, retention, health watchdog, backups).
2. **Watch the daily health Action.** A failure email from GitHub means
   look right away.
3. **V4: the iPhone install check,** whenever Aamir has his iPhone and a
   free Cloudflare account. The app is deployed once, added to the home
   screen, and a sign-in code is used inside it.
4. **Ask before every commit and every push.** About 7 commits per
   session, or whatever cap Aamir sets for the day.

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
