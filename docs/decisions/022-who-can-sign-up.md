# D22. Who can sign up: Decided (invite-only; other households run their own copy)

**Context.** Raised by the builder check of the design doc. "Works for any
household" (D2) didn't say how other people get in. Open sign-up on one hosted
copy would have real costs:
- Strangers could make the household's Gmail account (D20) send sign-in codes
  to any address. That risks Gmail suspending the account, which would
  silently stop reminders.
- Strangers' bills would sit in a database the admin can read (D9).
- It would need abuse protection that isn't planned.

**Decision.**
- **This copy of the app is invite-only.** An email can sign in only if it:
  - already has an account,
  - has a pending household invite (D19), or
  - is on a short **approved list** that the admin (Aamir) manages directly
    in the database. No screen is needed in v1.
- **Unknown emails get no email at all.** Asking for a code for an email that
  isn't allowed must not send anything. The app shows a neutral message that
  doesn't reveal whether the email is known.
- **Enforced on the server,** not just hidden in the app.
- **Other households run their own copy** from the public repo, with their own
  free Supabase project, Gmail account, and admin. A setup guide comes later
  and isn't part of v1.

**Options ruled out.**
- **Open sign-up:** Gmail suspension risk, strangers' data on our database,
  and abuse handling.
- **Invite-only with no self-hosting path:** it would drop "works for any
  household".
