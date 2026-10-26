# Household Bill Tracker: Design

**Date:** 2026-10-25 · **Status:** Draft for approval · **Owner:** Aamir Khan

This document is everything a builder needs to plan the first version. The
reasoning behind each choice is in `docs/decisions/` (D1–D21, linked as
"Dn"). Where this document and a decision file disagree, this document wins.

---

## 1. Intent

A household loses track of bills. Today they're tracked by hand in notes that
get misplaced, and the first sign of a miss is a late-payment email. Money
isn't the problem; visibility is (D1).

The tracker makes it impossible to forget a bill:
- Every bill sits on a calendar, colored by status.
- Unpaid bills trigger email reminders.
- The household shares one view of its bills, while each person's own bills
  stay private.

**Who it's for.** A household first: in Aamir's, the parents manage pooled
household bills, and each member handles their own credit cards and personal
expenses. It must also work for a single person, and for any household, not
just this one (D2).

**What success looks like.**
- Nobody in the household gets a late notice because a bill was forgotten.
- Opening the app answers "what's due, what's paid, what's overdue, and how
  much is left this month" in one glance.

## 2. Goals, non-goals, anti-goals

**Goals**
- See every bill's due date and status on a month calendar.
- See how much money is paid, overdue, and left this month.
- See where the month's money goes, by category.
- Mark bills paid in one tap, while still handling amounts that change and
  credit cards.
- Email reminders before and on the due date, and once when overdue.
- Shared household bills plus private personal bills, enforced by the
  database.
- Data persists across sessions and devices.

**Non-goals (v1)**
- Budgeting, spending analysis, or income tracking.
- Bank or card syncing; paying bills from the app; autopay.
- Phone push notifications (email only for now; push can be added later, D17).
- Face ID / passkey sign-in (planned upgrade, D18).
- Offline use. The app needs a connection; show a friendly message when
  offline.
- Native iPhone app, Android, or Windows (D4, D5).
- Multiple currencies (USD only).
- Belonging to more than one household at a time.

**Anti-goals**
- **Clutter or repeated information.** If the calendar colors already show
  something, nothing else on screen says it again (D11a).
- **Storing sensitive financial data.** Never store card numbers, full account
  numbers, or logins (D7).
- **Anyone seeing another person's personal bills,** including through an app
  bug or direct database calls (D8).
- **Anything that costs money to run** (D5, D20).
- **Silent failure of reminders.** A paused database or broken email sender
  that nobody notices is the worst outcome for this app.

## 3. Constraints

- **Cost: $0 per month.** Supabase free plan, free static hosting, and a
  dedicated Gmail account. No custom domain (D20).
- **Devices:** iPhone first (Safari and installed to the home screen), Mac
  Safari second (D4).
- **Security is the top priority (D6).**
  - Access rules are enforced in the database (Postgres row-level security),
    never only in the UI.
  - Protection is layered.
  - Data is kept to the minimum needed.
- **The GitHub repo is public.**
  - No secrets, keys, or real household data may ever be committed.
  - Backups must never be stored in GitHub.
  - Use a `.env`-style setup that's git-ignored, and keep secrets in Supabase
    and in GitHub Actions secrets.
- **Builder profile.** Aamir has beginner-to-intermediate React experience.
  Prefer conventional, well-documented patterns over clever ones.

## 4. Stack (D20)

| Part | Choice |
|---|---|
| App | React + TypeScript, built as an installable web app (manifest + service worker, home-screen icon) |
| Hosting | A free static host, e.g. Cloudflare Pages, at its free address |
| Database, sign-in, server jobs | Supabase free plan: Postgres with row-level security, Supabase Auth (email OTP), Edge Functions, pg_cron |
| Email | A dedicated Gmail account, connected as Supabase's SMTP sender and used by the reminder function |
| Safety nets | A scheduled GitHub Action for the daily keep-alive and weekly encrypted backup (Section 9) |

- Only Supabase's public "anon" key goes in the app.
- The service-role key and the Gmail credentials live only in Supabase secrets
  and GitHub Actions secrets (D9).

## 5. People, households, and roles

**Accounts (D18).**
- Sign in with an email address and a 6-digit emailed code. No passwords.
- Codes are single-use, expire in ~10 minutes (Supabase's default is 1 hour;
  change it), and wrong guesses are rate-limited.
- A device stays signed in ~30 days.
- "Sign out of all devices" is available.
- A first sign-in creates the account. The person enters a display name
  (shown as "who paid" in history).

**Households.**
- A person belongs to **zero or one** household.
- Without one, they see only their personal bills, and the Household/Mine
  switch is hidden.
- Anyone without a household can **create one** and becomes its first owner
  (D14).

