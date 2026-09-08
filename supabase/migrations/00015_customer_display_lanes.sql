-- ============================================================
-- Screen B — customer display lanes (docs/SCREEN_A_B_PLAN.md P0)
--
-- Screen A (cashier POS) owns a "lane" and publishes a read-only
-- display payload (cart mirror / amount due / thank-you) with a
-- private publish_token. Screen B (Active5 face) pairs with
-- store_code + 6-char pair_token — no staff login — and only ever
-- reads the payload. B never mutates anything.
--
-- lane_code is P2 structure only: one lane per S700 / counter later.
-- ============================================================

create table if not exists public.pos_customer_display_lanes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  store_code text not null,
  lane_code text not null default 'MAIN',
  pair_token text not null unique,
  publish_token uuid not null unique default gen_random_uuid(),
  -- Demo-mode Screen A (no auth) proves ownership with a device secret
  -- generated client-side. Null once a signed-in company member claims it.
  device_secret text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One lane per company+store+lane; demo (company null) lanes share a
-- separate namespace so two companies' FRAN01/MAIN never collide.
create unique index if not exists pos_customer_display_lanes_scope_unique
  on public.pos_customer_display_lanes (
    coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    store_code,
    lane_code
  );

create index if not exists pos_customer_display_lanes_company_idx
  on public.pos_customer_display_lanes(company_id);

revoke all on table public.pos_customer_display_lanes from public;
revoke all on table public.pos_customer_display_lanes from anon;
alter table public.pos_customer_display_lanes enable row level security;

-- Company members manage their own lanes. anon has NO direct table access:
-- Screen B goes through the pair/get RPCs only.
drop policy if exists "Company members can view display lanes" on public.pos_customer_display_lanes;
create policy "Company members can view display lanes"
  on public.pos_customer_display_lanes for select
  using (company_id in (select public.get_user_company_ids()));

drop policy if exists "Company members can update display lanes" on public.pos_customer_display_lanes;
create policy "Company members can update display lanes"
  on public.pos_customer_display_lanes for update
  using (company_id in (select public.get_user_company_ids()));

drop policy if exists "Company members can delete display lanes" on public.pos_customer_display_lanes;
create policy "Company members can delete display lanes"
  on public.pos_customer_display_lanes for delete
  using (company_id in (select public.get_user_company_ids()));

grant select, update, delete on table public.pos_customer_display_lanes to authenticated, service_role;

-- ------------------------------------------------------------
-- Realtime
-- 1) postgres_changes for signed-in company members (RLS-scoped).
-- 2) Broadcast for Screen B: anon has no SELECT policy, so
--    postgres_changes would never reach the face. A trigger pushes
--    the payload to private topic `customer_display:<lane_id>`
--    ("Broadcast from Database"); the realtime.messages policy below
--    lets a paired face (anon) subscribe to that topic prefix only.
--    The lane id is an unguessable uuid B learns from pairing.
-- ------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'pos_customer_display_lanes'
     ) then
    alter publication supabase_realtime add table public.pos_customer_display_lanes;
  end if;
end $$;

create or replace function public.pos_customer_display_lanes_broadcast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform realtime.send(
      jsonb_build_object(
        'lane_id', new.id,
        'payload', new.payload,
        'updated_at', new.updated_at
      ),
      'display',
      'customer_display:' || new.id::text,
      true
    );
  exception when others then
    -- Broadcast is best-effort; B polls as fallback.
    null;
  end;
  return new;
end;
$$;

drop trigger if exists pos_customer_display_lanes_broadcast_trg on public.pos_customer_display_lanes;
create trigger pos_customer_display_lanes_broadcast_trg
  after update of payload on public.pos_customer_display_lanes
  for each row execute function public.pos_customer_display_lanes_broadcast();

-- Realtime authorises private-channel joins against realtime.messages RLS.
drop policy if exists "Paired customer displays can receive lane broadcasts" on realtime.messages;
create policy "Paired customer displays can receive lane broadcasts"
  on realtime.messages for select
  to anon, authenticated
  using (
    extension = 'broadcast'
    and realtime.topic() like 'customer_display:%'
  );

-- ------------------------------------------------------------
-- Helpers
-- ------------------------------------------------------------
create or replace function public.pos_customer_display_pair_token()
returns text
language plpgsql
set search_path = ''
as $$
declare
  -- No 0/O/1/I so staff can read it off Screen A and type it on B.
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_token text := '';
  v_i int;
begin
  for v_i in 1..6 loop
    v_token := v_token || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
  end loop;
  return v_token;
end;
$$;

revoke all on function public.pos_customer_display_pair_token() from public;

