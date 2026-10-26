# Project Snapshot

**Last updated:** 2026-10-22 (end of brainstorming session 3)

Paste this whole file into a new session to pick up where we left off. The
full reasoning behind each decision is in its own file under
[`docs/decisions/`](decisions/) (linked from the table below), and what the
household needs is in [`docs/requirements.md`](requirements.md). This file is
the short version plus where we are.

---

## Paste-in prompt for a new session

> I'm building a household bill/finance tracker in this repo
> (`~/Developer/finance-tracker`). We're still in **brainstorming/planning**.
> No code has been written yet. Read `docs/SNAPSHOT.md`, then open any
> decision file in `docs/decisions/` you need the details of, and continue the
> brainstorming from "Next step" below. Record each new decision (with
> trade-offs and why) as a new file `docs/decisions/NNN-short-slug.md`, add it
> to the table in this snapshot, commit each one as a small separate commit,
> and update this snapshot at the end of the session.

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

- **Stage:** Brainstorming. Following the superpowers brainstorming process:
  questions → playback → written design doc → reviewer check → approval →
  implementation plan. **Nothing gets built until the design doc is
  approved.**
- **Repo contents:** `README.md`, `.gitignore`, `docs/SNAPSHOT.md` (this
  file), `docs/requirements.md`, and `docs/decisions/` (one file per decision,
  D1–D16).
- **Session 2:** the home screen was designed using browser mockups (the
  superpowers visual companion). The home screen direction is now settled
  (D11, D11a, D11b).
- **Session 3:** data retention, leaving/rejoining/removing members, account
  deletion, and reminder timing were settled (D12–D16). It ended mid-question
  on how reminders are delivered.
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
| [D10](decisions/010-bill-model.md) | Bill model: set up once; each due date is its own entry (pending, paid, or overdue); marking paid records the amount, date, and who paid. The amount is pre-filled but editable, with "Just this time, or from now on?" Every bill has a category (needed by D11b). | Leaning |
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

## Claude's calls, not yet confirmed by Aamir

- Every change to a household bill records who made it and when.
- Removing a bill archives it instead of deleting it.
- A credit card counts as paid once at least the minimum is paid.
- The home screen covers one month at a time, with ‹ › to change months.
- Tapping a calendar day shows that day's bills with a "Mark paid" button.
  This replaced a "this week / next week" list, which repeated the calendar.
- The calendar/donut toggle is a small icon switch at the top right. The
  Household / Mine switch sits under the month title.
- Marking paid records who paid: automatically, whoever taps "Mark paid" (D21).
- "+" (new bill) and a gear (settings) sit on the home screen (D21).
- The credit card pay sheet asks for the minimum, optionally the statement
  balance, then the amount paid (D21; shown in mockups, no comment yet).
- Owners can remove or demote other owners, except the last owner (D14).
- Each member opts in or out of household bill reminders; this isn't tied to
  the owner role. Personal bill reminders go only to that bill's owner. The
  1-week lead time is adjustable per person (D16).
- The overdue reminder is sent once, not repeated (D16).

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

## Open topics, in suggested order

1. Confirm or adjust the unconfirmed calls above.
2. Write the design doc (`docs/superpowers/specs/YYYY-MM-DD-finance-tracker-design.md`),
   run the reviewer check, get approval, then write the implementation plan.

## Next step

Resume on **reminder delivery**. The question left pending:

> Phone notifications need each person to add the app to their iPhone home
> screen and tap "Allow notifications" once; otherwise nothing arrives. Email
> needs no setup but lands in the same inbox where late notices already got
> lost. Claude suggested phone notifications as the main channel, with email
> as an optional backup per person. **Would Aamir's parents be comfortable
> with the one-time home-screen setup, or is email the safer bet for them?**

Then move on to sign-in and joining a household.

## Working conventions

- Design taste: minimal, quiet, no repeated information, cream and pastels.
  Aamir prefers reacting to visual mockups for anything on screen.
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
