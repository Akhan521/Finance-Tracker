# D10. How a bill works: Decided

Proposed by Claude during brainstorming. Aamir's feedback shaped the amount
rules, and the rest was confirmed by Aamir 2026-10-25.

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
  (Confirmed by Aamir 2026-10-25.)
- **At-a-glance counts** (paid, remaining, total, with overdue called out)
  cover the current month. (The period, one month at a time, was confirmed 2026-10-25. Counts were
  replaced by money totals in D11a.)

**Update (2026-10-25, see D21).** The "Just this time, or from now on?" prompt
is now a quiet switch on the pay sheet, "Use $X from now on," off by default.
It only appears when the amount differs. The rule is the same; only the
presentation changed.