-- ------------------------------------------------------------
-- Screen A: claim / create the lane it publishes to.
-- Signed-in company members are keyed by company. Demo A (no auth)
-- proves ownership with p_device_secret (created client-side once).
-- ------------------------------------------------------------
create or replace function public.ensure_customer_display_lane(
  p_store_code text,
  p_lane_code text default 'MAIN',
  p_device_secret text default null,
  p_company_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_store text := upper(trim(coalesce(p_store_code, '')));
  v_lane text := upper(trim(coalesce(nullif(p_lane_code, ''), 'MAIN')));
  v_secret text := nullif(trim(coalesce(p_device_secret, '')), '');
  v_company uuid;
  v_lane_row public.pos_customer_display_lanes%rowtype;
  v_attempt int := 0;
begin
  if v_store = '' then
    raise exception 'Store code is required' using errcode = '22023';
  end if;
  if v_lane !~ '^[A-Z0-9_-]{1,16}$' then
    raise exception 'Lane code must be 1-16 letters, digits, _ or -' using errcode = '22023';
  end if;

  if v_uid is not null then
    if p_company_id is not null then
      if not exists (
        select 1 from public.profiles
        where user_id = v_uid and company_id = p_company_id and is_active = true
      ) then
        raise exception 'Not a member of this company' using errcode = '42501';
      end if;
      v_company := p_company_id;
    else
      select company_id into v_company
      from public.profiles
      where user_id = v_uid and is_active = true
      order by created_at
      limit 1;
    end if;
  end if;

  if v_company is null and v_secret is null then
    raise exception 'Sign in or provide a device secret to claim a display lane' using errcode = '28000';
  end if;

  if v_company is not null then
    select * into v_lane_row
    from public.pos_customer_display_lanes
    where company_id = v_company and store_code = v_store and lane_code = v_lane
    for update;
  else
    select * into v_lane_row
    from public.pos_customer_display_lanes
    where company_id is null and store_code = v_store and lane_code = v_lane
    for update;

    if found and v_lane_row.device_secret is distinct from v_secret then
      raise exception 'Display lane % / % is claimed by another register', v_store, v_lane
        using errcode = '42501';
    end if;
  end if;

  if not found then
    loop
      v_attempt := v_attempt + 1;
      begin
        insert into public.pos_customer_display_lanes (company_id, store_code, lane_code, pair_token, device_secret)
        values (v_company, v_store, v_lane, public.pos_customer_display_pair_token(), case when v_company is null then v_secret else null end)
        returning * into v_lane_row;
        exit;
      exception when unique_violation then
        if v_attempt >= 5 then raise; end if;
      end;
    end loop;
  end if;

  return json_build_object(
    'lane_id', v_lane_row.id,
    'store_code', v_lane_row.store_code,
    'lane_code', v_lane_row.lane_code,
    'pair_token', v_lane_row.pair_token,
    'publish_token', v_lane_row.publish_token
  );
end;
$$;

revoke all on function public.ensure_customer_display_lane(text, text, text, uuid) from public;
grant execute on function public.ensure_customer_display_lane(text, text, text, uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- Screen A: publish the display payload. publish_token is the
-- capability; never shown on B.
-- ------------------------------------------------------------
create or replace function public.publish_customer_display(
  p_publish_token uuid,
  p_payload jsonb
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_updated timestamptz;
begin
  if p_publish_token is null then
    raise exception 'Publish token is required' using errcode = '22023';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Payload must be a JSON object' using errcode = '22023';
  end if;
  if pg_column_size(p_payload) > 65536 then
    raise exception 'Payload too large' using errcode = '22023';
  end if;

  update public.pos_customer_display_lanes
  set payload = p_payload, updated_at = now()
  where publish_token = p_publish_token
  returning id, updated_at into v_id, v_updated;

  if v_id is null then
    raise exception 'Display lane not found for publish token' using errcode = 'P0002';
  end if;

  return json_build_object('lane_id', v_id, 'updated_at', v_updated);
end;
$$;

revoke all on function public.publish_customer_display(uuid, jsonb) from public;
grant execute on function public.publish_customer_display(uuid, jsonb) to anon, authenticated;

-- ------------------------------------------------------------
-- Screen B: pair with store code + pair token (kiosk, no staff login).
-- ------------------------------------------------------------
create or replace function public.pair_customer_display(
  p_store_code text,
  p_pair_token text
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store text := upper(trim(coalesce(p_store_code, '')));
  v_token text := upper(regexp_replace(coalesce(p_pair_token, ''), '[^A-Za-z0-9]', '', 'g'));
  v_row public.pos_customer_display_lanes%rowtype;
begin
  if v_store = '' or v_token = '' then
    raise exception 'Store code and pair token are required' using errcode = '22023';
  end if;

  select * into v_row
  from public.pos_customer_display_lanes
  where store_code = v_store and pair_token = v_token;

  if not found then
    raise exception 'No display lane matches that store code and pair token' using errcode = 'P0002';
  end if;

  return json_build_object(
    'lane_id', v_row.id,
    'store_code', v_row.store_code,
    'lane_code', v_row.lane_code,
    'payload', v_row.payload,
    'updated_at', v_row.updated_at
  );
end;
$$;

revoke all on function public.pair_customer_display(text, text) from public;
grant execute on function public.pair_customer_display(text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- Screen B: poll fallback (and initial read after reconnect).
-- ------------------------------------------------------------
create or replace function public.get_customer_display(
  p_lane_id uuid,
  p_pair_token text
)
returns json
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_token text := upper(regexp_replace(coalesce(p_pair_token, ''), '[^A-Za-z0-9]', '', 'g'));
  v_row public.pos_customer_display_lanes%rowtype;
begin
  select * into v_row
  from public.pos_customer_display_lanes
  where id = p_lane_id and pair_token = v_token;

  if not found then
    raise exception 'Display lane not found' using errcode = 'P0002';
  end if;

  return json_build_object(
    'lane_id', v_row.id,
    'store_code', v_row.store_code,
    'lane_code', v_row.lane_code,
    'payload', v_row.payload,
    'updated_at', v_row.updated_at
  );
end;
$$;

revoke all on function public.get_customer_display(uuid, text) from public;
grant execute on function public.get_customer_display(uuid, text) to anon, authenticated;
