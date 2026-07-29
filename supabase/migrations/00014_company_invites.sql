-- ============================================================
-- Company invites — dashboard users join an existing POS company
-- via invite link (no SQL). Floor staff PIN roster stays separate.
-- ============================================================

create table if not exists public.company_invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  email text not null,
  role public.user_role not null default 'manager'
    check (role in ('admin', 'manager', 'cashier')),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'expired', 'revoked')),
  token text not null unique default encode(gen_random_bytes(32), 'hex'),
  invited_by uuid references auth.users(id) on delete set null,
  accepted_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists company_invites_company_idx on public.company_invites(company_id);
create index if not exists company_invites_email_idx on public.company_invites(lower(email));
create index if not exists company_invites_token_idx on public.company_invites(token);
create index if not exists company_invites_status_idx on public.company_invites(status);

-- One pending invite per company+email
create unique index if not exists company_invites_pending_unique
  on public.company_invites (company_id, lower(email))
  where status = 'pending';

alter table public.company_invites enable row level security;

drop policy if exists "Admins can view company invites" on public.company_invites;
create policy "Admins can view company invites"
  on public.company_invites for select
  using (public.user_has_role(company_id, array['owner', 'admin']::public.user_role[]));

drop policy if exists "Admins can create company invites" on public.company_invites;
create policy "Admins can create company invites"
  on public.company_invites for insert
  with check (public.user_has_role(company_id, array['owner', 'admin']::public.user_role[]));

drop policy if exists "Admins can update company invites" on public.company_invites;
create policy "Admins can update company invites"
  on public.company_invites for update
  using (public.user_has_role(company_id, array['owner', 'admin']::public.user_role[]));

drop policy if exists "Users can view own company invites" on public.company_invites;
create policy "Users can view own company invites"
  on public.company_invites for select
  using (
    status = 'pending'
    and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

grant select, insert, update on public.company_invites to authenticated;

-- Accept invite by token → profiles membership
create or replace function public.accept_company_invite(p_token text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_invite record;
  v_display text;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select email into v_email from auth.users where id = v_uid;
  if v_email is null then
    raise exception 'User email not found' using errcode = '22023';
  end if;

  select * into v_invite
  from public.company_invites
  where token = p_token
    and status = 'pending'
    and expires_at > now()
  for update;

  if not found then
    raise exception 'Invite not found, expired, or already used' using errcode = 'P0002';
  end if;

  if lower(v_invite.email) <> lower(v_email) then
    raise exception 'This invite was sent to a different email address' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.profiles
    where user_id = v_uid and company_id = v_invite.company_id and is_active = true
  ) then
    update public.company_invites
    set status = 'accepted', accepted_by = v_uid, accepted_at = now()
    where id = v_invite.id;
    return json_build_object(
      'status', 'already_member',
      'company_id', v_invite.company_id
    );
  end if;

  v_display := split_part(v_email, '@', 1);

  insert into public.profiles (user_id, company_id, role, display_name, is_active)
  values (v_uid, v_invite.company_id, v_invite.role, v_display, true)
  on conflict (user_id, company_id) do update
    set role = excluded.role,
        is_active = true,
        display_name = coalesce(nullif(public.profiles.display_name, ''), excluded.display_name),
        updated_at = now();

  update public.company_invites
  set status = 'accepted', accepted_by = v_uid, accepted_at = now()
  where id = v_invite.id;

  return json_build_object(
    'status', 'accepted',
    'company_id', v_invite.company_id,
    'role', v_invite.role
  );
end;
$$;

revoke all on function public.accept_company_invite(text) from public;
grant execute on function public.accept_company_invite(text) to authenticated;

-- Peek invite (for accept page before/after login) — no PII beyond company name
create or replace function public.get_company_invite_preview(p_token text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite record;
  v_company_name text;
begin
  select i.*, c.name as company_name
  into v_invite
  from public.company_invites i
  join public.companies c on c.id = i.company_id
  where i.token = p_token;

  if not found then
    return json_build_object('status', 'not_found');
  end if;

  if v_invite.status <> 'pending' then
    return json_build_object('status', v_invite.status, 'company_name', v_invite.company_name);
  end if;

  if v_invite.expires_at <= now() then
    return json_build_object('status', 'expired', 'company_name', v_invite.company_name);
  end if;

  return json_build_object(
    'status', 'pending',
    'company_id', v_invite.company_id,
    'company_name', v_invite.company_name,
    'role', v_invite.role,
    'email', v_invite.email,
    'expires_at', v_invite.expires_at
  );
end;
$$;

revoke all on function public.get_company_invite_preview(text) from public;
grant execute on function public.get_company_invite_preview(text) to anon, authenticated;

-- Pending invites for current user email (onboarding gate)
create or replace function public.list_my_pending_company_invites()
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_rows json;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select email into v_email from auth.users where id = v_uid;

  select coalesce(json_agg(row_to_json(t) order by t.created_at desc), '[]'::json)
  into v_rows
  from (
    select
      i.id,
      i.token,
      i.role,
      i.email,
      i.expires_at,
      i.created_at,
      i.company_id,
      c.name as company_name
    from public.company_invites i
    join public.companies c on c.id = i.company_id
    where i.status = 'pending'
      and i.expires_at > now()
      and lower(i.email) = lower(v_email)
  ) t;

  return v_rows;
end;
$$;

revoke all on function public.list_my_pending_company_invites() from public;
grant execute on function public.list_my_pending_company_invites() to authenticated;
