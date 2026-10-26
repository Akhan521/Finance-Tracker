# D20. Tech stack: Decided

Researched 2026-10-25 (sources at the bottom). The goal: $0 to run (D5),
security first (D6).

## Choices

- **Database, sign-in, and server jobs: Supabase (free plan).**
  - The emailed 6-digit code sign-in is built in (D18). The default code
    lifetime is 1 hour; shorten it to ~10 minutes. One code request per user
    per 60 seconds by default.
  - The database itself enforces who sees what (Postgres row-level security),
    which D8 requires.
  - The daily reminder job runs on the built-in scheduler (pg_cron calling an
    Edge Function).
  - Passkeys / Face ID are in beta, which fits "Face ID later" (D18).
- **Email sender: a dedicated Gmail account** (Aamir's choice: keep it free).
  It sends sign-in codes (D18), invites (D19), and reminders (D17). Connect it
  to Supabase as its email sender. Its credentials are stored only as
  server-side secrets (D9).
- **App: React + TypeScript**, installable on the iPhone home screen.
  TypeScript is React with extra checks that catch mistakes early. (Claude's
  call; it builds on Aamir's React experience.)
- **Hosting: a free static host, e.g. Cloudflare Pages.** (Claude's call.)
  The app lives at the host's free address; there's no custom domain.

## Free-plan catches and how we handle them

1. **Supabase pauses a project after 1 week without activity.** The data is
   kept, but the app goes offline until it's restored, and reminders stop
   silently.
   - The daily reminder job should count as activity.
   - Add a free daily keep-alive check (a scheduled GitHub Action) as a
     safety net.
   - Verify during the build that this actually prevents pausing.
2. **No backups on the free plan.** (Pro is $25/month with 7 days of daily
   backups.)
   - Add our own automatic weekly backup: an encrypted database copy stored
     privately.
   - The CSV export (D12) is a second safety net.
   - The backups must follow the 3-year window and account deletion (D12,
     D15). Old backups age out.
3. **Supabase's built-in email sender is test-only:** about 2 emails an hour,
   and only to the project's team. That's why the Gmail sender above is
   required, not optional.

## Options ruled out

- **Firebase:** no emailed 6-digit code sign-in (only emailed links, ruled out
  in D18). Its scheduled jobs appear to need the pay-as-you-go plan with a
  card on file.
- **Supabase Pro ($25/month):** breaks the "free" decision (D5). Revisit only if
  pausing or the lack of backups becomes a real problem.
- **A custom domain (~$10–12/year)** for email and the app address: declined
  to keep it free. Easy to add later.
- **Building our own sign-in:** a security risk, and against D6.

## To verify during the build

- Gmail's current setup and limits for sending from an app. This likely needs
  two-step verification plus an app password, and has a daily sending cap
  (around 500/day historically) that's far above household volume.
- That the daily job keeps the project from pausing.

## Sources

- [Supabase pricing](https://supabase.com/pricing)
- [Supabase passwordless email (OTP)](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [Supabase passkeys](https://supabase.com/docs/guides/auth/passkeys)
- [Supabase: scheduling Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions)
- [Firebase Auth (web)](https://firebase.google.com/docs/auth/web/start)
- [Firebase pricing plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)
- [Brevo: Supabase SMTP integration](https://developers.brevo.com/docs/supabase-smtp-integration)
