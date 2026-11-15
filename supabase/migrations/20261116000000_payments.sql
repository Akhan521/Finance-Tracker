-- Payments and entry status (D25, design section 6).

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.entries (id) on delete cascade,
  amount_cents bigint not null,
  paid_on date not null,
  paid_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint payments_amount_range check (amount_cents between 1 and 99999999)
);

create index payments_entry_idx on public.payments (entry_id);

alter table public.payments enable row level security;

-- SECURITY INVOKER on purpose: it needs no privileges, and a definer BEFORE
-- trigger would run before RLS WITH CHECK. The column grant already refuses a
-- client-sent paid_by or created_at; this forces the stored values anyway.
create function public.payments_set_payer()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.paid_by := auth.uid();
  new.created_at := now();
  return new;
end;
$$;

create trigger payments_set_payer
  before insert on public.payments
  for each row execute function public.payments_set_payer();

create policy payments_select on public.payments for select to authenticated
  using (exists (select 1 from public.entries e
                 where e.id = entry_id and public.can_access_bill(e.bill_id)));
create policy payments_insert on public.payments for insert to authenticated
  with check (exists (select 1 from public.entries e
                      where e.id = entry_id and public.can_access_bill(e.bill_id)));
create policy payments_delete on public.payments for delete to authenticated
  using (exists (select 1 from public.entries e
                 where e.id = entry_id and public.can_access_bill(e.bill_id)));

-- The ONE copy of the status rule.
create function public.status_rule(
  p_is_card boolean, p_minimum bigint, p_paid bigint, p_due date, p_today date
)
returns text
language sql immutable set search_path = ''
as $$
  select case
    when (case when p_is_card and p_minimum is not null then p_paid >= p_minimum
               else p_paid > 0 end) then 'paid'
    when p_today > p_due then 'overdue'
    else 'upcoming'
  end;
$$;

create view public.entry_view with (security_invoker = true) as
select
  e.id, e.bill_id, e.due_date,
  b.name as bill_name, b.household_id, b.owner_id, b.category_id,
  b.is_credit_card, b.archived_at,
  e.expected_cents, e.minimum_cents, e.statement_cents,
  coalesce(p.paid, 0)::bigint as paid_cents,
  (case when b.is_credit_card and e.minimum_cents is not null
        then e.minimum_cents else e.expected_cents end)::bigint as target_cents,
  public.status_rule(
    b.is_credit_card, e.minimum_cents, coalesce(p.paid, 0)::bigint, e.due_date,
    public.scope_today(b.household_id, b.owner_id)
  ) as status
from public.entries e
join public.bills b on b.id = e.bill_id
left join lateral (
  select sum(py.amount_cents) as paid from public.payments py where py.entry_id = e.id
) p on true;

-- Narrowed: "untouched" now means no saved minimum AND no payments.
create or replace function public.bills_entries_sync()
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
      where e.bill_id = new.id and e.due_date >= v_today and e.minimum_cents is null
        and not exists (select 1 from public.payments p where p.entry_id = e.id);
    end if;
  else
    if v_changed then
      delete from public.entries e
      where e.bill_id = new.id and e.due_date >= v_today and e.minimum_cents is null
        and not exists (select 1 from public.payments p where p.entry_id = e.id);
    end if;
    if v_changed or old.archived_at is not null then
      perform public.generate_entries(new.id, greatest(new.anchor_date, v_today));
    end if;
  end if;

  -- Untouched: no payments either, so a paid entry keeps its expected amount.
  if new.usual_cents is distinct from old.usual_cents then
    update public.entries e
    set expected_cents = new.usual_cents
    where e.bill_id = new.id and e.due_date >= v_today
      and not exists (select 1 from public.payments p where p.entry_id = e.id);
  end if;

  return null;
end;
$$;

revoke all on public.payments from anon, authenticated;
grant select, delete on public.payments to authenticated;
grant insert (entry_id, amount_cents, paid_on) on public.payments to authenticated;

revoke all on public.entry_view from anon, authenticated;
grant select on public.entry_view to authenticated;

revoke execute on function public.payments_set_payer() from public, anon, authenticated;
revoke execute on function public.status_rule(boolean, bigint, bigint, date, date)
  from public, anon;
grant execute on function public.status_rule(boolean, bigint, bigint, date, date)
  to authenticated;
