# D32. What the public repo may reveal: Decided (Aamir, 2026-10-28)

**Context.** Before pushing the plan, Aamir asked whether publishing the
security design puts the household at risk. A check of the full git
history found no secrets, keys, project URLs, or dumps. Publishing the
design itself is safe, because its security doesn't depend on being
secret: the database access rules, the server-side secret keys, the
invite-only hook, and an encryption key that never leaves Apple Passwords.

One real risk remains. Aamir's email is public (every commit shows it),
and it's an account that can sign in. Anyone who also knew the app's
address could keep requesting sign-in codes for it. Each request sends an
email from the shared Gmail account. Supabase's default (about 30 an hour,
roughly 720 a day) is more than Gmail's roughly 500-a-day limit. The
attacker can't get in, but they could use up the limit and stop reminders
and sign-in codes going out.

**Decision.**
- **Nothing in the repo identifies the live deployment.** That means never
  committing:
  - the Supabase project URL or ref,
  - the Cloudflare Pages project name or address,
  - the sender Gmail address,
  - the backup bucket name,
  - any family member's email.

  These values live in the git-ignored `.env.production.local` and the
  dashboards. The deploy script fills them in, and docs use placeholders
  such as `<project-ref>`. The public repo then never leads anyone to the
  live app.
- **Supabase Auth sends at most 10 emails an hour** (about 240 a day). Even
  under abuse, Gmail keeps room for reminders and invites.
- **If abuse ever shows up,** add Cloudflare Turnstile (a free CAPTCHA that
  Supabase Auth supports) to the sign-in screen. It isn't needed for v1.

**Options ruled out.**
- **Making the repo private:** it would drop "other households run their
  own copy" (D22). A public, reviewable design is also a strength.
- **A CAPTCHA from day one:** an extra moving part for a threat that needs
  the app's address, which this decision keeps out of the repo.
