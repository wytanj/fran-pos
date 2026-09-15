-- POS register bind (auth P0). One-time store+pair → durable device_token.
-- No Google. Separate from Screen B customer-display pair (00015).

create table if not exists public.pos_register_devices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  store_code text not null,
  register_id text not null default 'REG-01',
  pair_code text not null,
  device_token text not null unique,
  label text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create unique index if not exists pos_register_devices_pair_active_uidx
  on public.pos_register_devices (store_code, pair_code)
  where revoked_at is null;

create index if not exists pos_register_devices_company_idx
  on public.pos_register_devices (company_id);

alter table public.pos_register_devices enable row level security;

revoke all on table public.pos_register_devices from public;
revoke all on table public.pos_register_devices from anon;

-- Ops / company members can mint pair rows (dashboard). Devices pair via RPC.
drop policy if exists "Company members manage register devices" on public.pos_register_devices;
create policy "Company members manage register devices"
  on public.pos_register_devices for all
  using (company_id is null or company_id in (select public.get_user_company_ids()))
  with check (company_id is null or company_id in (select public.get_user_company_ids()));

grant select, insert, update, delete on table public.pos_register_devices to authenticated, service_role;

-- Pair: anon/device presents store_code + pair_code → device_token
create or replace function public.pair_pos_register_device(
  p_store_code text,
  p_pair_code text,
  p_register_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.pos_register_devices%rowtype;
  token text;
begin
  if p_store_code is null or length(trim(p_store_code)) < 2 then
    raise exception 'store_code required';
  end if;
  if p_pair_code is null or length(trim(p_pair_code)) < 4 then
    raise exception 'pair_code required';
  end if;

  select * into rec
  from public.pos_register_devices
  where upper(store_code) = upper(trim(p_store_code))
    and upper(pair_code) = upper(trim(p_pair_code))
    and revoked_at is null
  limit 1;

  if not found then
    raise exception 'Invalid store or pair code';
  end if;

  if p_register_id is not null and length(trim(p_register_id)) > 0 then
    update public.pos_register_devices
      set register_id = trim(p_register_id), last_seen_at = now()
      where id = rec.id
      returning * into rec;
  else
    update public.pos_register_devices
      set last_seen_at = now()
      where id = rec.id
      returning * into rec;
  end if;

  return jsonb_build_object(
    'device_token', rec.device_token,
    'store_code', rec.store_code,
    'register_id', rec.register_id,
    'company_id', rec.company_id,
    'label', rec.label
  );
end;
$$;

create or replace function public.get_pos_register_device(p_device_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.pos_register_devices%rowtype;
begin
  if p_device_token is null or length(trim(p_device_token)) < 8 then
    raise exception 'device_token required';
  end if;
  select * into rec
  from public.pos_register_devices
  where device_token = trim(p_device_token) and revoked_at is null
  limit 1;
  if not found then
    raise exception 'Unknown or revoked device';
  end if;
  update public.pos_register_devices set last_seen_at = now() where id = rec.id;
  return jsonb_build_object(
    'device_token', rec.device_token,
    'store_code', rec.store_code,
    'register_id', rec.register_id,
    'company_id', rec.company_id,
    'label', rec.label
  );
end;
$$;

-- Mint a pending pair row (authenticated ops). Returns pair_code + device_token.
create or replace function public.create_pos_register_pair(
  p_company_id uuid,
  p_store_code text,
  p_register_id text default 'REG-01',
  p_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pair text;
  token text;
  rec public.pos_register_devices%rowtype;
begin
  if p_company_id is null or p_company_id not in (select public.get_user_company_ids()) then
    raise exception 'Not allowed for this company';
  end if;
  pair := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  token := encode(gen_random_bytes(24), 'hex');
  insert into public.pos_register_devices (company_id, store_code, register_id, pair_code, device_token, label)
  values (p_company_id, upper(trim(p_store_code)), coalesce(nullif(trim(p_register_id), ''), 'REG-01'), pair, token, p_label)
  returning * into rec;
  return jsonb_build_object(
    'id', rec.id,
    'store_code', rec.store_code,
    'register_id', rec.register_id,
    'pair_code', rec.pair_code,
    'device_token', rec.device_token,
    'label', rec.label
  );
end;
$$;

revoke all on function public.pair_pos_register_device(text, text, text) from public;
revoke all on function public.get_pos_register_device(text) from public;
revoke all on function public.create_pos_register_pair(uuid, text, text, text) from public;

grant execute on function public.pair_pos_register_device(text, text, text) to anon, authenticated, service_role;
grant execute on function public.get_pos_register_device(text) to anon, authenticated, service_role;
grant execute on function public.create_pos_register_pair(uuid, text, text, text) to authenticated, service_role;
