-- Deleting a household and deleting an account (D15, design section 5).

-- A household ends only this way: its sole member, who is an owner, deletes
-- it. Everything under it cascades (bills, entries, payments, categories,
-- invites, history, the membership). No history event is written: the
-- history goes with the household. A non-member gets the same error as
-- anyone else who is not the sole owner.
create function public.delete_household(p_household uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  -- Serialize with concurrent joins/leaves so the checks below see the truth.
  perform 1 from public.households where id = p_household for update;
  if auth.uid() is null
     or not exists (
       select 1 from public.memberships m
       where m.household_id = p_household
         and m.profile_id = auth.uid()
         and m.role = 'owner'
     )
     or exists (
       select 1 from public.memberships m
       where m.household_id = p_household
         and m.profile_id <> auth.uid()
     )
  then
    raise exception 'not_sole_owner';
  end if;
  delete from public.households where id = p_household;
end;
$$;

-- Why the caller can't delete their account right now: null (nothing in the
-- way), 'sole_member' (delete the household first) or 'last_owner' (hand
-- ownership to someone first).
create function public.account_deletion_blocker()
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_household uuid;
  v_role text;
begin
  select m.household_id, m.role into v_household, v_role
  from public.memberships m
  where m.profile_id = auth.uid();
  if v_household is null then
    return null;
  end if;
  if not exists (
    select 1 from public.memberships m
    where m.household_id = v_household and m.profile_id <> auth.uid()
  ) then
    return 'sole_member';
  end if;
  if v_role = 'owner' and not exists (
    select 1 from public.memberships m
    where m.household_id = v_household and m.profile_id <> auth.uid() and m.role = 'owner'
  ) then
    return 'last_owner';
  end if;
  return null;
end;
$$;

-- When an account is deleted, its email leaves invites and history (D15).
-- Invites to that address are removed; the email is stripped from history
-- details (the rows stay). Runs in the same transaction as the delete.
create function public.on_auth_user_deleted()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := lower(trim(old.email));
begin
  if v_email is null or v_email = '' then
    return null;
  end if;
  delete from public.invites i where lower(trim(i.email)) = v_email;
  update public.history h
  set detail = h.detail - 'email'
  where h.kind in ('invite_sent', 'invite_cancelled')
    and lower(trim(h.detail ->> 'email')) = v_email;
  return null;
end;
$$;

create trigger on_auth_user_deleted
  after delete on auth.users
  for each row execute function public.on_auth_user_deleted();

revoke execute on function
  public.delete_household(uuid), public.account_deletion_blocker(),
  public.on_auth_user_deleted()
  from public, anon, authenticated;
grant execute on function
  public.delete_household(uuid), public.account_deletion_blocker()
  to authenticated;

-- Same trigger function as in the households migration, plus a row lock on the
-- household before counting (FOR NO KEY UPDATE: serializes against other runs and
-- delete_household's FOR UPDATE, but not against the KEY SHARE that history rows'
-- foreign key holds, which would deadlock), so two concurrent role changes or removals can't
-- each see the other's owner still in place (write skew). Same error keys; still
-- skips when the household is gone. The lock closes write skew under READ
-- COMMITTED (the app's isolation level); REPEATABLE READ would reopen it.
create or replace function public.memberships_keep_an_owner()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform 1 from public.households h where h.id = old.household_id for no key update;
  if not found then
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
