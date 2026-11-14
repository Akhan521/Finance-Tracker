-- Schedules and stored entries (D25). One SQL function does all schedule math;
-- entries are stored 12 months ahead and inherit their bill's access rules.

-- ---------------------------------------------------------------- tables

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.bills (id) on delete cascade,
  due_date date not null,
  expected_cents bigint not null,
  minimum_cents bigint,
  statement_cents bigint,
  constraint entries_bill_due unique (bill_id, due_date),
  constraint entries_expected_range check (expected_cents >= 0),
  constraint entries_minimum_range check (minimum_cents is null or minimum_cents > 0),
  constraint entries_statement_range check (statement_cents is null or statement_cents >= 0)
);

alter table public.entries enable row level security;

-- ------------------------------------------------------------- functions

-- Pure schedule math. Monthly and yearly dates are measured from the ANCHOR's
-- day every time, clamped to the month's last day (Jan 31, Feb 28, Mar 31).
-- Returns only dates in [p_from, p_through], never before the anchor.
create function public.due_dates(
  p_schedule text, p_every_weeks int, p_anchor date, p_from date, p_through date
)
returns setof date
language plpgsql immutable set search_path = ''
as $$
declare
  v_step int;
  v_k0 int;
  v_day int;
  v_base date;
  v_n int;
begin
  if p_anchor is null or p_from is null or p_through is null or p_through < p_from then
    return;
  end if;
  v_day := extract(day from p_anchor)::int;

  if p_schedule = 'once' then
    if p_anchor between p_from and p_through then
      return next p_anchor;
    end if;

  elsif p_schedule = 'weeks' then
    if p_every_weeks is null or p_every_weeks < 1 then
      return;
    end if;
    v_step := 7 * p_every_weeks;
    v_k0 := greatest(0, ceil((p_from - p_anchor)::numeric / v_step))::int;
    return query
      select x.d
      from (select p_anchor + k * v_step as d
            from generate_series(v_k0, greatest(v_k0, (p_through - p_anchor) / v_step)) k) x
      where x.d >= p_anchor and x.d between p_from and p_through
      order by x.d;

  elsif p_schedule = 'monthly' then
    -- First of the first month that could matter.
    v_base := greatest(
      p_anchor - (v_day - 1),
      p_from - (extract(day from p_from)::int - 1)
    );
    v_n := (extract(year from p_through)::int - extract(year from v_base)::int) * 12
         + extract(month from p_through)::int - extract(month from v_base)::int;
    return query
      select x.d
      from (select m.ms + (least(v_day, (m.ms + interval '1 month')::date - m.ms) - 1) as d
            from (select (v_base + make_interval(months => i))::date as ms
                  from generate_series(0, v_n) i) m) x
      where x.d >= p_anchor and x.d between p_from and p_through
      order by x.d;

  elsif p_schedule = 'yearly' then
    return query
      select x.d
      from (select y.ms + (least(v_day, (y.ms + interval '1 month')::date - y.ms) - 1) as d
            from (select make_date(yr, extract(month from p_anchor)::int, 1) as ms
                  from generate_series(
                    greatest(extract(year from p_anchor)::int, extract(year from p_from)::int),
                    extract(year from p_through)::int) yr) y) x
      where x.d >= p_anchor and x.d between p_from and p_through
      order by x.d;
  end if;
end;
$$;

-- "Today" in the scope's own time zone: the household's, else the owner's
-- profile, else UTC.
create function public.scope_today(p_household uuid, p_owner uuid)
returns date
language sql stable security definer set search_path = ''
as $$
  select (now() at time zone coalesce(
    (select h.time_zone from public.households h where h.id = p_household),
    (select p.time_zone from public.profiles p where p.id = p_owner),
    'UTC'
  ))::date;
$$;

