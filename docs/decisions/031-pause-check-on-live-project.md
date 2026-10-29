# D31. Check free-plan pausing on the live project, not in an early test: Decided (Aamir, 2026-10-28)

**Context.** Design §11 asked to verify early that the keep-alive and the
daily job keep the free Supabase project from pausing. The plan had a check
called V2: a throwaway second project watched for 8 or more days. The
review found this check was weak:
- Supabase's docs already say regular API calls prevent pausing
  ([Project pausing](https://supabase.com/docs/guides/platform/free-project-pausing)),
  and the daily GitHub Action makes such calls.
- V2 ran two keep-alives at once, so it couldn't show which one worked.
- Whatever it found, the fix would be the same: ping more often.
- It cost the second free project slot, an early push, and 8 days of
  waiting.
- Two safety nets already exist: Supabase emails a warning about a week
  before pausing, and a paused project can be restored.

**Decision.**
- **Drop V2.**
- **Check pausing on the live project instead.** For the first 3 weeks
  after launch, confirm no pause-warning email arrives (plan, last task).
- If a warning arrives, revisit D27.

**Changes.** Design §11 item 2 (verified on the live project, not early).
