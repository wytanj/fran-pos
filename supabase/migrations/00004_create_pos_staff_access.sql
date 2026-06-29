-- ============================================================
-- POS staff access, passcodes, and source-neutral roster sync
-- ============================================================

create extension if not exists pgcrypto;

create table public.pos_identity_sources (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  provider text not null,
  external_account_id text,
  display_name text not null,
  status text not null default 'disconnected',
  config jsonb not null default '{}'::jsonb,
  last_sync_at timestamptz,
  sync_cursor text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, provider, external_account_id)
);

create index pos_identity_sources_company_idx on public.pos_identity_sources(company_id);

create table public.pos_staff_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  source_id uuid references public.pos_identity_sources(id) on delete set null,
  source_provider text not null default 'manual',
  external_subject_id text,
  external_user_id text,
  display_name text not null,
  email text,
  phone text,
  role public.user_role not null default 'cashier',
  employment_status text not null default 'active',
  employment_type text,
  is_eor boolean not null default false,
  eor_provider text,
  pos_access_enabled boolean not null default true,
  synced_at timestamptz,
  source_updated_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, source_provider, external_subject_id)
);

create index pos_staff_members_company_idx on public.pos_staff_members(company_id);
create index pos_staff_members_source_idx on public.pos_staff_members(company_id, source_provider);
create index pos_staff_members_external_idx on public.pos_staff_members(source_provider, external_subject_id)
  where external_subject_id is not null;

create table public.pos_staff_passcodes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  staff_member_id uuid not null references public.pos_staff_members(id) on delete cascade,
  passcode_hash text not null,
  valid_from timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  last_used_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index pos_staff_passcodes_active_idx
  on public.pos_staff_passcodes(staff_member_id)
  where revoked_at is null;

create index pos_staff_passcodes_company_idx on public.pos_staff_passcodes(company_id);

create table public.pos_staff_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  staff_member_id uuid not null references public.pos_staff_members(id) on delete restrict,
  register_id text,
  device_id text,
  auth_method text not null default 'passcode',
  staff_snapshot jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at timestamptz
);

create index pos_staff_sessions_company_idx on public.pos_staff_sessions(company_id, started_at desc);
create index pos_staff_sessions_staff_idx on public.pos_staff_sessions(staff_member_id, started_at desc);

create table public.pos_authorizations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  session_id uuid references public.pos_staff_sessions(id) on delete set null,
  requested_by_staff_member_id uuid references public.pos_staff_members(id) on delete set null,
  authorized_by_staff_member_id uuid references public.pos_staff_members(id) on delete set null,
  provider text not null default 'staff_passcode',
  action text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  authorized_at timestamptz not null default now()
);

create index pos_authorizations_company_idx on public.pos_authorizations(company_id, authorized_at desc);
create index pos_authorizations_session_idx on public.pos_authorizations(session_id);

-- ============================================================
-- RLS
-- ============================================================

alter table public.pos_identity_sources enable row level security;
alter table public.pos_staff_members enable row level security;
alter table public.pos_staff_passcodes enable row level security;
alter table public.pos_staff_sessions enable row level security;
alter table public.pos_authorizations enable row level security;

create policy "Users can view POS identity sources in their company"
  on public.pos_identity_sources for select
  using (company_id in (select public.get_user_company_ids()));

create policy "Admins+ can manage POS identity sources"
  on public.pos_identity_sources for all
  using (public.user_has_role(company_id, array['owner', 'admin']::public.user_role[]))
  with check (public.user_has_role(company_id, array['owner', 'admin']::public.user_role[]));

create policy "Users can view POS staff in their company"
  on public.pos_staff_members for select
  using (company_id in (select public.get_user_company_ids()));

create policy "Admins+ can manage POS staff"
  on public.pos_staff_members for all
  using (public.user_has_role(company_id, array['owner', 'admin']::public.user_role[]))
  with check (public.user_has_role(company_id, array['owner', 'admin']::public.user_role[]));

create policy "Admins+ can view POS staff passcode state"
  on public.pos_staff_passcodes for select
  using (public.user_has_role(company_id, array['owner', 'admin']::public.user_role[]));

create policy "Users can view POS sessions in their company"
  on public.pos_staff_sessions for select
  using (company_id in (select public.get_user_company_ids()));

