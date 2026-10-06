create or replace function public.enqueue_pos_outbox_events(
  p_device_token text,
  p_events jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  reg public.pos_register_devices%rowtype;
  item jsonb;
  accepted int := 0;
  inserted int := 0;
  event_id text;
  event_type text;
  idempotency_key text;
  aggregate_type text;
  aggregate_id text;
  occurred_at timestamptz;
  payload jsonb;
  wrote int;
begin
  if p_device_token is null or length(trim(p_device_token)) < 8 then
    raise exception 'device_token required';
  end if;

  if p_events is null or jsonb_typeof(p_events) <> 'array' then
    raise exception 'Events must be a JSON array';
  end if;

  if jsonb_array_length(p_events) > 100 then
    raise exception 'Too many outbox events';
  end if;

  select * into reg
  from public.pos_register_devices
  where device_token = trim(p_device_token) and revoked_at is null
  limit 1;

  if not found then
    raise exception 'Unknown or revoked register';
  end if;

  if reg.company_id is null then
    raise exception 'Register is not linked to a company';
  end if;

  update public.pos_register_devices
    set last_seen_at = now()
    where id = reg.id;

  for item in select value from jsonb_array_elements(p_events)
  loop
    if jsonb_typeof(item) <> 'object' then
      raise exception 'Outbox event must be an object';
    end if;

    if pg_column_size(item) > 524288 then
      raise exception 'Outbox event too large';
    end if;

    event_id := nullif(trim(item->>'event_id'), '');
    event_type := nullif(trim(item->>'event_type'), '');
    idempotency_key := nullif(trim(item->>'idempotency_key'), '');
    aggregate_type := nullif(trim(item->>'aggregate_type'), '');
    aggregate_id := nullif(trim(item->>'aggregate_id'), '');

    if event_id is null or event_type is null or idempotency_key is null
       or aggregate_type is null or aggregate_id is null
       or nullif(trim(item->>'occurred_at'), '') is null then
      raise exception 'Outbox event is missing a required field';
    end if;

    occurred_at := (item->>'occurred_at')::timestamptz;
    payload := item->'payload';
    if payload is null or jsonb_typeof(payload) <> 'object' then
      raise exception 'Outbox event payload must be an object';
    end if;

    payload := jsonb_set(payload, '{workspace_id}', to_jsonb(reg.company_id::text), true);

    insert into public.pos_outbox_events (
      company_id,
      event_id,
      event_type,
      status,
      source_system,
      idempotency_key,
      aggregate_type,
      aggregate_id,
      workspace_id,
      occurred_at,
      payload
    ) values (
      reg.company_id,
      event_id,
      event_type,
      'queued',
      'pos',
      idempotency_key,
      aggregate_type,
      aggregate_id,
      reg.company_id::text,
      occurred_at,
      payload
    )
    on conflict do nothing;

    get diagnostics wrote = row_count;
    accepted := accepted + 1;
    inserted := inserted + wrote;
  end loop;

  return jsonb_build_object(
    'company_id', reg.company_id,
    'accepted', accepted,
    'inserted', inserted
  );
end;
$$;

revoke all on function public.enqueue_pos_outbox_events(text, jsonb) from public;
grant execute on function public.enqueue_pos_outbox_events(text, jsonb) to anon, authenticated, service_role;
