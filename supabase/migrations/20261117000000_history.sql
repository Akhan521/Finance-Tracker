-- Change history (D8, design section 9). Who did what, and when. Written only
-- by AFTER triggers; clients can read, never write.

create table public.history (
  id bigint generated always as identity primary key,
  household_id uuid references public.households (id) on delete cascade,
  owner_id uuid references public.profiles (id) on delete cascade,
  bill_id uuid references public.bills (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  kind text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now(),
  constraint history_one_scope check ((household_id is null) <> (owner_id is null)),
  constraint history_kind_valid check (kind in (
    'bill_created', 'bill_changed', 'bill_archived', 'bill_restored',
    'payment_added', 'payment_removed',
    'invite_sent', 'invite_cancelled',
    'member_joined', 'member_left', 'member_removed', 'role_changed'
  ))
);

create index history_household_idx on public.history (household_id, id);
create index history_owner_idx on public.history (owner_id, id);
create index history_bill_idx on public.history (bill_id, id);

alter table public.history enable row level security;

-- Personal rows: only the owner. Household rows: members, except invite rows
-- (they carry the invited email), which only owners see (design section 9).
create policy history_select on public.history for select to authenticated
  using (
    (owner_id is not null and owner_id = auth.uid())
    or (household_id is not null and (
      case when kind in ('invite_sent', 'invite_cancelled')
           then public.is_owner(household_id)
           else public.is_member(household_id) end))
  );

-- ------------------------------------------------------------- triggers
-- AFTER triggers run once the row has already passed RLS, so SECURITY DEFINER
-- is safe here (it is only needed to write the closed history table). Each one
-- skips when the parent it would reference is already gone, so cascaded
-- deletes (a household, an account) never fail on a foreign key.

-- The acting user, or null when there is none (SQL console, cron) or the
-- profile is already gone.
create function public.history_actor()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select p.id from public.profiles p where p.id = auth.uid();
$$;

create function public.history_bill_event()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_field text;
begin
  if tg_op = 'INSERT' then
    insert into public.history (household_id, owner_id, bill_id, actor_id, kind)
    values (new.household_id, new.owner_id, new.id, public.history_actor(), 'bill_created');
    return null;
  end if;

  foreach v_field in array array[
    'name', 'category_id', 'usual_cents', 'schedule', 'every_weeks',
    'anchor_date', 'nickname', 'last4', 'pay_url'
  ] loop
    if to_jsonb(new) -> v_field is distinct from to_jsonb(old) -> v_field then
      insert into public.history (household_id, owner_id, bill_id, actor_id, kind, detail)
      values (
        new.household_id, new.owner_id, new.id, public.history_actor(), 'bill_changed',
        case when v_field in ('last4', 'pay_url')
             then jsonb_build_object('field', v_field)
             else jsonb_build_object('field', v_field,
                    'old', to_jsonb(old) -> v_field, 'new', to_jsonb(new) -> v_field) end
      );
    end if;
  end loop;

  if old.archived_at is null and new.archived_at is not null then
    insert into public.history (household_id, owner_id, bill_id, actor_id, kind)
    values (new.household_id, new.owner_id, new.id, public.history_actor(), 'bill_archived');
  elsif old.archived_at is not null and new.archived_at is null then
    insert into public.history (household_id, owner_id, bill_id, actor_id, kind)
    values (new.household_id, new.owner_id, new.id, public.history_actor(), 'bill_restored');
  end if;
  return null;
end;
$$;

create trigger history_bills_insert
  after insert on public.bills
  for each row execute function public.history_bill_event();
create trigger history_bills_update
  after update on public.bills
  for each row execute function public.history_bill_event();

create function public.history_payment_event()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  p public.payments := case when tg_op = 'DELETE' then old else new end;
  v_bill_id uuid;
  v_household uuid;
  v_owner uuid;
  v_due date;
begin
  select b.id, b.household_id, b.owner_id, e.due_date
    into v_bill_id, v_household, v_owner, v_due
  from public.entries e join public.bills b on b.id = e.bill_id
  where e.id = p.entry_id;
  -- Entry or bill already gone (cascade): nothing to record.
  if v_bill_id is null then
    return null;
  end if;

  insert into public.history (household_id, owner_id, bill_id, actor_id, kind, detail)
  values (
    v_household, v_owner, v_bill_id, public.history_actor(),
    case when tg_op = 'DELETE' then 'payment_removed' else 'payment_added' end,
    jsonb_build_object('amount_cents', p.amount_cents, 'paid_on', p.paid_on, 'due_date', v_due)
  );
  return null;
end;
$$;

create trigger history_payments_change
  after insert or delete on public.payments
  for each row execute function public.history_payment_event();

create function public.history_invite_event()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_kind text;
begin
  if tg_op = 'INSERT' then
    v_kind := 'invite_sent';
  elsif old.cancelled_at is null and new.cancelled_at is not null then
    v_kind := 'invite_cancelled';
  else
    return null;
  end if;

  if not exists (select 1 from public.households h where h.id = new.household_id) then
    return null;
  end if;
  insert into public.history (household_id, actor_id, kind, detail)
  values (new.household_id, public.history_actor(), v_kind,
          jsonb_build_object('email', new.email));
  return null;
end;
$$;

create trigger history_invites_event
  after insert or update on public.invites
  for each row execute function public.history_invite_event();

create function public.history_membership_event()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  m public.memberships := case when tg_op = 'DELETE' then old else new end;
  v_kind text;
  v_detail jsonb;
begin
  if tg_op = 'INSERT' then
    v_kind := 'member_joined';
    v_detail := jsonb_build_object('profile_id', m.profile_id);
  elsif tg_op = 'DELETE' then
    -- The person leaving (or being deleted) may already be gone.
    if not exists (select 1 from public.profiles p where p.id = old.profile_id) then
      return null;
    end if;
    v_kind := case when auth.uid() = old.profile_id then 'member_left' else 'member_removed' end;
    v_detail := jsonb_build_object('profile_id', old.profile_id);
  elsif new.role is distinct from old.role then
    v_kind := 'role_changed';
    v_detail := jsonb_build_object('profile_id', new.profile_id, 'old', old.role, 'new', new.role);
  else
    return null;
  end if;

  if not exists (select 1 from public.households h where h.id = m.household_id) then
    return null;
  end if;
  insert into public.history (household_id, actor_id, kind, detail)
  values (m.household_id, public.history_actor(), v_kind, v_detail);
  return null;
end;
$$;

create trigger history_memberships_event
  after insert or update or delete on public.memberships
  for each row execute function public.history_membership_event();

-- ---------------------------------------------------------------- grants
revoke all on public.history from anon, authenticated;
grant select on public.history to authenticated;

revoke execute on function
  public.history_actor(), public.history_bill_event(), public.history_payment_event(),
  public.history_invite_event(), public.history_membership_event()
  from public, anon, authenticated;
