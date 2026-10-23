# Decision Log

A running record of what we've decided while planning the finance tracker, the
trade-offs we weighed, and why. Newest entries go at the bottom. Open questions
live at the end until they're settled.

Status key: **Decided** (settled), **Leaning** (current direction, not final),
**Open** (still being discussed).

---

## D1. The problem we're solving: Decided

**Context.** Bill tracking in the household is manual: notes and memory. Those
notes get misplaced, bills get forgotten, and the first sign of a miss is a
late-payment email from the company.

**Decision.** The tracker's job is to stop bills from being forgotten. The
problem is losing track of bills, not lacking the money to pay them. So the
core value is visibility and reminders, not budgeting.

**Why it matters.** This keeps the first version focused on "what's due, when,
and is it paid?" rather than on spending analysis, budgets, or bank syncing.

## D2. Primary user: the household: Decided

**Decision.** The main use case is tracking a household's bills (home, car,
loans, credit cards, utilities, etc.). It should also work for one person
tracking their own bills.

## D3. Multiple people updating it: Leaning (nice to have)

**Context.** Having several household members mark bills paid from their own
phones would be nice, but it isn't required. One person keeping it up to date
for everyone is also fine.

**Trade-off.** Supporting several people means shared data, which means a
server or cloud sync and accounts or sign-in. A single-user app can keep
everything on one device, which is simpler and more private.

**Current direction.** Treat multi-user as a nice-to-have. Prefer a setup that
doesn't rule it out later.

## D4. Devices to support: Decided

**Context.** Everyone in the household uses an iPhone. Laptops are a mix of
macOS and Windows, but the app won't be used on Windows.

**Decision.** Target iPhone first, with Mac as a secondary device. Windows and
Android are out of scope.

**Why it matters.** With Windows dropped, a native Apple app is a real option
again. Earlier, cross-device reach favored a web app.

## D5. Platform and storage: Decided (web app first)

**Decision.** Build a free web app that can be installed on the iPhone home
screen, with data in a hosted online database. Keep the door open to a native
iPhone/Mac app later, reusing the same database.

**Why.**
- It costs nothing to run. A native app needs Apple's $99/year Developer
  Program for iCloud sync and for installs that don't expire after 7 days.
- Sharing between household members is simpler: everyone signs in to the same
  household.
- It builds on existing React experience.

**Workarounds considered and rejected.**
- A free Apple account with Xcode installs: the app expires every 7 days and
  can't use iCloud sync. Each family member would have to plug in to the Mac
  weekly.
- AltStore/SideStore: these automate weekly re-signing, but there's no iCloud
  sync, a 3-app limit, a Mac must stay running, and they're hobbyist tools.
- The App Store: still requires the $99/year program, adds app review and a
  privacy policy, and the app is removed if the membership lapses. It's a later
  distribution step, not a way to avoid cost.
- TestFlight: private household installs, but still requires the $99 program,
  and builds expire every 90 days.

**What we give up.** A less polished feel on iPhone, weaker offline support,
and less reliable reminders than native notifications. If these start to
matter, pivot to native (see the comparison below).

**Comparison considered.**

