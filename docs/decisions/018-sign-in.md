# D18. Signing in: Decided (emailed 6-digit code)

**Decision.** People sign in by entering their email address and typing a
**6-digit code** that's emailed to them. There are no passwords. **Face ID
(passkeys)** comes later as an upgrade, if the chosen database service supports
it.

**Why.**
- There's no password to forget, reuse, or leak.
- It's simple enough for the parents to manage.
- A code works the same in Safari and in the home-screen app.

**Options ruled out.**
- **Email + password:** forgotten and reused passwords, and stored passwords
  are what attackers target.
- **Emailed sign-in link:** on iPhone, tapping it opens Safari, not the
  home-screen app, so the person ends up signed in in the wrong place.
- **Sign in with Apple:** on the web it requires the $99/year Apple Developer
  Program.
- **Face ID now:** support depends on the database service. It's deferred,
  not rejected.

**Trade-off accepted.** The account is only as secure as the person's email
account.

**Claude's calls (security details, confirmed by Aamir 2026-10-25).**
- **Codes are single-use and short-lived.** They expire after about 10
  minutes.
- **Wrong guesses are limited.** After a few wrong codes, wait before trying
  again.
- **Each device stays signed in for about 30 days,** so nobody types codes
  daily.
- **A "sign out of all devices" option,** e.g. after a lost phone.

**To check with the tech stack.** Sign-in codes are emails too. Free auth
services often cap how many they send per hour unless you connect your own
email sender, which is the same domain-or-Gmail question as D17.
