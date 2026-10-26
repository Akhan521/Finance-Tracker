# D8. Who can see which bills: Decided

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

**Our call, to go with open editing (confirmed by Aamir 2026-10-25):**
- Every change to a household bill records who made it and when, so it's
  always possible to see who marked something paid or changed an amount.
- Removing a bill archives it instead of deleting it, so a mis-tap can be
  undone and history is kept.
