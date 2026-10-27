# D25. How bill entries are stored: Decided (Claude's call, 2026-10-26)

**Context.** Design §10 left open whether each due date's entry is stored
ahead of time or computed from the schedule.

**Decision.**
- **Entries are stored ahead, 12 months out.** The database creates them when
  a bill is added, and a daily job extends each bill to 12 months ahead.
- **Schedule math lives in one SQL function** (`due_dates`), used by every
  part of the system. The 29th–31st fall on the last day of shorter months;
  a yearly Feb 29 falls on Feb 28.
- **Status is never stored.** A database view works it out each time from the
  payments, the credit card minimum, the due date, and the household's time
  zone. Paid, overdue, and upcoming can never go stale.
- **Changing a bill's schedule or archiving it** removes its future entries
  that have nothing recorded on them (no payment, no minimum), then makes new
  ones from the new schedule. Past entries are never touched.
- **Changing the usual amount** updates future unpaid entries only.

**Why.** Stored rows make the security rules simple (an entry inherits its
bill's access) and keep the calendar, the totals, reminders, retention, and
export all reading the same rows. Storage is trivial: about 20 bills × 12
months.

**Options ruled out.**
- **Computing entries from the schedule on the fly:** the schedule math would
  have to exist twice (in the app and in the reminder job), and the two copies
  could disagree.
- **Storing status:** it would go stale at midnight unless a job rewrote it.
