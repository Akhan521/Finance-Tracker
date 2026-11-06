# Verify-early results

One section per check from design §11 and the plan's Phase 1. Values that
identify the live deployment (project ref, URLs, the sender address, family
emails) are never written here (D32); placeholders like `<project-ref>` stand
in for them.

## V1: Gmail SMTP from Supabase Auth and from an Edge Function

**Date:** 2026-11-05 · **Result: pass**

**What was done**
- Aamir created the dedicated Gmail sender (2-Step Verification on, app
  password "Supabase") and Supabase project A (Free plan, 2FA on the
  account), and linked the repo with `npx supabase link`.
- Auth SMTP set in the dashboard: `smtp.gmail.com`, port 465, sender name
  "Bills", minimum interval per user 60 s, email rate limit 10 an hour (D32).
- The Magic Link and Confirm Signup templates use `supabase/templates/code.html`,
  subject "Your Bills sign-in code".
- Auth test: `signInWithOtp({ email, options: { shouldCreateUser: false } })`
  with the publishable key, for Aamir's personal address (added as a user in
  the dashboard).
- Edge Function test: a temporary `smtp-check` function, gated by an
  `x-check-secret` header and deployed with `--no-verify-jwt`, called
  `sendEmail` from `supabase/functions/_shared/email.ts`. SMTP values were
  set with `npx supabase secrets set --env-file <file outside the repo>`.
  The function, its folder, and `CHECK_SECRET` were deleted afterwards.

**Results**
- **Auth email:** delivered in under a minute, to the inbox (not spam), from
  "Bills", with the code and no link.
- **Edge Function email:** port **465** (implicit TLS) works from Edge
  Functions. The send returned in 1.4 s, and the email reached the inbox
  within the same minute.
- **The function's gate held:** no secret → 401, wrong secret → 401,
  GET → 405, two recipients in `to` → 400.
- **Gmail's sending limit** (checked 2026-11-05 on
  [Limits for sending & getting mail](https://support.google.com/mail/answer/22839)):
  more than 500 emails a day, or more than 500 recipients in one email,
  triggers an error. Sending works again "within 1 to 24 hours." The page
  says nothing different for SMTP or app passwords. The household's volume
  is far below this.

**What this changes**
- **Hosted Auth doesn't use `supabase/config.toml`.** The first live code had
  **8 digits**, and the expiry was the hosted default. Both were fixed in the
  dashboard (Email OTP length 6, expiry 600 s). Every Auth setting in
  `config.toml` must be checked by hand on the live project; this belongs in
  the production settings checklist in `docs/operations.md`.
- **Edge Functions that import `_shared/email.ts` need their own
  `deno.json`** (`{"imports":{},"nodeModulesDir":"none"}`). Without it, Deno
  finds the repo's root `package.json` and refuses `npm:nodemailer@10`.
- **Deploys can bundle on Supabase's side** with `--use-api`, so Docker
  isn't needed to deploy.
- The dashboard warns that Gmail is meant for personal mail and delivery may
  suffer. Accepted (D17, D20); both test emails reached the inbox.
- The Invite, Change email, Reset password, and Reauthentication templates
  still have Supabase's default links. V3 makes them code-only.
