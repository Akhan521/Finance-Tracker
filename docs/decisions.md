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

**Still open.** Whether whoever administers the hosted database could see
personal bills through the provider's dashboard.

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
