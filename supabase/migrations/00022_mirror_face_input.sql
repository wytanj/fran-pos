-- Face → register input channel for mirror member-phone prompt (and future face forms).
-- Display submits via display_token; cashier polls via register device_token.

alter table public.pos_mirror_stations
  add column if not exists face_input jsonb,
  add column if not exists face_input_seq bigint not null default 0,
  add column if not exists face_input_at timestamptz;

create or replace function public.submit_mirror_face_input(
  p_display_token text,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  station public.pos_mirror_stations%rowtype;
  next_seq bigint;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    raise exception 'Face input must be a JSON object';
  end if;
  if pg_column_size(p_input) > 16384 then
    raise exception 'Face input too large';
  end if;

  update public.pos_mirror_stations
    set display_seen_at = now()
    where display_token = trim(coalesce(p_display_token, ''))
    returning * into station;

  if not found then
    raise exception 'Display is not paired';
  end if;

  next_seq := station.face_input_seq + 1;

  update public.pos_mirror_stations
    set face_input = p_input,
        face_input_seq = next_seq,
        face_input_at = now(),
        display_seen_at = now()
    where id = station.id
    returning * into station;

  return jsonb_build_object(
    'station_id', station.id,
    'face_input_seq', station.face_input_seq
  );
end;
$$;

create or replace function public.read_mirror_face_input(
  p_register_token text,
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
  station := public.pos_mirror_station_for_register(p_register_token);

  return jsonb_build_object(
    'station_id', station.id,
    'face_input_seq', station.face_input_seq,
    'face_input', case
      when station.face_input_seq > coalesce(p_after_seq, 0) then station.face_input
      else null
    end,
    'face_input_at', station.face_input_at
  );
end;
$$;

create or replace function public.clear_mirror_face_input(p_register_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  station public.pos_mirror_stations%rowtype;
begin
  station := public.pos_mirror_station_for_register(p_register_token);

  update public.pos_mirror_stations
    set face_input = null,
        face_input_at = null
    where id = station.id
    returning * into station;

  return jsonb_build_object(
    'station_id', station.id,
    'face_input_seq', station.face_input_seq
  );
end;
$$;

revoke all on function public.submit_mirror_face_input(text, jsonb) from public;
revoke all on function public.read_mirror_face_input(text, bigint) from public;
revoke all on function public.clear_mirror_face_input(text) from public;

grant execute on function public.submit_mirror_face_input(text, jsonb) to anon, authenticated, service_role;
grant execute on function public.read_mirror_face_input(text, bigint) to anon, authenticated, service_role;
grant execute on function public.clear_mirror_face_input(text) to anon, authenticated, service_role;
