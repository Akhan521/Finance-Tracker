# D27. How we notice that the jobs have stopped: Decided (Claude's call, 2026-10-26)

**Context.** The anti-goal is "silent failure of reminders." Three quiet ways
reminders could stop:
- Supabase pauses a free project after 7 low-activity days.
- A reminder run fails, but pg_cron failures email nobody.
- **GitHub turns off scheduled workflows in a public repo after 60 days with
  no repo activity,** which would silently stop the keep-alive and backups.

**Decision.**
- **The reminder job runs every hour** (pg_cron calling an Edge Function). It
  sends to each person once their local time is past 8 a.m. If a run is
  missed, the next hour catches up.
- **Every run writes its result to a `job_runs` table.**
- **A daily GitHub Action ("daily health") is both the keep-alive and the
  watchdog.**
  - It makes an authenticated request to a health function in the database,
    which counts as activity.
  - It **fails** if the last successful reminder run is over 3 hours old, or
    if any run failed in the past day.
  - A failed Action emails Aamir (GitHub's default for the person who set it
    up).
- **Against GitHub's 60-day rule:** the daily health Action calls GitHub's
  API to re-enable itself and the backup workflow on every run.
  - This is to be confirmed over time.
  - GitHub also emails a warning before disabling a workflow.
  - Supabase emails a warning about a week before pausing.

**Why.** One small Action covers the keep-alive and the watchdog, and it
fails loudly. Hourly runs make a missed run cost an hour, not a day.

**Options ruled out.**
- **A paid uptime monitor:** not free.
- **Trusting pg_cron alone:** a broken run would go unnoticed.
- **Bot commits to keep the repo "active":** they clutter history, and the
  re-enable API call is cleaner.

**Update (2026-10-28, D29).** Reminders now run **once a day**, not hourly.
The watchdog's thresholds become 26 hours for both jobs. The plan review
also found that a workflow re-enabled by the bot may send its failure
emails to the bot instead of Aamir. So if GitHub ever warns that a workflow
will be disabled, Aamir re-enables it by hand.
