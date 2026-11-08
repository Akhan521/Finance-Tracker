-- Profiles, households, memberships (D-series access model). Every access
-- rule lives in Postgres: RLS policies, column grants, and definer functions.

-- Later objects start closed. Postgres grants EXECUTE on new functions to
-- PUBLIC globally, and Supabase's default privileges also grant tables,
-- functions and sequences in public to anon and authenticated. Neutralize
-- both layers for objects created by postgres; each function also carries an
-- explicit revoke below as a second layer.
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------- tables

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  time_zone text not null default 'UTC',
  remind_household boolean not null default false,
  remind_personal boolean not null default true,
  lead_days int not null default 7,
  retention_months int default 36,
  last_view text not null default 'household',
  heads_up_sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint profiles_display_name_len
    check (display_name is null or char_length(btrim(display_name)) between 1 and 40),
  constraint profiles_lead_days_range check (lead_days between 1 and 14),
  constraint profiles_retention_range
    check (retention_months is null or retention_months between 12 and 120),
  constraint profiles_last_view_valid check (last_view in ('household', 'mine'))
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  time_zone text not null,
  retention_months int default 36,
  heads_up_sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint households_name_len check (char_length(btrim(name)) between 1 and 40),
  constraint households_retention_range
    check (retention_months is null or retention_months between 12 and 120)
);

create table public.memberships (
  household_id uuid not null references public.households (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role text not null,
  joined_at timestamptz not null default now(),
  primary key (household_id, profile_id),
  constraint memberships_one_household unique (profile_id),
  constraint memberships_role_valid check (role in ('owner', 'member'))
);

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.memberships enable row level security;

-- ------------------------------------------------------------- functions

create function public.is_member(p_household uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.household_id = p_household and m.profile_id = auth.uid()
  );
$$;

create function public.is_owner(p_household uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.household_id = p_household and m.profile_id = auth.uid() and m.role = 'owner'
  );
$$;

create function public.my_household_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select m.household_id from public.memberships m where m.profile_id = auth.uid();
$$;

create function public.create_household(p_name text, p_time_zone text)
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

  return v_id;
exception
  when unique_violation then
    -- Two concurrent calls from the same user: the second loses.
    raise exception 'already_in_household';
end;
$$;

create function public.household_names()
returns table (profile_id uuid, display_name text)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.display_name
  from public.profiles p
  join public.memberships m on m.profile_id = p.id
  where m.household_id = public.my_household_id();
$$;

-- Validate a profile's time zone, whoever writes it.
create function public.profiles_check_time_zone()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = new.time_zone) then
    raise exception 'bad_time_zone';
  end if;
  return new;
end;
$$;

create trigger profiles_check_time_zone
  before insert or update of time_zone on public.profiles
  for each row execute function public.profiles_check_time_zone();

-- A household may never end up with no members or no owner. Deferred, so a
-- transaction can reshuffle roles; skipped when the household itself is gone
-- (deleting a household cascades to its memberships).
create function public.memberships_keep_an_owner()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.households h where h.id = old.household_id) then
    return null;
  end if;
  if not exists (select 1 from public.memberships m where m.household_id = old.household_id) then
    raise exception 'household_needs_member';
  end if;
  if not exists (
    select 1 from public.memberships m
    where m.household_id = old.household_id and m.role = 'owner'
  ) then
    raise exception 'last_owner';
  end if;
  return null;
end;
$$;

create constraint trigger memberships_keep_an_owner
  after update or delete on public.memberships
  deferrable initially deferred
  for each row execute function public.memberships_keep_an_owner();

-- New accounts get a profile. The time zone hint is the ONLY use of user
-- metadata, and only if it names a real zone. Never used for access.
create function public.handle_new_user()
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
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Accounts that existed before this migration.
insert into public.profiles (id, time_zone)
select u.id, 'UTC' from auth.users u
on conflict (id) do nothing;

-- -------------------------------------------------------------- policies

create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.memberships m
      where m.profile_id = profiles.id and public.is_member(m.household_id)
    )
  );
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy households_select on public.households for select to authenticated
  using (public.is_member(id));
create policy households_update on public.households for update to authenticated
  using (public.is_owner(id))
  with check (public.is_owner(id));

create policy memberships_select on public.memberships for select to authenticated
  using (profile_id = (select auth.uid()) or public.is_member(household_id));
create policy memberships_update on public.memberships for update to authenticated
  using (public.is_owner(household_id))
  with check (public.is_owner(household_id));
create policy memberships_delete on public.memberships for delete to authenticated
  using (public.is_owner(household_id) or profile_id = (select auth.uid()));

-- ---------------------------------------------------------------- grants

revoke all on public.profiles, public.households, public.memberships from anon, authenticated;

grant select on public.profiles, public.households, public.memberships to authenticated;
grant update (display_name, time_zone, remind_household, remind_personal, lead_days,
              retention_months, last_view) on public.profiles to authenticated;
grant update (name, retention_months) on public.households to authenticated;
grant update (role) on public.memberships to authenticated;
grant delete on public.memberships to authenticated;

revoke execute on function
  public.is_member(uuid), public.is_owner(uuid), public.my_household_id(),
  public.create_household(text, text), public.household_names(),
  public.profiles_check_time_zone(), public.memberships_keep_an_owner(),
  public.handle_new_user()
  from public, anon, authenticated;
grant execute on function
  public.is_member(uuid), public.is_owner(uuid), public.my_household_id(),
  public.create_household(text, text), public.household_names()
  to authenticated;