create policy "Users can view POS authorizations in their company"
  on public.pos_authorizations for select
  using (company_id in (select public.get_user_company_ids()));

-- ============================================================
-- Staff access RPCs
-- ============================================================

create or replace function public.pos_passcode_is_valid(p_passcode text)
returns boolean
language sql
immutable
as $$
  select p_passcode ~ '^[0-9]{4,12}$';
$$;

create or replace function public.create_pos_staff_member(
  p_company_id uuid,
  p_display_name text,
  p_role public.user_role default 'cashier',
  p_passcode text default null,
  p_source_provider text default 'manual',
  p_external_subject_id text default null,
  p_employment_status text default 'active',
  p_employment_type text default null,
  p_is_eor boolean default false,
  p_eor_provider text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  new_staff_id uuid;
begin
  if not public.user_has_role(p_company_id, array['owner', 'admin']::public.user_role[]) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if nullif(trim(p_display_name), '') is null then
    raise exception 'display name is required' using errcode = '22023';
  end if;

  if p_passcode is not null and not public.pos_passcode_is_valid(p_passcode) then
    raise exception 'passcode must be 4 to 12 digits' using errcode = '22023';
  end if;

  insert into public.pos_staff_members (
    company_id,
    source_provider,
    external_subject_id,
    display_name,
    role,
    employment_status,
    employment_type,
    is_eor,
    eor_provider,
    synced_at
  )
  values (
    p_company_id,
    coalesce(nullif(trim(p_source_provider), ''), 'manual'),
    nullif(trim(p_external_subject_id), ''),
    trim(p_display_name),
    p_role,
    coalesce(nullif(trim(p_employment_status), ''), 'active'),
    nullif(trim(p_employment_type), ''),
    coalesce(p_is_eor, false),
    nullif(trim(p_eor_provider), ''),
    case when coalesce(nullif(trim(p_source_provider), ''), 'manual') = 'manual' then null else now() end
  )
  returning id into new_staff_id;

  if p_passcode is not null then
    insert into public.pos_staff_passcodes (company_id, staff_member_id, passcode_hash, created_by)
    values (p_company_id, new_staff_id, crypt(p_passcode, gen_salt('bf')), auth.uid());
  end if;

  return new_staff_id;
end;
$$;

create or replace function public.set_pos_staff_passcode(
  p_staff_member_id uuid,
  p_passcode text,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  staff_company_id uuid;
  new_passcode_id uuid;
begin
  if not public.pos_passcode_is_valid(p_passcode) then
    raise exception 'passcode must be 4 to 12 digits' using errcode = '22023';
  end if;

  select company_id into staff_company_id
  from public.pos_staff_members
  where id = p_staff_member_id;

  if staff_company_id is null then
    raise exception 'staff member not found' using errcode = '22023';
  end if;

  if not public.user_has_role(staff_company_id, array['owner', 'admin']::public.user_role[]) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update public.pos_staff_passcodes
    set revoked_at = now()
  where staff_member_id = p_staff_member_id
    and revoked_at is null;

  insert into public.pos_staff_passcodes (company_id, staff_member_id, passcode_hash, expires_at, created_by)
  values (staff_company_id, p_staff_member_id, crypt(p_passcode, gen_salt('bf')), p_expires_at, auth.uid())
  returning id into new_passcode_id;

  return new_passcode_id;
end;
$$;

create or replace function public.upsert_pos_staff_from_source(
  p_company_id uuid,
  p_source_provider text,
  p_external_subject_id text,
  p_display_name text,
  p_external_user_id text default null,
  p_email text default null,
  p_phone text default null,
  p_role public.user_role default 'cashier',
  p_employment_status text default 'active',
  p_employment_type text default null,
  p_is_eor boolean default false,
  p_eor_provider text default null,
  p_source_updated_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  upserted_staff_id uuid;
begin
  if not public.user_has_role(p_company_id, array['owner', 'admin']::public.user_role[]) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if nullif(trim(p_source_provider), '') is null or nullif(trim(p_external_subject_id), '') is null then
    raise exception 'source provider and external subject id are required' using errcode = '22023';
  end if;

  insert into public.pos_staff_members (
    company_id,
    source_provider,
    external_subject_id,
    external_user_id,
    display_name,
    email,
    phone,
    role,
    employment_status,
    employment_type,
    is_eor,
    eor_provider,
    synced_at,
    source_updated_at,
    metadata,
    pos_access_enabled
  )
  values (
    p_company_id,
    trim(p_source_provider),
    trim(p_external_subject_id),
    nullif(trim(p_external_user_id), ''),
    trim(p_display_name),
    nullif(trim(p_email), ''),
    nullif(trim(p_phone), ''),
    p_role,
    coalesce(nullif(trim(p_employment_status), ''), 'active'),
    nullif(trim(p_employment_type), ''),
    coalesce(p_is_eor, false),
    nullif(trim(p_eor_provider), ''),
    now(),
    p_source_updated_at,
    coalesce(p_metadata, '{}'::jsonb),
    lower(coalesce(nullif(trim(p_employment_status), ''), 'active')) not in ('terminated', 'inactive')
  )
  on conflict (company_id, source_provider, external_subject_id)
  do update set
    external_user_id = excluded.external_user_id,
    display_name = excluded.display_name,
    email = excluded.email,
    phone = excluded.phone,
    role = excluded.role,
    employment_status = excluded.employment_status,
    employment_type = excluded.employment_type,
    is_eor = excluded.is_eor,
    eor_provider = excluded.eor_provider,
    synced_at = excluded.synced_at,
    source_updated_at = excluded.source_updated_at,
    metadata = excluded.metadata,
    pos_access_enabled = case
      when lower(excluded.employment_status) in ('terminated', 'inactive') then false
      else public.pos_staff_members.pos_access_enabled
    end,
    updated_at = now()
  returning id into upserted_staff_id;

  return upserted_staff_id;
end;
$$;

create or replace function public.start_pos_staff_session(
  p_company_id uuid,
  p_staff_member_id uuid,
  p_passcode text,
  p_register_id text default null,
  p_device_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  staff_row public.pos_staff_members%rowtype;
  passcode_row public.pos_staff_passcodes%rowtype;
  new_session_id uuid;
  snapshot jsonb;
begin
  if p_company_id not in (select public.get_user_company_ids()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if not public.pos_passcode_is_valid(p_passcode) then
    raise exception 'invalid passcode' using errcode = '28000';
  end if;

  select * into staff_row
  from public.pos_staff_members
  where id = p_staff_member_id
    and company_id = p_company_id
    and pos_access_enabled = true
    and lower(employment_status) not in ('terminated', 'inactive');

  if staff_row.id is null then
    raise exception 'staff member cannot access POS' using errcode = '42501';
  end if;

  select * into passcode_row
  from public.pos_staff_passcodes
  where staff_member_id = p_staff_member_id
    and company_id = p_company_id
    and revoked_at is null
    and valid_from <= now()
    and (expires_at is null or expires_at > now())
  limit 1;

  if passcode_row.id is null then
    raise exception 'passcode is not configured' using errcode = '28000';
  end if;

  if passcode_row.locked_until is not null and passcode_row.locked_until > now() then
    raise exception 'passcode is temporarily locked' using errcode = '28000';
  end if;

  if passcode_row.passcode_hash <> crypt(p_passcode, passcode_row.passcode_hash) then
    update public.pos_staff_passcodes
      set failed_attempts = failed_attempts + 1,
          locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else locked_until end
    where id = passcode_row.id;
    raise exception 'invalid passcode' using errcode = '28000';
  end if;

  update public.pos_staff_passcodes
    set failed_attempts = 0,
        locked_until = null,
        last_used_at = now()
  where id = passcode_row.id;

  snapshot := jsonb_build_object(
    'id', staff_row.id,
    'display_name', staff_row.display_name,
    'role', staff_row.role,
    'source_provider', staff_row.source_provider,
    'external_subject_id', staff_row.external_subject_id,
    'employment_status', staff_row.employment_status,
    'employment_type', staff_row.employment_type,
    'is_eor', staff_row.is_eor,
    'eor_provider', staff_row.eor_provider
  );

  insert into public.pos_staff_sessions (
    company_id,
    staff_member_id,
    register_id,
    device_id,
    staff_snapshot
  )
  values (
    p_company_id,
    p_staff_member_id,
    nullif(trim(p_register_id), ''),
    nullif(trim(p_device_id), ''),
    snapshot
  )
  returning id into new_session_id;

  return jsonb_build_object(
    'session', jsonb_build_object('id', new_session_id, 'started_at', now()),
    'staff', snapshot
  );
end;
$$;

create or replace function public.authorize_pos_action(
  p_company_id uuid,
  p_session_id uuid,
  p_passcode text,
  p_action text,
  p_reason text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  requester_id uuid;
  approver record;
  authorization_id uuid;
begin
  if p_company_id not in (select public.get_user_company_ids()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if nullif(trim(p_action), '') is null then
    raise exception 'action is required' using errcode = '22023';
  end if;

  if not public.pos_passcode_is_valid(p_passcode) then
    raise exception 'invalid passcode' using errcode = '28000';
  end if;

  select staff_member_id into requester_id
  from public.pos_staff_sessions
  where id = p_session_id
    and company_id = p_company_id
    and ended_at is null;

  for approver in
    select s.id, s.display_name, s.role, p.id as passcode_id, p.passcode_hash, p.locked_until
    from public.pos_staff_members s
    join public.pos_staff_passcodes p on p.staff_member_id = s.id
    where s.company_id = p_company_id
      and s.role = any(array['owner', 'admin', 'manager']::public.user_role[])
      and s.pos_access_enabled = true
      and lower(s.employment_status) not in ('terminated', 'inactive')
      and p.revoked_at is null
      and p.valid_from <= now()
      and (p.expires_at is null or p.expires_at > now())
  loop
    if (approver.locked_until is null or approver.locked_until <= now())
      and approver.passcode_hash = crypt(p_passcode, approver.passcode_hash) then

      update public.pos_staff_passcodes
        set failed_attempts = 0,
            locked_until = null,
            last_used_at = now()
      where id = approver.passcode_id;

      insert into public.pos_authorizations (
        company_id,
        session_id,
        requested_by_staff_member_id,
        authorized_by_staff_member_id,
        action,
        reason,
        metadata
      )
      values (
        p_company_id,
        p_session_id,
        requester_id,
        approver.id,
        trim(p_action),
        nullif(trim(p_reason), ''),
        coalesce(p_metadata, '{}'::jsonb)
      )
      returning id into authorization_id;

      return jsonb_build_object(
        'authorization', jsonb_build_object('id', authorization_id, 'authorized_at', now()),
        'approver', jsonb_build_object('id', approver.id, 'display_name', approver.display_name, 'role', approver.role)
      );
    end if;
  end loop;

  update public.pos_staff_passcodes p
    set failed_attempts = p.failed_attempts + 1,
        locked_until = case when p.failed_attempts + 1 >= 5 then now() + interval '15 minutes' else p.locked_until end
  from public.pos_staff_members s
  where p.staff_member_id = s.id
    and s.company_id = p_company_id
    and s.role = any(array['owner', 'admin', 'manager']::public.user_role[])
    and p.revoked_at is null;

  raise exception 'invalid manager passcode' using errcode = '28000';
end;
$$;

revoke all on function public.create_pos_staff_member(uuid, text, public.user_role, text, text, text, text, text, boolean, text) from public;
revoke all on function public.set_pos_staff_passcode(uuid, text, timestamptz) from public;
revoke all on function public.upsert_pos_staff_from_source(uuid, text, text, text, text, text, text, public.user_role, text, text, boolean, text, timestamptz, jsonb) from public;
revoke all on function public.start_pos_staff_session(uuid, uuid, text, text, text) from public;
revoke all on function public.authorize_pos_action(uuid, uuid, text, text, text, jsonb) from public;

grant execute on function public.create_pos_staff_member(uuid, text, public.user_role, text, text, text, text, text, boolean, text) to authenticated;
grant execute on function public.set_pos_staff_passcode(uuid, text, timestamptz) to authenticated;
grant execute on function public.upsert_pos_staff_from_source(uuid, text, text, text, text, text, text, public.user_role, text, text, boolean, text, timestamptz, jsonb) to authenticated;
grant execute on function public.start_pos_staff_session(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.authorize_pos_action(uuid, uuid, text, text, text, jsonb) to authenticated;
