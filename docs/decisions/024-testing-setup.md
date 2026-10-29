# D24. How the code is tested: Decided (Claude's call, 2026-10-26)

**Context.** Design §9 makes security tests acceptance criteria and says they
must run "against the real policies." Design §10 left the test framework to
the builder. Everything must stay free.

**Decision.**
- **A local copy of Supabase runs in Docker** (the Supabase CLI's `supabase
  start`). It is the same Postgres, Auth, and API as the hosted project,
  including a mail catcher that shows every email Auth would have sent.
- **Vitest for all tests.**
  - *Unit tests* for pure app logic (money, totals, calendar, CSV).
  - *Database tests* that sign in as real test users through supabase-js and
    try to read and write each other's data through the same API the app
    uses. These are the security acceptance tests.
- **GitHub Actions runs everything on every push** (free for public repos):
  type check, unit tests, the local Supabase stack, the database tests, and a
  secret scan. A red build blocks merging.
- **Test data is fake.** Every test makes its own random `@test.local` users;
  no real household data ever goes in a test or a fixture.

**Why.** One test tool for a beginner-to-intermediate builder. The security
tests use the real policies and the real API path an attacker would use, not
a mock.

**Options ruled out.**
- **pgTAP SQL tests alone:** fast, but they test the database by pretending to
  be a user rather than signing in. They also can't check the sign-up gate's
  "no email sent" rule.
- **Testing against a hosted Supabase project:** the free plan's second
  project slot is needed for the keep-alive check (V2). It's also slower and
  needs real secrets in CI.
- **Docker Desktop alternatives** (Colima, OrbStack) are fine too; any free
  Docker runtime works.

**Update (2026-10-28, plan review).** gitleaks is dropped from CI. CI runs
after a push, so anything it finds is already public. Instead, **GitHub push
protection** (free, on by default for public repos) blocks known secret
formats before they arrive. A one-line check of the built app catches
secret keys in the bundle. "A red build blocks merging" applies only if
branch protection is turned on. For a solo repo pushing to `main`, a red
build means stop and fix before deploying.
