# D12. How long data is kept: Decided

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

**Claude's additions (confirmed by Aamir 2026-10-25):**
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
