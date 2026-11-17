# D34. Housemates can read each other's full profile row: Decided (Aamir, 2026-11-16)

**Context.** A test audit noticed a mismatch:
- Design §9's access table says display names are visible to the household.
- The plan's data model gives `profiles` "select self + same-household", which lets a housemate read the whole row: time zone, reminder settings (`remind_household`, `remind_personal`, `lead_days`), the personal history window, and the last-used view.

Nothing in the app needs the full row. The household screen gets names through `household_names()`.

**Decision.**
- Keep the data model's rule: members of a household can read each other's full profile row.
- They still can't edit it. Only you can update your own profile.
- The app shows only display names.
- A test pins both halves (a housemate can read the row, and can't change it), so the rule can't change by accident.

**Why.** None of these fields are sensitive: no money, bills, or contact details. Restricting reads to your own row would need a new migration for little gain. (Aamir's choice when asked.)

**Option ruled out.** Restricting profile reads to your own row, with names only through `household_names()`. That matches §9's wording exactly and stores less, but changes working code for low-sensitivity data.

**Changes.** Design §9's access table ("display names are visible to their household") should be read as "profile rows are readable by their household; the app shows only names." The design wins where it conflicts, so this decision records the deliberate exception.
