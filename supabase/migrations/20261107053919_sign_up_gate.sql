-- Invite-only sign-up gate (D23). Supabase Auth calls hook_before_user_created
-- before it creates any user; rejecting there means no account and no email.

create table public.approved_emails (
  email text primary key,
  constraint approved_emails_email_normalized check (email = lower(trim(email)))
);

-- RLS on with no policies: clients see nothing. Admins use the SQL editor.
alter table public.approved_emails enable row level security;
revoke all on public.approved_emails from anon, authenticated;

-- For now only approved_emails allow sign-up; Task 3 adds pending invites.
create function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(event -> 'user' ->> 'email'));
begin
  if v_email is not null
     and v_email <> ''
     and exists (select 1 from public.approved_emails a where a.email = v_email)
  then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error',
    jsonb_build_object('http_code', 403, 'message', 'Signups not allowed')
  );
end;
$$;

grant usage on schema public to supabase_auth_admin;
revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
grant select on public.approved_emails to supabase_auth_admin;
