# D14. Household owners: Decided

**Context.** Someone may need to be removed without choosing to leave: they
moved out and never left, lost their phone, or the relationship changed.
Letting anyone remove anyone is too lax. Hard-coding "parents" wouldn't work
for other households.

**Decision: an owner role.**
- **The person who creates a household becomes its first owner.**
- **Owners can make other members owners too.** For example, both parents.
  Multiple owners prevent a lockout if one owner loses access.
- **The last owner must hand ownership to someone before leaving.** A
  household is never left without an owner.
- **Only owners manage membership.** They invite and approve joins, approve
  rejoins, and remove members.
- **A removed member is treated like someone who left (D13).** They keep their
  account and personal bills, lose access to the household bills, and the
  removal is recorded in the change history.
- **Owners have no extra power over bills.** Every member can still add, edit,
  and mark household bills paid (D8). Ownership only controls who's in the
  household.

**Naming.** "Owner," not "admin," to avoid confusion with the database
administrator in D9.

**Why.** It's tighter than letting anyone remove anyone, avoids the
single-point-of-failure of one admin, and lets each household decide who its
owners are, not a rule tied to "parents."

**Owners managing owners (confirmed by Aamir 2026-10-25).** One owner can remove or demote
another owner, except that the last owner can never be removed.