**Roles (D14).**
- **Owner:**
  - invites people,
  - cancels invites,
  - removes members,
  - makes members owners or demotes owners,
  - sets the household history window.
- **Member:** everything to do with household bills (add, edit, archive, mark
  paid). Owners have **no** extra power over bills.
- One owner can remove or demote another, but the **last owner** can't be
  removed or demoted, and can't leave or delete their account without first
  making someone else an owner.
- **Exception: a sole member.** If the last owner is the household's only
  member, they can **delete the household** instead. There's a warning and an
  export offer first. Then all household bills, entries, payments, categories,
  invites, and history are deleted. This is the only way a household ends.
  (Claude's call, from the builder check.)

**Joining (D19).**
- An owner invites by email.
- The invitee receives an email, signs in with that same address, and sees
  "Join <household>?" with Accept.
- Invites expire after 7 days. Owners see pending invites and can cancel them.
- **Only the invited email can accept.**
- **Rejoining** after leaving or removal works the same way: an owner invites
  them again. There's no self-service rejoin.

**Leaving and removal (D13).**
- Leaving is a deliberate action with a confirmation.
- A person who leaves or is removed keeps their account and personal bills,
  and immediately loses all access to household bills.
- Past household payments still show their name.

**Deleting an account (D15).**
- A permanent-deletion warning comes first, with an offer to export their
  data.
- Their personal bills and personal history are deleted right away.
- Past household payments and changes they made are relabeled **"former
  member."**
- Provider backups may hold deleted data briefly. Our own backups age out
  (Section 9). Don't claim deletion is instant everywhere.

## 6. Bills, entries, and payments

**Bill** (D10, D21): set up once. It has:
- **name**,
- **scope**: household or personal (owner = the creator). Scope is **fixed
  at creation.** Switching it would expose or hide past payments, so the Edit
  page doesn't offer it. To move a bill, archive it and add it again. (Claude's
  call.)
- **category**,
- **usual amount**,
- **schedule**,
- optional **nickname**, **last 4 digits**, and **payment page link**,
- an **is credit card** flag (set when the category is "Credit card"),
- an **archived** flag.

**Never store** card numbers, full account numbers, or logins (D7). Validate
that "last 4" is exactly four digits.

**Categories.**
- Defaults: Housing, Car, Utilities, Insurance, Credit card, Internet & phone.
- Users can add custom categories, each with a pastel color.
- Custom categories are per household (shared) for household bills, and per
  person for personal bills.

**Schedules.**
- Options: every month on day N, every N weeks, every year on a date, or just
  once.
- When creating a bill, the "Due" picker sets the **next due date**, and the
  schedule continues from there. Past entries aren't back-filled.
- Monthly on the 29th–31st falls on the last day of shorter months.

**Entry.** One per due date ("October car payment"). Status:
- **paid**:
  - a regular bill is paid once any payment is recorded;
  - a credit card is paid once its recorded payments total at least that
    cycle's minimum (or on any payment if no minimum was entered).
