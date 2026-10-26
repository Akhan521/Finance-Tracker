# D19. How someone joins a household: Decided (Claude's recommendation, Aamir asked for it)

**Decision: invite by email address.**
1. An owner (D14) enters the person's email in the app.
2. The person gets an email saying they've been invited.
3. They sign in with that same email (D18) and tap **Accept**.

**Rejoining uses the same flow (simplifies D13).** A former member asks an
owner, and the owner invites them again. There's no "request to rejoin"
button. This gives one flow for joining and rejoining, with nothing extra to
build. In a family, "can you add me back?" happens in person or by text
anyway.

**Details.**
- **Invites expire after 7 days.** Owners can see and cancel pending invites.
- **New people:** if the invited person has no account yet, signing in with
  the code creates one, then shows the invite.
- **Only the invited email can accept.** The invite isn't a link that works
  for whoever holds it.

**Options ruled out.**
- **A shareable invite link** (texted to someone): anyone holding it can join,
  including someone it was forwarded to. Making it safe needs an extra
  owner-approval step.
- **A household join code plus owner approval:** two steps, and codes can leak
  or be guessed.
- **A "request to rejoin" button:** an extra mechanism and extra approval
  emails, for something a family handles by asking.

**Why.** It's the simplest flow and the most secure one. It reuses the
emailed-code sign-in, and there's nothing that can be forwarded or guessed.

**Needs email sending.** Invite emails, like reminders (D17) and sign-in codes
(D18), need an email sender.
