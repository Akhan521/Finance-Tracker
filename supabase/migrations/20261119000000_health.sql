-- Keep-alive and watchdog (D27, D29, D31). A daily GitHub Action calls
-- health_check with a token held in Supabase Vault; the request counts as
-- activity for the free plan and reports whether the daily jobs are healthy.

-- Written by the reminder and maintenance jobs. Task 21 uses this table and
-- must NOT recreate it; it adds record_job_run there. No policies, and every
-- client privilege is revoked below (including TRUNCATE, which bypasses RLS):
-- only security definer functions and the service side touch it.
create table public.job_runs (
  id bigint generated always as identity primary key,
  job text not null check (job in ('reminders', 'maintenance')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  detail text
);
alter table public.job_runs enable row level security;
-- Close the defaults for authenticated too. Earlier migrations revoke table
-- privileges and then grant explicitly, so nothing relies on the defaults; but
-- sequences created under the old defaults (history_id_seq) still carry
-- authenticated grants, and identity inserts need no sequence privilege.
alter default privileges for role postgres in schema public revoke all on tables from authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from authenticated;
revoke all on public.job_runs from anon, authenticated;
revoke all on sequence public.job_runs_id_seq from anon, authenticated;
revoke all on sequence public.history_id_seq from anon, authenticated;
create index job_runs_job_started_idx on public.job_runs (job, started_at desc);

create function public.health_check(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
  v_rem timestamptz;
  v_mnt timestamptz;
  v_fail int;
begin
  select decrypted_secret into v_secret
    from vault.decrypted_secrets
   where name = 'health_token'
   limit 1;

  if p_token is null or v_secret is null or p_token <> v_secret then
    raise exception 'forbidden';
  end if;

  select max(finished_at) into v_rem
    from public.job_runs where job = 'reminders' and ok;
  select max(finished_at) into v_mnt
    from public.job_runs where job = 'maintenance' and ok;
  select count(*)::int into v_fail
    from public.job_runs
   where ok is false and started_at > now() - interval '24 hours';

  return jsonb_build_object(
    'ok', coalesce(v_rem > now() - interval '26 hours', false)
          and coalesce(v_mnt > now() - interval '26 hours', false)
          and v_fail = 0,
    'last_reminders_ok_at', v_rem,
    'last_maintenance_ok_at', v_mnt,
    'failures_24h', v_fail
  );
end;
$$;

revoke execute on function public.health_check(text) from public, authenticated;
grant execute on function public.health_check(text) to anon;
