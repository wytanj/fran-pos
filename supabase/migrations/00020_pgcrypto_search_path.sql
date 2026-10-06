-- Supabase installs pgcrypto in the extensions schema.
-- A function that sets search_path = public cannot resolve unqualified gen_random_bytes.

create schema if not exists extensions;

create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if exists (
    select 1
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pgcrypto'
      and n.nspname <> 'extensions'
  ) then
    execute 'alter extension pgcrypto set schema extensions';
  end if;
end
$$;

create or replace function public.create_pos_register_pair(
  p_company_id uuid,
  p_store_code text,
  p_register_id text default 'REG-01',
  p_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
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
  token := encode(extensions.gen_random_bytes(24), 'hex');
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

create or replace function public.join_mirror_station(p_pair_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  code text := upper(regexp_replace(coalesce(p_pair_code, ''), '[^A-Za-z0-9]', '', 'g'));
  station public.pos_mirror_stations%rowtype;
  reg public.pos_register_devices%rowtype;
begin
  select * into station
  from public.pos_mirror_stations
  where pair_code = code and pair_expires_at > now()
  for update;

  if not found or code = '' then
    raise exception 'Pair code is invalid or expired';
  end if;

  update public.pos_mirror_stations
    set display_token = encode(extensions.gen_random_bytes(24), 'hex'),
        pair_code = null,
        pair_expires_at = null,
        display_paired_at = now(),
        display_seen_at = now()
    where id = station.id
    returning * into station;

  select * into reg from public.pos_register_devices where id = station.register_device_id;

  return jsonb_build_object(
    'station_id', station.id,
    'display_token', station.display_token,
    'store_code', reg.store_code,
    'register_id', reg.register_id,
    'snapshot', station.snapshot,
    'snapshot_seq', station.snapshot_seq
  );
end;
$$;

-- Column default also resolves under the session search_path; qualify it.
alter table public.company_invites
  alter column token set default encode(extensions.gen_random_bytes(32), 'hex');

revoke all on function public.create_pos_register_pair(uuid, text, text, text) from public;
revoke all on function public.join_mirror_station(text) from public;

grant execute on function public.create_pos_register_pair(uuid, text, text, text) to authenticated, service_role;
grant execute on function public.join_mirror_station(text) to anon, authenticated, service_role;
