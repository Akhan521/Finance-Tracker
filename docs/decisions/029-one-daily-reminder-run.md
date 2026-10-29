# D29. Reminders run once a day: Decided (Aamir, 2026-10-28)

**Context.** D27 had the reminder job run every hour, emailing each person
once their local time passed 8 a.m. The plan review found this added
machinery (a "sent today" table, the 8 a.m. check, same-day retries) for
little gain. Catch-up after a missed run already happens the next day,
because reminders fire over a range of days and are never sent twice.

**Decision.**
- **One reminder run a day, at a fixed time.** It runs at the UTC hour that
  is 8 a.m. in the household's *standard* time. That hour is set per copy
  of the app, in `docs/operations.md`.
- **During daylight saving it arrives an hour later** (9 a.m.). Accepted.
- **Everyone on this copy gets reminders at the household's time,**
  including anyone without a household. "Today" still uses each person's
  own time zone.
- **A failed send is retried the next day.** Lead and overdue reminders
  still go out, because they cover a range of days. Only a "due today"
  email can be missed, and the next day's overdue email covers it.
- **A rerun never repeats a reminder.** It can send a second email that day
  only for bills that became due for a reminder after the first run.

**Why.** Everyone using this copy lives in one time zone, so a single run
meets the household's need with less code and fewer tables.

**Changes.** D27 (hourly runs, and its 3-hour watchdog threshold), and
design §8 ("personal-only users use their own time zone").

**Options ruled out.**
- **Hourly runs that email only in each person's local 8 a.m. hour:** this
  works for any time zone, but it isn't needed for one household.
- **Hourly runs with catch-up (D27):** this needs the most machinery.