| | Native iPhone/Mac app | Web app (installable on the home screen) |
|---|---|---|
| Where data lives | On the device, synced through the user's own iCloud | In a hosted online database |
| Persistence | Survives closing the app; iCloud keeps phone and Mac in sync | Reliable only with an online database. Browser-only storage can be wiped by iOS after weeks of not opening the site. |
| Works offline | Yes, fully | Mostly not, without extra work |
| One person, several devices | Free and automatic through iCloud | Needs a sign-in |
| Several people sharing one list | Possible through iCloud sharing, but more work to build | Straightforward: everyone signs in to the same household |
| Cost | $99/year Apple Developer Program (needed for iCloud sync and installs that don't expire) | Free tiers cover one household |
| Reminders | Native notifications, very reliable | Work on iPhone only after adding to the home screen; less reliable |
| Prior experience | New (Swift) | Some (React) |

## D6. Security is the top priority: Decided (principle)

**Decision.** Security takes priority over convenience and features,
especially:
- database operations,
- how long data is kept,
- who can access the data,
- protecting the household's data as a whole.

**Note.** No system can promise zero gaps. The approach is to store as little
sensitive data as possible, have the database itself enforce who sees what
(not just the app's screens), and add layers of protection so that one mistake
doesn't expose everything. The specific measures will be recorded as decisions
as we make them.

## D7. Store as little sensitive data as possible: Decided

**Decision.** The app never stores:
- card numbers,
- full account numbers,
- website logins or passwords for the companies being paid.

**Allowed instead, to tell similar bills apart:**
- a nickname (e.g. "Chase Visa (Aamir)", "Car loan, Honda"),
- optionally the last 4 digits of an account or card,
- a link to the company's payment page.

**Why.** Data that's never stored can't leak. Card numbers in particular can
be used immediately if stolen, and storing them brings in the payment card
industry's security rules (PCI DSS). The tracker doesn't need either: bills
are paid through each company's own site or app.

**Where logins go instead.** A password manager. The household is all Apple,
so the built-in Passwords app works and can share a group of passwords with
family members.

## D8. Who can see which bills: Decided

**Decision.**
- **Household bills** are shared: every member of the household can see them.
- **Personal bills** are private: only the person who owns them can see them.
  Other household members, including parents, cannot.

**How it must be enforced.** The database itself enforces these rules for
every read and write, not just the app's screens. A bug in the app, or someone
calling the database directly, must still be unable to read another person's
personal bills.

**Who can change household bills.** Any household member can add, edit, and
mark household bills paid. There's no separate parent/admin role for this.

**Our call, to go with open editing (not yet confirmed):**
- Every change to a household bill records who made it and when, so it's
  always possible to see who marked something paid or changed an amount.
- Removing a bill archives it instead of deleting it, so a mis-tap can be
  undone and history is kept.

## D9. Database admin access: Decided

**Context.** Whoever administers the hosted database (likely Aamir) can read
every row through the provider's dashboard, including other members' personal
bills. The database's access rules stop other app users, not the admin.

**Options considered.**
1. Trust the admin, and lock down the admin account.
2. Encrypt personal bills on each person's device before saving, so even the
   admin and the hosting company see only scrambled data.

**Decision.** Option 1. Lock down the admin account:
- a strong, unique password stored in a password manager,
- two-step login turned on,
- only one person holds admin access,
- the database's secret admin keys never go into the app's code or the repo.

**Why.** Personal bills hold only names, amounts, and due dates (see D7). The
admin is a family member. With encryption, a forgotten passphrase means that
person's personal bills are gone for good with no recovery, a likely failure
for a household app. Encryption is also noticeably more work to build.

**Keep the door open.** Structure the data so encrypting personal bills can be
added later without starting over.

## D10. How a bill works: Leaning (proposed, partly confirmed)

Proposed by Claude during brainstorming. Aamir's feedback shaped the amount
rules. The other points were not explicitly confirmed.

- **A bill is set up once.** It has a name, a type (home, auto loan, utility,
  insurance, credit card, or any custom type), how often it repeats (monthly,
  yearly, every N weeks, or one-time), a due day, and a usual amount. It can
  optionally have a nickname, the last 4 digits, and a payment link (see D7).
  It's either a household bill or a personal bill (see D8).
- **Each due date becomes its own entry** (e.g. "October car payment"). An
  entry's status is pending, paid, or overdue (past due and not paid).
- **Marking paid** records the amount actually paid, the date, and who paid.
- **Amounts (shaped by Aamir's feedback):**
  - The usual amount is pre-filled when marking paid, but it's always
    editable.
  - If the amount entered differs, the app asks "Just this time, or from now
    on?" "From now on" updates the usual amount for future entries (e.g. after
    a refinance).
  - Past payments are never rewritten.
  - The usual amount can also be edited directly at any time.
- **Credit cards:** each entry records that cycle's minimum due and the amount
  actually paid. It counts as paid once at least the minimum is paid.
  (Unconfirmed.)
- **At-a-glance counts** (paid, remaining, total, with overdue called out)
  cover the current month. (Unconfirmed; the period could differ.)

## D11. Home screen layout: Leaning (month calendar)

**Options mocked up** (browser mockups, same sample month in each):
- **A. Donut chart on top.** A ring of paid/overdue/upcoming with "5 of 9
  paid" in the center, and the bills left to pay listed below.
- **B. Number tiles + progress bar.** Big Paid / Left / Total numbers, a
  progress bar with dollar amounts, and a red banner for overdue bills.
- **C. Month calendar.** Each due date is colored on a calendar (green paid,
  red overdue, amber upcoming), with a one-line count on top and the remaining
  bills grouped by week.

**Direction.** C, the month calendar. Seeing due dates laid out on a calendar,
color-coded by status, answers "when is everything due and where do we stand"
in one view.

**Shared by every option (carry forward):**
- a Household / Mine switch at the top,
- overdue bills shown first and in red,
- tap a bill to mark it paid.

**Note.** The mockup is rough. The visual design will be iterated on.

### D11a. Minimal and quiet, with no repeated information: Decided

**Rejected:** adding counts above the calendar as chips, big number tiles, or
a small donut. All of them clutter the screen and repeat what the calendar's
colors already say.

**Decisions.**
- **Design principle:** the app is as minimal, quiet, and easy to read as
  possible. Never show the same information twice.
- **No bill counts.** The calendar colors already show status:
  - green = paid
  - red = overdue
  - yellow = upcoming
- **Show money totals instead:** how much has been paid, how much is overdue
  (still owed), and how much is left (upcoming).
- **Two views with a toggle:** the calendar view (default) and a pie chart
  view. Only one is visible at a time.

### D11b. Visual theme and the second view's purpose: Decided

**Decided: a light theme in cream and pastels.**
- A cream background, with soft pastel status colors: sage green for paid,
  rose for overdue, butter yellow for upcoming. (The exact shades are Claude's
  call; adjust freely.)
- Pastel category colors where categories are shown.

**Decided: the second view must add something.** The first pie mockup only
repeated the calendar's information in another shape. It was rejected for
looking plain and for being redundant.

**Decided: A, the category donut.** The second view answers "where does the
money go this month?", which the calendar can't. It also shows how much of
each category is paid. The center shows the amount left to pay out of the
month's total, and the legend lists each category with what's paid, overdue,
or left.

**Consequence for the bill model (D10).** Every bill needs a category, because
the donut groups by category. A bill's "type" from D10 serves as its category.
Custom categories are allowed.

**Options that were mocked up:**
- A. **Category donut:** slices are categories (housing, car, utilities, ...)
  sized by their share of the month. Each slice is solid for paid and pale for
  still owed. It shows where the money goes, which the calendar can't.
- B. **Progress rings:** one ring per category that fills as its bills are
  paid. It shows how close each category is to done, but not how big each
  category is.
- C. **Status donut, restyled:** rounded segments with gaps and a minimum
  slice size so overdue stays visible. It's prettier, but it still repeats the
  calendar.

## D12. How long data is kept: Decided

**Context.** The household wants to look back at old payments, e.g. for a
billing dispute or for taxes. About a year is the expected need, and a bit
more is fine if it's cheap.

**Cost check.** Storage is not a constraint.
- A household with ~15 bills a month, plus a few personal bills per person,
  produces under 1,000 payment records a year: a few megabytes, even with
  change history.
- Free database tiers allow roughly 500 MB to 1 GB, so decades of history fit
  at no cost.
- The real trade-off is privacy (D6): old data you don't need is more that
  could be exposed.

**Reference points.**
- The IRS generally asks for records to be kept for 3 years after filing.
- In a dispute, the bank or card statement is the official proof of payment.
  The tracker is the quick lookup that tells you which statement to pull.

**Decision.**
- Keep **3 years** of payment history and change history. Older entries are
  deleted automatically.
- **Export to CSV** (a spreadsheet file) anytime, so anyone can keep their own
  longer archive.

**Claude's additions (not yet explicitly confirmed):**
- **A heads-up before deletion.** About a month before entries pass the window,
  the app warns "Next month, entries from <month/year> will be removed," with
  a one-tap export.
- **The window is a household setting.** It defaults to 3 years and is
  adjustable, including "never delete."

**Why not keep everything?** It's a reasonable option, since cost is a
non-issue and old records are low-risk (no account or card numbers, D7). The
3-year default keeps less data around. Because automatic deletion can't be
undone, it's easy to move from 3 years to "never," but not the reverse; the
heads-up and the adjustable setting protect against regret.

---

## Requirements gathered so far

- See at a glance when each bill is due.
- See at a glance whether each bill is paid or still pending.
- See how many bills are paid, how many remain, and the total count.
  (A pie or donut chart is one idea; not decided.)
- Data persists: closing the app and coming back later keeps everything intact.
- Nothing is on autopay, on purpose. Household members get paid at different
  times, and bills are paid by hand only once the money is in place.
- Most bills (home, auto loans, utilities, car insurance) stay around the
  same amount each time.
- Credit cards vary: the minimum payment changes a little, and the amount
  actually paid depends on what the household can put down that month.
- Flexible: any kind of bill or expense can be added, not just this
  household's list.
- Who pays what: there are two kinds of bills.
  - Household bills (home, utilities, etc.): funds are pooled, and the parents
    decide and track which ones get paid.
  - Personal bills (credit cards, personal expenses): each household member
    handles their own.
- Amounts must stay editable even for steady bills. A payment can differ from
  the usual amount, and the usual amount itself can change for good (e.g. after
  a refinance).

## Open questions

- Tech stack (frontend framework, hosted database, sign-in).
- How the at-a-glance view looks.
- Reminders: whether and how the app notifies people before a due date.
