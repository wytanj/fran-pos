-- POS-initiated inventory event audit/queue.
-- SKUMS remains the canonical inventory ledger; this table lets POS terminals
-- keep a local record of store-floor events submitted for sync or approval.

create table public.pos_inventory_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  event_type text not null check (event_type in (
    'inventory.damage.reported',
    'inventory.found_stock.reported',
    'inventory.transfer_receive.reported'
  )),
  status text not null default 'queued' check (status in (
    'queued',
    'sent',
    'synced',
    'pending_approval',
    'failed'
  )),
  idempotency_key text,
  product_id uuid references public.products(id) on delete set null,
  sku text,
  quantity integer check (quantity is null or quantity > 0),
  store_code text not null,
  storage_location_code text,
  reference text,
  reason_code text,
  skums_event_id text,
  skums_status text,
  payload jsonb not null default '{}'::jsonb,
  response jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  synced_at timestamptz
);

create index pos_inventory_events_company_idx on public.pos_inventory_events(company_id);
create index pos_inventory_events_product_idx on public.pos_inventory_events(product_id);
create index pos_inventory_events_status_idx on public.pos_inventory_events(company_id, status, created_at desc);
create unique index pos_inventory_events_company_idempotency_idx
  on public.pos_inventory_events(company_id, idempotency_key)
  where idempotency_key is not null;

alter table public.pos_inventory_events enable row level security;

create policy "Users can view POS inventory events in their company"
  on public.pos_inventory_events for select
  using (company_id in (select public.get_user_company_ids()));

create policy "Users can insert POS inventory events in their company"
  on public.pos_inventory_events for insert
  with check (company_id in (select public.get_user_company_ids()));

create policy "Users can update POS inventory events in their company"
  on public.pos_inventory_events for update
  using (company_id in (select public.get_user_company_ids()));
