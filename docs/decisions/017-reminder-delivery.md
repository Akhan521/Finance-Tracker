# D17. How reminders are delivered: Decided (email), phone notifications open

**Decision.** Reminders (D16) go out by **email**. Aamir judged it the best fit
for the household: it needs no setup on anyone's phone.

**How it works.** A scheduled server job runs once a day. It finds unpaid bills
due in 7 days, due today, or overdue since yesterday, works out who should hear
about each one (D16), and sends each person an email.

**Cost and setup to settle with the tech stack.**
- Email sending services expect mail from your own web domain (about $10–12 a
  year). Otherwise messages tend to land in spam.
- Free workaround: send through a dedicated Gmail account, which is fine at a
  household's volume. Its password must be stored only as a server-side secret
  (D9).

**Phone notifications (Web Push), considered.** Free; supported on iPhone since
iOS 16.4; no $99 Apple program needed.
- Setup on each device: add the app to the home screen from Safari, open it
  from there, tap "Turn on reminders," and allow notifications. The device's
  delivery address is saved to that person's account.
- Sending: the same daily job, but it pushes to the saved addresses, signed
  with a server-only secret key.
- Downsides:
  - It's per device.
  - It silently stops if the app is removed or notifications are turned off.
  - Lock-screen text is visible to anyone nearby, so messages would leave out
    amounts.

**Still open.** Whether to also offer phone notifications as an opt-in per
person. It would be little extra work, since it shares the daily job.
