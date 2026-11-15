-- Lock down the schedule helpers (security review of the entries migration).
--
-- due_dates: no client path needs it, and an unbounded range is a DoS vector.
-- Only definer code (generate_entries) calls it.
revoke execute on function public.due_dates(text, int, date, date, date)
  from public, anon, authenticated;

-- scope_today: as definer it disclosed any household's or profile's time zone
-- to any signed-in user. As invoker, RLS decides what the caller can see; an
-- unseen household falls back to the owner's profile zone if the caller can
-- see that profile, else UTC. Definer callers
-- (generate_entries, extend_entries, bills_entries_sync) run as postgres and
-- are unaffected. Still callable by authenticated for invoker views.
alter function public.scope_today(uuid, uuid) security invoker;
revoke execute on function public.scope_today(uuid, uuid) from public, anon;
grant execute on function public.scope_today(uuid, uuid) to authenticated;
