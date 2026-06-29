-- Harden database helper functions and keep migration bookkeeping private.

create or replace function public.get_user_company_ids()
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select company_id from public.profiles
  where user_id = auth.uid() and is_active = true;
$$;

create or replace function public.user_has_role(p_company_id uuid, p_roles public.user_role[])
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid()
      and company_id = p_company_id
      and role = any(p_roles)
      and is_active = true
  );
$$;

revoke all on table public.pos_migrations from anon, authenticated;
alter table public.pos_migrations enable row level security;