-- Internal: store a bill's entries from p_from through 12 months after the
-- scope's today. Safe to repeat. Archived bills get nothing.
create function public.generate_entries(p_bill uuid, p_from date)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_bill public.bills;
begin
  select * into v_bill from public.bills b where b.id = p_bill;
  if not found or v_bill.archived_at is not null then
    return;
  end if;

  insert into public.entries (bill_id, due_date, expected_cents)
  select v_bill.id, d, v_bill.usual_cents
  from public.due_dates(
    v_bill.schedule, v_bill.every_weeks, v_bill.anchor_date, p_from,
    (public.scope_today(v_bill.household_id, v_bill.owner_id) + interval '12 months')::date
  ) d
  on conflict (bill_id, due_date) do nothing;
end;
$$;

-- Internal: the daily job. Extends every live bill to 12 months ahead.
create function public.extend_entries()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select b.id, public.scope_today(b.household_id, b.owner_id) as today
    from public.bills b
    where b.archived_at is null
  loop
    perform public.generate_entries(r.id, r.today);
  end loop;
end;
$$;

-- AFTER trigger on purpose: it only has side effects on entries, and the
-- client's own write to bills was already checked by RLS and grants.
-- "Untouched" for now means no saved minimum; Task 6 adds "and no payments".
create function public.bills_entries_sync()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_today date;
  v_changed boolean;
begin
  if tg_op = 'INSERT' then
    -- Back-fill at most one month: a bill that was just missed still shows as
    -- overdue, but an old or absurd anchor (a weekly bill from year 1) cannot
    -- create thousands of rows. Changes and restores never back-fill at all.
    perform public.generate_entries(
      new.id,
      greatest(
        new.anchor_date,
        (public.scope_today(new.household_id, new.owner_id) - interval '1 month')::date
      )
    );
    return null;
  end if;

  v_today := public.scope_today(new.household_id, new.owner_id);
  v_changed := new.schedule is distinct from old.schedule
    or new.every_weeks is distinct from old.every_weeks
    or new.anchor_date is distinct from old.anchor_date;

  if new.archived_at is not null then
    if old.archived_at is null then
      delete from public.entries e
      where e.bill_id = new.id and e.due_date >= v_today and e.minimum_cents is null;
    end if;
  else
    if v_changed then
      delete from public.entries e
      where e.bill_id = new.id and e.due_date >= v_today and e.minimum_cents is null;
    end if;
    if v_changed or old.archived_at is not null then
      perform public.generate_entries(new.id, greatest(new.anchor_date, v_today));
    end if;
  end if;

  -- Task 6 adds "and no payments" to this update too.
  if new.usual_cents is distinct from old.usual_cents then
    update public.entries e
    set expected_cents = new.usual_cents
    where e.bill_id = new.id and e.due_date >= v_today;
  end if;

  return null;
end;
$$;

create trigger bills_entries_sync
  after insert or update on public.bills
  for each row execute function public.bills_entries_sync();

-- SECURITY INVOKER: it reads the bill as the caller, who must already have
-- passed RLS to reach this entry.
create function public.entries_check_card()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if (new.minimum_cents is not null and new.minimum_cents is distinct from old.minimum_cents)
     or (new.statement_cents is not null and new.statement_cents is distinct from old.statement_cents) then
    if not exists (
      select 1 from public.bills b where b.id = new.bill_id and b.is_credit_card
    ) then
      raise exception 'not_credit_card';
    end if;
  end if;
  return new;
end;
$$;

create trigger entries_check_card
  before update of minimum_cents, statement_cents on public.entries
  for each row execute function public.entries_check_card();

-- -------------------------------------------------------------- policies

create policy entries_select on public.entries for select to authenticated
  using (public.can_access_bill(bill_id));
create policy entries_update on public.entries for update to authenticated
  using (public.can_access_bill(bill_id))
  with check (public.can_access_bill(bill_id));

-- ---------------------------------------------------------------- grants

revoke all on public.entries from anon, authenticated;
grant select on public.entries to authenticated;
grant update (minimum_cents, statement_cents) on public.entries to authenticated;

revoke execute on function
  public.due_dates(text, int, date, date, date), public.scope_today(uuid, uuid),
  public.generate_entries(uuid, date), public.extend_entries(),
  public.bills_entries_sync(), public.entries_check_card()
  from public, anon, authenticated;
grant execute on function
  public.due_dates(text, int, date, date, date), public.scope_today(uuid, uuid)
  to authenticated;
