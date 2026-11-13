# D33. Blank every password in the database: Decided (Aamir, 2026-11-12)

**Context.** D23's update (2026-10-28) added a test that decides between
the sign-up hook and D23's fallback:
1. An attacker signs up an invited email with a password.
2. The real person then signs in with an emailed code.
3. The attacker's password must not work.

In Task 3 the test **failed** locally. The hook allows the attacker's
sign-up because the email is invited. Supabase creates an unconfirmed
account holding the attacker's password. The real person's code confirms
that account, and Supabase keeps the password, so the attacker can sign in
as them. The live project wasn't exposed: invites weren't deployed yet, and
the only approved email already had an account.

**Decision.**
- **No password ever works.** A trigger on `auth.users` blanks
  `encrypted_password` whenever an account is created or changed. The same
  migration clears every existing password.
- Sign-in stays code-only (D18). The invite design and the sign-up hook
  (D23) stay as they are.
- Tests prove that no password works in each of these cases:
  - an attacker's sign-up for an invited email,
  - an account created with a password (the dashboard requires one),
  - a signed-in user setting a password.
- CI runs these tests on every push. If a future Supabase change breaks the
  trigger, the build goes red. D23's fallback is still there if that
  happens.

**Why.**
- It closes the whole password channel, which this app never uses, not
  just this one attack. Dashboard-created accounts get a password too, and
  so does the existing live account.
- It's a few lines with no new moving parts.

**Options ruled out.**
- **D23's fallback alone** (turn off sign-ups; the invite function creates
  accounts):
  - It closes only the sign-up route. Dashboard-created accounts would
    still have passwords.
  - It needs accounts made for people who haven't accepted yet, cleanup
    when invites are cancelled or expire, and accounts for the approved list
    made by hand.
- **Both together:** once no password can work, turning off sign-ups adds
  no real protection, only the fallback's complexity.

**Accepted risk.**
- The trigger changes a column that Supabase manages. Supabase supports
  triggers on `auth.users` (we already have one for profiles), but blanking
  this column isn't a documented pattern. The tests and CI contain that
  risk.
- An attacker can still create an unconfirmed, empty account for an invited
  email, and cause one extra confirmation email. They can't use the account,
  and the email limits cap it (D32).

**Changes.**
- Task 3's migration (`invites`).
- An update note on D23.
