-- Mirror POS: one customer-display station per cashier register (docs/mirror-pos.md).
-- Supersedes the unmerged 00015_customer_display_lanes draft. The display polls
-- read_mirror_snapshot; Realtime is deliberately not used in this slice.

create table if not exists public.pos_mirror_stations (
  id uuid primary key default gen_random_uuid(),
  register_device_id uuid not null unique references public.pos_register_devices(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  pair_code text,
  pair_expires_at timestamptz,
  display_token text unique,
  display_paired_at timestamptz,
  display_seen_at timestamptz,
  snapshot jsonb not null default '{}'::jsonb,
  snapshot_seq bigint not null default 0,
  snapshot_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists pos_mirror_stations_pair_code_uidx
  on public.pos_mirror_stations (pair_code)
  where pair_code is not null;

create index if not exists pos_mirror_stations_company_idx
  on public.pos_mirror_stations (company_id);

alter table public.pos_mirror_stations enable row level security;

revoke all on table public.pos_mirror_stations from public;
revoke all on table public.pos_mirror_stations from anon;

drop policy if exists "Company members view mirror stations" on public.pos_mirror_stations;
create policy "Company members view mirror stations"
  on public.pos_mirror_stations for select
  using (company_id in (select public.get_user_company_ids()));

grant select on table public.pos_mirror_stations to authenticated;
grant select, insert, update, delete on table public.pos_mirror_stations to service_role;

create or replace function public.pos_mirror_station_for_register(p_register_token text)
returns public.pos_mirror_stations
language plpgsql
security definer
set search_path = public
as $$
declare
  reg public.pos_register_devices%rowtype;
  station public.pos_mirror_stations%rowtype;
begin
  select * into reg
  from public.pos_register_devices
  where device_token = trim(coalesce(p_register_token, '')) and revoked_at is null
  limit 1;

  if not found then
    raise exception 'Unknown or revoked register';
  end if;

  insert into public.pos_mirror_stations (register_device_id, company_id)
  values (reg.id, reg.company_id)
  on conflict (register_device_id) do update set company_id = excluded.company_id
  returning * into station;

  return station;
end;
$$;

revoke all on function public.pos_mirror_station_for_register(text) from public;

create or replace function public.open_mirror_pair(p_register_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  station public.pos_mirror_stations%rowtype;
  code text;
  attempt int := 0;
begin
  station := public.pos_mirror_station_for_register(p_register_token);

  loop
    attempt := attempt + 1;
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    begin
      update public.pos_mirror_stations
        set pair_code = code, pair_expires_at = now() + interval '10 minutes'
        where id = station.id
        returning * into station;
      exit;
    exception when unique_violation then
      if attempt >= 8 then raise; end if;
    end;
  end loop;

  return jsonb_build_object(
    'station_id', station.id,
    'pair_code', station.pair_code,
    'pair_expires_at', station.pair_expires_at,
    'display_paired_at', station.display_paired_at,
    'display_seen_at', station.display_seen_at
  );
end;
$$;

create or replace function public.join_mirror_station(p_pair_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
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
    set display_token = encode(gen_random_bytes(24), 'hex'),
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

create or replace function public.publish_mirror_snapshot(
  p_register_token text,
  p_seq bigint,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  station public.pos_mirror_stations%rowtype;
begin
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'Snapshot must be a JSON object';
  end if;
  if pg_column_size(p_snapshot) > 65536 then
    raise exception 'Snapshot too large';
  end if;

  station := public.pos_mirror_station_for_register(p_register_token);

  update public.pos_mirror_stations
    set snapshot = p_snapshot, snapshot_seq = p_seq, snapshot_at = now()
    where id = station.id and p_seq > snapshot_seq;

  select * into station from public.pos_mirror_stations where id = station.id;

  return jsonb_build_object(
    'station_id', station.id,
    'snapshot_seq', station.snapshot_seq,
    'display_paired_at', station.display_paired_at,
    'display_seen_at', station.display_seen_at
  );
end;
$$;

create or replace function public.read_mirror_snapshot(
  p_display_token text,
  p_after_seq bigint default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  station public.pos_mirror_stations%rowtype;
begin
  update public.pos_mirror_stations
    set display_seen_at = now()
    where display_token = trim(coalesce(p_display_token, ''))
    returning * into station;

  if not found then
    raise exception 'Display is not paired';
  end if;

  return jsonb_build_object(
    'station_id', station.id,
    'snapshot_seq', station.snapshot_seq,
    'snapshot', case when station.snapshot_seq > coalesce(p_after_seq, 0) then station.snapshot else null end
  );
end;
$$;

revoke all on function public.open_mirror_pair(text) from public;
revoke all on function public.join_mirror_station(text) from public;
revoke all on function public.publish_mirror_snapshot(text, bigint, jsonb) from public;
revoke all on function public.read_mirror_snapshot(text, bigint) from public;

grant execute on function public.open_mirror_pair(text) to anon, authenticated, service_role;
grant execute on function public.join_mirror_station(text) to anon, authenticated, service_role;
grant execute on function public.publish_mirror_snapshot(text, bigint, jsonb) to anon, authenticated, service_role;
grant execute on function public.read_mirror_snapshot(text, bigint) to anon, authenticated, service_role;
