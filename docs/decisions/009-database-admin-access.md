# D9. Database admin access: Decided

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