- **overdue**: unpaid, and the due date has passed (from the day after the due
  date, in the household's time zone).
- **upcoming**: unpaid and not yet overdue.

**Payment.**
- Records the amount, the date paid, and **who paid**: automatically the
  person who tapped "Mark paid" (D21).
- An entry can have more than one payment, which mainly matters for credit
  cards when a first payment is below the minimum.

**Amounts (D10, D21).**
- The pay sheet pre-fills the usual amount.
- If the typed amount differs, a row "Use $X from now on" appears with a
  switch, off by default. On updates the bill's usual amount for future
  entries.
- Past payments are never rewritten. The usual amount can also be edited
  directly.

**Credit cards.**
- The pay sheet asks for this cycle's **minimum due** and **statement balance**
  (both optional), and the **amount paid**.
- It shows "Minimum covered ✓" once covered.
- **If a minimum is entered,** the entry is paid once payments total at least
  that minimum.
- **If no minimum is entered,** any payment marks it paid, the same as a
  regular bill.
- **For totals and reminders,** the expected amount is the minimum if entered,
  otherwise the usual amount.
- **The minimum can be saved before paying.** Open the pay sheet, type the
  minimum, and close it without paying; it's kept, so totals and reminder
  emails use the real figure. (Claude's calls, from the builder check.)

**Undo.** A mis-tapped payment can be removed from the entry or bill, and the
removal goes in the history. (Claude's call; mis-taps will happen.)

**Archive, not delete (D8).**
- "Archive bill" hides a bill from the calendar and stops its future entries
  and reminders.
- Archived bills are listed under Settings → Archived bills and can be
  restored.
- Their history is kept until it ages out (Section 8).

**Change history (D8).**
- Record who did what, and when, for:
  - bills: creation, edits (including amount changes with old and new
    values), archive and restore,
  - payments: added or removed,
  - membership: invites, joins, leaves, removals, role changes, and household
    deletion.
- Household bill history is visible to household members; personal bill
  history only to its owner.

## 7. Screens

**Look (D11b, D21).**
- A light **cream background with soft pastels.**
- Status colors: **sage green = paid, rose = overdue, butter yellow =
  upcoming.**
- The **Settings style is the pattern everywhere:** soft grouped rows, one
  thing per line, generous spacing.
- No chip clouds, dense forms, or colored callout boxes.
- Text must stay easily readable on pastel fills (meet normal contrast
  guidelines for text).
- Reference mockups: `.superpowers/brainstorm/*/content/pastel-v1.html`,
  `minimal-v1.html`, `screens-v2.html` (local only, git-ignored). If they're
  unavailable, this section is sufficient.

**Home: calendar view (default)** (D11, D11a)
- A top bar with:
  - **‹ October ›** to change months,
  - a **calendar / donut** icon switch,
  - **+** (new bill),
  - a **gear** (settings).
- Below it, a **Household / Mine** switch:
  - "Household" shows **only shared household bills**.
  - "Mine" shows **only the signed-in person's personal bills**.
  - The two are never mixed on one calendar.
  - The app reopens on whichever view the person used last, so someone who
    mostly tracks their own cards lands on Mine.
  - The totals and the donut follow the selected view. (Claude's call.)
- A month grid. Days with bills are filled with their status color; a day with
  mixed statuses shows the most urgent (overdue > upcoming > paid). Today is
  outlined.
- Under the grid, three money totals for the month, each labeled once:
  - **paid** = the sum of payments on this month's entries,
  - **overdue** = the expected amounts of overdue entries,
  - **left** = the expected amounts of upcoming entries.
- **No bill counts anywhere.**
- Tap a day to list that day's bills, then tap a bill to open the pay sheet.
  Tapping a bill name elsewhere opens its edit page.

**Home: donut view** (D11b)
- It answers "where does the money go this month?"
- Slices are categories, sized by each category's share of the month (per
  entry, the larger of its paid and expected amounts).
- Each slice is solid for the paid part and a pale tint for what's still owed.
  It has rounded ends and small gaps.
- The center shows **"$X left of $Y"**.
- The legend shows one row per category: either "$N · paid", or the overdue
  amount in rose plus "$N of $M left".
- It respects the Household / Mine switch.

**Pay sheet** (D21): slides up over the calendar.
- It shows the bill name, category, due date, and an overdue pill if overdue.
- A large amount field, with "usually $X" in grey when the amount differs.
- "Paid on" (today, changeable).
- The "Use $X from now on" switch row, only when the amount differs.
- A **Mark paid** button and "Open payment page ↗" if there's a link.
- The credit card variant is described in Section 6.

**New bill** (D21): one calm page.
- The name as a large title, then a Household / Just mine switch.
- One group of three rows, **Amount, Due, Category**, each opening a simple
  picker.
- A **More details** row for the nickname, last 4 digits, and payment link.
- Cancel / Save at the top.

**Edit bill** (D21)
- The same rows plus "Payment page."
- A **History** timeline:
  - each event in normal text ("Paid $1,980", "Amount changed to $1,980"),
  - the date, who, and the old value in small grey text below,
  - green dots for payments and lavender dots for changes.
- "Archive bill" sits quietly at the bottom.

**Settings** (D21)
- Email reminders:
  - household bills on/off,
  - my bills on/off,
  - the first reminder's lead time (default 7 days).
- Your data:
  - export to spreadsheet (CSV),
  - keep history for (personal bills; default 3 years).
- Archived bills.
- Household → the household screen. "Create household" appears if there
  isn't one.
- A sole member also sees "Delete household" on the household screen.
- Account:
  - display name,
  - sign out of all devices,
  - leave household,
  - delete account.

**Household screen** (D14, D19, D21)
- Members with an Owner/Member label.
- Owners also see:
  - pending invites (with expiry and Cancel),
  - "+ Invite someone by email",
  - a tap on a member to make them an owner or remove them,
  - the household's "Keep history for" setting.
- Members see the member list and a Leave option.

**First run.**
- Sign in.
- If there's a pending invite, show it.
- Otherwise show an empty calendar with a gentle prompt to add the first bill,
  plus "Create household" in Settings.

## 8. Reminders, retention, and export

**Reminders (D16, D17).** Email only. A daily job runs at about 8 a.m. in the
household's time zone; personal-only users use their own time zone, set from
their device at sign-up.

- For each unpaid entry, it sends at most:
  1. **N days before** (N = the person's lead time, default 7),
  2. **on the due date**,
  3. **once on the day after the due date** (overdue). It isn't repeated.
- Marking an entry paid cancels its remaining reminders.

**Who receives which reminders.**
- Household bills go to members who have household reminders on. In Aamir's
  household, the parents turn them on.
- Personal bills go only to their owner, if their personal reminders are on.
- Anyone can turn everything off.

**Email format.**
- **One email per person per day,** listing all of that day's reminders
  together.
- Plain and calm: bill name, due date, amount, and a link to the app.
- Never include last-4 digits.

**The job must be idempotent.** A rerun on the same day never sends
duplicates.

**Retention (D12).**
- Keep **3 years** of entries, payments, and change history.
- A daily cleanup deletes anything older than the applicable window:
  - the household window (set by owners) for household data,
  - the person's own window for personal data.
- Windows are adjustable, including "never delete."
- About **one month before** data first passes the window, email a heads-up
  with a link to export:
  - to owners for household data,
  - to the person for personal data.

**Export (D12).**
- CSV, available to everyone.
- It includes the person's personal bills plus the household bills they can
  see: each entry with its due date, status, payments (amount, date, who),
  bill name, and category.

## 9. Security requirements

These are acceptance criteria, not suggestions (D6).

**Row-level security on every table.** No table is readable or writable
without a policy. The rules:

| Data | Read | Write |
|---|---|---|
| Household bills, entries, payments, categories, history | Current members of that household | Current members (add, edit, archive, pay, undo) |
| Personal bills, entries, payments, categories, history | Only the owning person | Only the owning person |
| Household membership, roles, invites | Members see the member list; only owners see invites | Only owners invite, cancel, remove, or change roles; a person may leave or accept their own invite |
| Account profile and settings | The person (display names are visible to their household) | The person |

**Other rules.**
- A former member **immediately** loses read access to household data.
- Invites can be accepted **only** by an account whose email matches the
  invite. Accepting is the only path into a household.
- Last-owner protections are enforced in the database, not just the UI.
- **Automated tests** prove these rules against the real policies:
  - a member can't read another member's personal bills,
  - a former member can't read household bills,
  - a non-owner can't invite or remove,
  - a non-invited email can't join.
- Secrets live only in Supabase and GitHub Actions secrets. The app ships
  only the public anon key. Nothing secret is committed to the public repo.
- **Admin account (D9).**
  - A strong unique password and two-step login on the Supabase account and
    the Gmail account.
  - One person (Aamir) holds admin access.
  - Leave room to encrypt personal bills later.
- Store as little as possible (D7). Validate inputs. Payment links are plain
  URLs opened in a new tab (https only).

**Operations (D20).**
- **Keep-alive:** a daily scheduled GitHub Action makes a lightweight
  authenticated request, so the free Supabase project never pauses after 7
  idle days. The daily reminder job should also count as activity. Verify this
  works.
- **Backups:**
  - A weekly scheduled job takes a full database dump and encrypts it with a
    key that's stored separately from the backup.
  - Store it outside Supabase and **outside GitHub** (e.g. a free object
    storage bucket).
  - Keep the last ~8 weeks, so deleted data ages out of backups within about
    two months.
  - Write down the restore steps and test a restore once.
- **Email sender:**
  - A dedicated Gmail account (two-step verification plus an app password,
    to be verified at build time).
  - Connected as Supabase's custom SMTP sender, for sign-in codes and invites.
  - Used by the reminder function for reminders and heads-up emails.
  - Volumes are far below Gmail's daily cap.
- **Health:** if a reminder run or backup fails, the job's failure must be
  visible, e.g. a failed GitHub Action emails Aamir.

## 10. Left to the builder

- The schema and table design; how entries are stored or generated (stored
  ahead of time, or computed from the schedule and stored once acted on).
- Project structure, state management, routing, and component library (or
  none).
- The test framework and how the security tests run against Supabase.
- Exact colors, typography, spacing, icons, and animation, within Section 7's
  rules.
- The backup storage provider and encryption tool, within Section 9.
- CSV column names and order.
- How and when the household time zone is set (default: the creator's
  device), and the picker designs.
- Wording of emails and empty states, in the app's calm tone.

## 11. To verify early in the build

1. That Gmail SMTP works from Supabase Auth and from an Edge Function (app
   password, limits).
2. That the keep-alive plus the daily job prevent free-plan pausing.
3. That Supabase's OTP expiry can be set to ~10 minutes and that its rate
   limits behave as expected.
4. That the web app installs to the iPhone home screen and sign-in codes work
   inside it.
