-- Categories and bills. Household bills are shared with members; personal
-- bills are private to their owner. Every rule lives in RLS, column grants,
-- and triggers.

-- ---------------------------------------------------------------- tables

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households (id) on delete cascade,
  owner_id uuid references public.profiles (id) on delete cascade,
  name text not null,
  color text not null,
  is_credit_card boolean not null default false,
  constraint categories_one_scope check ((household_id is null) <> (owner_id is null)),
  constraint categories_name_len check (char_length(btrim(name)) between 1 and 30),
  constraint categories_color_hex check (color ~ '^#[0-9a-fA-F]{6}$')
);

create unique index categories_household_name on public.categories (household_id, lower(btrim(name)))
  where household_id is not null;
create unique index categories_owner_name on public.categories (owner_id, lower(btrim(name)))
  where owner_id is not null;

create table public.bills (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households (id) on delete cascade,
  owner_id uuid references public.profiles (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete restrict,
  name text not null,
  usual_cents bigint not null,
  schedule text not null,
  every_weeks int,
  anchor_date date not null,
  nickname text,
  last4 text,
  pay_url text,
  is_credit_card boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  constraint bills_one_scope check ((household_id is null) <> (owner_id is null)),
  constraint bills_name_len check (char_length(btrim(name)) between 1 and 60),
  constraint bills_usual_range check (usual_cents between 1 and 99999999),
  constraint bills_schedule_valid check (schedule in ('monthly', 'weeks', 'yearly', 'once')),
  constraint bills_every_weeks check (
    (schedule = 'weeks') = (every_weeks is not null)
    and (every_weeks is null or every_weeks between 1 and 52)
  ),
  constraint bills_nickname_len check (nickname is null or char_length(nickname) <= 40),
  constraint bills_last4_digits check (last4 is null or last4 ~ '^[0-9]{4}$'),
  constraint bills_pay_url_https check (
    pay_url is null or (pay_url ~ '^https://\S+$' and char_length(pay_url) <= 500)
  )
);

create index bills_household_idx on public.bills (household_id);
create index bills_owner_idx on public.bills (owner_id);
create index bills_category_idx on public.bills (category_id);

alter table public.categories enable row level security;
alter table public.bills enable row level security;

-- ------------------------------------------------------------- functions

create function public.can_access_bill(p_bill uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.bills b
    where b.id = p_bill
      and ((b.household_id is not null and public.is_member(b.household_id))
           or b.owner_id = auth.uid())
  );
$$;

-- Defaults for one household OR one person. Idempotent. Internal only.
create function public.seed_default_categories(p_household uuid, p_owner uuid)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.categories (household_id, owner_id, name, color, is_credit_card)
  select p_household, p_owner, d.name, d.color, d.is_cc
  from (values
    ('Housing',          '#F7D9C4', false),
    ('Car',              '#CFE3F7', false),
    ('Utilities',        '#FBEFB5', false),
    ('Insurance',        '#D9D2F0', false),
    ('Credit card',      '#F5CBD6', true),
    ('Internet & phone', '#CDEBDD', false)
  ) as d (name, color, is_cc)
  where (p_household is null) <> (p_owner is null)
  on conflict do nothing;
$$;

-- SECURITY INVOKER on purpose: it only sees categories the caller can see, so
-- an unseen category is indistinguishable from a mismatched or missing one.
create function public.bills_check_category()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_cat public.categories;
begin
  select * into v_cat from public.categories c where c.id = new.category_id;
  if not found
     or v_cat.household_id is distinct from new.household_id
     or v_cat.owner_id is distinct from new.owner_id then
    raise exception 'category_scope_mismatch';
  end if;
  new.is_credit_card := v_cat.is_credit_card;
  return new;
end;
$$;

create trigger bills_check_category
  before insert or update of category_id, household_id, owner_id on public.bills
  for each row execute function public.bills_check_category();

-- Earlier functions, now seeding defaults. Everything else is unchanged.
create or replace function public.create_household(p_name text, p_time_zone text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_signed_in';
  end if;
  if exists (select 1 from public.memberships m where m.profile_id = v_uid) then
    raise exception 'already_in_household';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p_time_zone) then
    raise exception 'bad_time_zone';
  end if;

  insert into public.households (name, time_zone)
  values (p_name, p_time_zone)
  returning id into v_id;

  insert into public.memberships (household_id, profile_id, role)
  values (v_id, v_uid, 'owner');

  perform public.seed_default_categories(v_id, null);

  return v_id;
exception
  when unique_violation then
    -- Two concurrent calls from the same user: the second loses.
    raise exception 'already_in_household';
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, time_zone)
  values (
    new.id,
    coalesce(
      (select z.name from pg_catalog.pg_timezone_names z
       where z.name = new.raw_user_meta_data ->> 'time_zone'
       limit 1),
      'UTC'
    )
  )
  on conflict (id) do nothing;
  perform public.seed_default_categories(null, new.id);
  return new;
end;
$$;

-- Backfill: every existing person and household gets the defaults.
select public.seed_default_categories(null, p.id) from public.profiles p;
select public.seed_default_categories(h.id, null) from public.households h;

-- -------------------------------------------------------------- policies

create policy categories_select on public.categories for select to authenticated
  using ((household_id is not null and public.is_member(household_id))
         or owner_id = (select auth.uid()));
create policy categories_insert on public.categories for insert to authenticated
  with check ((household_id is not null and public.is_member(household_id))
              or owner_id = (select auth.uid()));
create policy categories_update on public.categories for update to authenticated
  using ((household_id is not null and public.is_member(household_id))
         or owner_id = (select auth.uid()))
  with check ((household_id is not null and public.is_member(household_id))
              or owner_id = (select auth.uid()));

create policy bills_select on public.bills for select to authenticated
  using ((household_id is not null and public.is_member(household_id))
         or owner_id = (select auth.uid()));
create policy bills_insert on public.bills for insert to authenticated
  with check ((household_id is not null and public.is_member(household_id))
              or owner_id = (select auth.uid()));
create policy bills_update on public.bills for update to authenticated
  using ((household_id is not null and public.is_member(household_id))
         or owner_id = (select auth.uid()))
  with check ((household_id is not null and public.is_member(household_id))
              or owner_id = (select auth.uid()));

-- ---------------------------------------------------------------- grants

revoke all on public.categories, public.bills from anon, authenticated;

grant select on public.categories, public.bills to authenticated;
grant insert (household_id, owner_id, name, color) on public.categories to authenticated;
grant update (name, color) on public.categories to authenticated;
grant insert (household_id, owner_id, category_id, name, usual_cents, schedule,
              every_weeks, anchor_date, nickname, last4, pay_url)
  on public.bills to authenticated;
grant update (category_id, name, usual_cents, schedule, every_weeks, anchor_date,
              nickname, last4, pay_url, archived_at)
  on public.bills to authenticated;

revoke execute on function
  public.can_access_bill(uuid), public.seed_default_categories(uuid, uuid),
  public.bills_check_category(), public.create_household(text, text),
  public.handle_new_user()
  from public, anon, authenticated;
grant execute on function
  public.can_access_bill(uuid), public.create_household(text, text)
  to authenticated;
