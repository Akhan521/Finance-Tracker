# Project Snapshot

**Last updated:** 2026-10-20 (end of brainstorming session 1)

Paste this whole file into a new session to pick up where we left off. The
full reasoning behind each decision is in [`docs/decisions.md`](decisions.md);
this file is the short version plus where we are.

---

## Paste-in prompt for a new session

> I'm building a household bill/finance tracker in this repo
> (`~/Developer/finance-tracker`). We're still in **brainstorming/planning**.
> No code has been written yet. Read `docs/SNAPSHOT.md` and
> `docs/decisions.md`, then continue the brainstorming from "Next step" below.
> Keep recording every decision (with trade-offs and why) in
> `docs/decisions.md`, commit each one as a small separate commit, and update
> this snapshot at the end of the session.

---

## What we're building

A tracker that keeps a household from losing track of bills. Today, bills are
tracked by hand with notes. The notes get misplaced, bills get forgotten, and
the first sign of a miss is a late-payment email. The problem is visibility,
not money. Core needs:
- See when each bill is due.
- See whether it's paid or pending.
- See how many bills are paid, remaining, and in total.
- Data persists between sessions.

## Where we are

- **Stage:** Brainstorming. Following the superpowers brainstorming process:
  questions → playback → written design doc → reviewer check → approval →
  implementation plan. **Nothing gets built until the design doc is
  approved.**
- **Repo contents:** `README.md`, `docs/decisions.md` (decision log D1–D10),
  `docs/SNAPSHOT.md` (this file).
- **Last thing that happened:** Claude offered to open a browser tab with
  mockups of the at-a-glance screen. Aamir parked the session before
  answering.

## Decisions so far (details in decisions.md)

| # | Decision | Status |
|---|---|---|
| D1 | The problem is losing track of bills, not affording them. Focus on visibility and reminders, not budgeting. | Decided |
| D2 | Main user is the household; also works for one person. | Decided |
| D3 | Multiple people updating from their own phones. | Leaning, nice to have (now effectively needed by D8) |
| D4 | iPhone first, Mac second. No Windows or Android. | Decided |
| D5 | **Free web app**, installable on the iPhone home screen, with a hosted online database. Can pivot to a native iPhone/Mac app later on the same data. | Decided |
| D6 | **Security is the top priority.** The database enforces access, protection is layered, and sensitive data is kept to a minimum. | Decided |
| D7 | Never store card numbers, full account numbers, or logins. A nickname, last 4 digits, and a payment link are OK. Logins go in Apple's Passwords app. | Decided |
| D8 | Household bills are shared with every member. **Personal bills are private to their owner.** Any member can add, edit, or mark household bills paid. | Decided |
| D9 | The database admin (a family member) could see everything. Accepted; lock the admin account down with a strong password, two-step login, one admin, and no secret keys in code. No encryption for now, but leave room to add it. | Decided |
| D10 | Bill model: set up once; each due date is its own entry (pending, paid, or overdue); marking paid records the amount, date, and who paid. The amount is pre-filled but editable, with "Just this time, or from now on?" | Leaning |

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
- At-a-glance counts cover the current month.
- Marking paid records who paid.

## Ruled out (and why)

- **Native iOS app for now:** it needs the $99/year Apple Developer Program.
- **Free Xcode installs:** they expire every 7 days and have no iCloud sync.
- **AltStore/SideStore:** hacky, no iCloud sync, 3-app limit.
- **App Store or TestFlight:** they still need the $99 program.
- **Browser-only storage:** iOS can wipe it, and it can't be shared.
- **Encrypting personal bills on the device:** a forgotten passphrase means
  permanent loss; deferred.

## Open topics, in suggested order

1. **At-a-glance screen:** layout, and whether a pie/donut chart is the right
   way to show paid vs. remaining. Mockup offer pending.
2. **Data retention:** how long history is kept, export and backups, and what
   happens when someone leaves the household or deletes their account.
3. **Reminders:** whether and how people are notified before due dates
   (home-screen web app notifications, a calendar feed, email).
4. **Sign-in and joining a household:** how members sign in and how they're
   invited.
5. **Tech stack:** frontend (likely React, given Aamir's experience), the
   hosted database and sign-in provider (candidates: Supabase with
   database-level row security, or Firebase), and hosting. Check free-tier
   limits, e.g. whether an inactive project gets paused and what backups the
   free tier includes.
6. Confirm or adjust the unconfirmed calls above.
7. Write the design doc (`docs/superpowers/specs/YYYY-MM-DD-finance-tracker-design.md`),
   run the reviewer check, get approval, then write the implementation plan.

## Next step

Resume with the at-a-glance screen: ask whether Aamir wants browser mockups,
then explore how the paid, remaining, and total view should look.

## Working conventions

- Small, meaningful commits, including for planning docs. One decision per
  commit where practical.
- Commit as `Aamir Khan <aamirksfg@gmail.com>` (check `git config
  user.email` before the first commit of a session).
- Remote: `origin` → `https://github.com/Akhan521/Finance-Tracker.git`,
  branch `main`.
