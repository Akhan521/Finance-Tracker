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

---

## Requirements gathered so far

- See at a glance when each bill is due.
- See at a glance whether each bill is paid or still pending.
- See how many bills are paid, how many remain, and the total count.
  (A pie or donut chart is one idea; not decided.)
- Data persists: closing the app and coming back later keeps everything intact.

## Open questions

- Platform: web app, iOS app, or something else?
- Tech stack.
- How the at-a-glance view looks.
- Reminders: whether and how the app notifies people before a due date.
