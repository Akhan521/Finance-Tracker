# D23. How the server enforces sign-in rules: Decided (Claude's call, 2026-10-26)

**Context.** D22 says unknown emails get no email and no account, enforced on
the server. D18 says a device stays signed in about 30 days. The app talks
straight to Supabase Auth with the public key, so anything only the app
checks can be bypassed with a direct call.

**Decision.**
- **Invite-only gate: a "Before User Created" auth hook.** A Postgres
  function that Supabase Auth calls before creating any account. It allows
  the email only if it has a pending, unexpired invite or is on the
  `approved_emails` table, and rejects everything else. Existing accounts
  never reach the hook, so they sign in normally. Supabase lists this hook on
  the Free plan.
- **Emails are compared lowercased and trimmed** everywhere (hook, invites,
  accepting).
- **The app always shows the same neutral message** after "Send code",
  whatever the server answered.
- **30-day sessions: a daily cleanup** deletes sign-in sessions older than
  30 days, which revokes their refresh tokens. Access tokens last 1 hour, so
  a device is signed out within an hour of its 30th day. (Supabase's built-in
  session time limits are a paid feature; the cleanup works on any plan.)

**To verify early (plan task V5).** That a rejected email gets no email
at all, locally and on the hosted project.

**Fallback if the hook still lets an email out.** Turn off "Allow new users
to sign up" and create the account on the server when an owner sends an
invite (and from the approved list). It costs more code: unused accounts
from cancelled or expired invites must be cleaned up.

**Options ruled out.**
- **Checking in the app only:** bypassed by one direct API call.
- **A custom "request code" function in front of Auth:** the Auth endpoint
  would still be reachable directly with the public key.
