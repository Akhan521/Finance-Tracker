-- Invites, joining, and the sign-up gate's second door (D23). Owners invite by
-- email; the invited person signs in with an emailed code, then accepts.

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  email text not null,
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  cancelled_at timestamptz,
  constraint invites_email_normalized check (email = lower(trim(email))),
  constraint invites_email_shape check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint invites_email_len check (char_length(email) <= 254)
);

-- One live invite per household and address.
create unique index invites_one_pending
  on public.invites (household_id, email)
  where accepted_at is null and cancelled_at is null;
create index invites_email_idx on public.invites (email);

alter table public.invites enable row level security;

-- ------------------------------------------------------------- triggers

create function public.invites_before_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- BEFORE triggers run ahead of RLS WITH CHECK; refuse non-owners first so
  -- they learn nothing (duplicates, counts) and trigger no cleanup.
  if not public.is_owner(new.household_id) then
    raise exception 'new row violates row-level security policy for table "invites"'
      using errcode = '42501';
  end if;

  new.email := lower(trim(new.email));
  new.invited_by := auth.uid();
  -- Server-controlled columns always start from their defaults.
  new.created_at := now();
  new.expires_at := now() + interval '7 days';
  new.accepted_at := null;
  new.cancelled_at := null;

  -- Serialize invites per household so the cap and duplicate checks can't race.
  perform pg_advisory_xact_lock(hashtextextended(new.household_id::text, 0));

  -- An expired pending invite for the same address is retired.
  update public.invites i
     set cancelled_at = now()
   where i.household_id = new.household_id
     and i.email = new.email
     and i.accepted_at is null
     and i.cancelled_at is null
     and i.expires_at <= now();

  if exists (
    select 1 from public.invites i
    where i.household_id = new.household_id
      and i.email = new.email
      and i.accepted_at is null
      and i.cancelled_at is null
  ) then
    raise exception 'already_invited';
  end if;

  -- Counts invites created, cancelled or not, so cancel-and-reinvite can't
  -- get around it.
  if (select count(*) from public.invites i
      where i.household_id = new.household_id
        and i.created_at > now() - interval '24 hours') >= 20 then
    raise exception 'too_many_invites';
  end if;

  return new;
end;
$$;

create trigger invites_before_insert
  before insert on public.invites
  for each row execute function public.invites_before_insert();

-- cancelled_at may only go from null to a time, on a pending invite.
create function public.invites_before_update()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.cancelled_at is distinct from old.cancelled_at then
    if old.cancelled_at is not null
       or old.accepted_at is not null
       or new.cancelled_at is null then
      raise exception 'invite_not_pending';
    end if;
    new.cancelled_at := now();
  end if;
  return new;
end;
$$;

create trigger invites_before_update
  before update on public.invites
  for each row execute function public.invites_before_update();

-- ------------------------------------------------------------- functions

create function public.my_invites()
returns table (id uuid, household_name text, invited_by_name text, expires_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select i.id, h.name, p.display_name, i.expires_at
  from public.invites i
  join public.households h on h.id = i.household_id
  left join public.profiles p on p.id = i.invited_by
  where i.accepted_at is null
    and i.cancelled_at is null
    and i.expires_at > now()
    and i.email = (
      select lower(trim(u.email)) from auth.users u
      where u.id = auth.uid() and u.email_confirmed_at is not null
    )
  order by i.created_at;
$$;

create function public.accept_invite(p_invite uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_confirmed timestamptz;
  v_household uuid;
begin
  if v_uid is null then
    raise exception 'not_signed_in';
  end if;

  -- The address comes from the account row, never from token claims.
  select lower(trim(u.email)), u.email_confirmed_at
    into v_email, v_confirmed
  from auth.users u where u.id = v_uid;

  if v_confirmed is null then
    raise exception 'email_not_confirmed';
  end if;

  select i.household_id into v_household
  from public.invites i
  where i.id = p_invite
    and i.accepted_at is null
    and i.cancelled_at is null
    and i.expires_at > now()
    and i.email = v_email
  for update;

  if v_household is null then
    raise exception 'invite_not_found';
  end if;

  if exists (select 1 from public.memberships m where m.profile_id = v_uid) then
    raise exception 'already_in_household';
  end if;

  insert into public.memberships (household_id, profile_id, role)
  values (v_household, v_uid, 'member');

  update public.invites set accepted_at = now() where id = p_invite;

  return v_household;
exception
  when unique_violation then
    raise exception 'already_in_household';
end;
$$;

-- The sign-up gate: approved emails, or a pending unexpired invite.
create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(event -> 'user' ->> 'email'));
begin
  if v_email is not null and v_email <> '' and (
    exists (select 1 from public.approved_emails a where a.email = v_email)
    or exists (
      select 1 from public.invites i
      where i.email = v_email
        and i.accepted_at is null
        and i.cancelled_at is null
        and i.expires_at > now()
    )
  ) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error',
    jsonb_build_object('http_code', 403, 'message', 'Signups not allowed')
  );
end;
$$;

-- -------------------------------------------------------------- policies

create policy invites_select on public.invites for select to authenticated
  using (public.is_owner(household_id));
create policy invites_insert on public.invites for insert to authenticated
  with check (public.is_owner(household_id));
create policy invites_update on public.invites for update to authenticated
  using (public.is_owner(household_id))
  with check (public.is_owner(household_id));

-- ---------------------------------------------------------------- grants

revoke all on public.invites from anon, authenticated;
grant select on public.invites to authenticated;
grant insert (household_id, email) on public.invites to authenticated;
grant update (cancelled_at) on public.invites to authenticated;
grant select on public.invites to supabase_auth_admin;

revoke execute on function
  public.invites_before_insert(), public.invites_before_update(),
  public.my_invites(), public.accept_invite(uuid),
  public.hook_before_user_created(jsonb)
  from public, anon, authenticated;
grant execute on function public.my_invites(), public.accept_invite(uuid) to authenticated;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;

-- ------------------------------------------------------- D33: no passwords

-- D33: sign-in is code-only (D18); blank any password so a password set by
-- anyone (e.g. an attacker's sign-up for an invited email, or a
-- dashboard-created account) can never be used.
create function public.auth_users_blank_password()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.encrypted_password is not null and new.encrypted_password <> '' then
    new.encrypted_password := '';
  end if;
  return new;
end;
$$;

revoke execute on function public.auth_users_blank_password() from public, anon, authenticated;

create trigger auth_users_blank_password
  before insert or update on auth.users
  for each row execute function public.auth_users_blank_password();

-- Existing accounts. Idempotent.
update auth.users set encrypted_password = ''
where encrypted_password is not null and encrypted_password <> '';
