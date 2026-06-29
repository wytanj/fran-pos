-- POS source facts and outbox events.
-- These tables keep checkout facts owned by POS while allowing CRM, Loyalty,
-- and SKUMS to consume replay-safe events without double counting.

create table if not exists public.pos_sales (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  receipt_number text not null,
  register_id text not null,
  location_id text not null,
  customer_id uuid references public.customers(id) on delete set null,
  cashier_ref text,
  sale_type text not null default 'sale' check (sale_type in ('sale', 'exchange')),
  currency text not null default 'SGD',
  subtotal numeric(12,2) not null default 0,
  discount_total numeric(12,2) not null default 0,
  tax_total numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  idempotency_key text not null,
  occurred_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(company_id, idempotency_key),
  unique(company_id, receipt_number)
);

create table if not exists public.pos_sale_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  sale_id uuid not null references public.pos_sales(id) on delete cascade,
  line_number integer not null,
  line_id text not null,
  sku text,
  product_id uuid references public.products(id) on delete set null,
  product_identity_id text,
  trade_unit_id text,
  listing_id text,
  quantity numeric(12,3) not null,
  unit_price numeric(12,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  line_total numeric(12,2) not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(sale_id, line_number)
);

create table if not exists public.pos_returns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  return_number text not null,
  register_id text not null,
  location_id text not null,
  customer_id uuid references public.customers(id) on delete set null,
  cashier_ref text,
  currency text not null default 'SGD',
  subtotal numeric(12,2) not null default 0,
  refund_total numeric(12,2) not null default 0,
  idempotency_key text not null,
  occurred_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(company_id, idempotency_key),
  unique(company_id, return_number)
);

create table if not exists public.pos_return_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  return_id uuid not null references public.pos_returns(id) on delete cascade,
  line_number integer not null,
  line_id text not null,
  sku text,
  product_id uuid references public.products(id) on delete set null,
  product_identity_id text,
  trade_unit_id text,
  listing_id text,
  quantity numeric(12,3) not null,
  unit_price numeric(12,2) not null default 0,
  refund_amount numeric(12,2) not null default 0,
  reason_code text,
  source_receipt_number text,
  original_line_ref text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(return_id, line_number)
);

create table if not exists public.pos_outbox_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  event_id text not null,
  event_type text not null check (event_type in (
    'pos.customer.attached',
    'pos.sale.completed',
    'pos.return.completed',
    'pos.reward.redeem_requested',
    'pos.reward.refund_requested',
    'fran.member.resolved',
    'fran.counter_session.previewed',
    'fran.reward.quoted',
    'fran.reward.committed',
    'fran.reward.reversed',
    'fran.reward.commit_failed'
  )),
  status text not null default 'queued' check (status in ('queued', 'sent', 'acked', 'failed')),
  source_system text not null default 'pos',
  idempotency_key text not null,
  aggregate_type text not null,
  aggregate_id text not null,
  workspace_id text not null,
  occurred_at timestamptz not null,
  payload jsonb not null,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  acked_at timestamptz,
  unique(company_id, event_id),
  unique(company_id, idempotency_key)
);

create index if not exists pos_sales_company_occurred_idx
  on public.pos_sales(company_id, occurred_at desc);
create index if not exists pos_sales_customer_idx
  on public.pos_sales(company_id, customer_id, occurred_at desc)
  where customer_id is not null;
create index if not exists pos_sale_lines_refs_idx
  on public.pos_sale_lines(company_id, product_identity_id, trade_unit_id, listing_id);

create index if not exists pos_returns_company_occurred_idx
  on public.pos_returns(company_id, occurred_at desc);
create index if not exists pos_returns_customer_idx
  on public.pos_returns(company_id, customer_id, occurred_at desc)
  where customer_id is not null;
create index if not exists pos_return_lines_refs_idx
  on public.pos_return_lines(company_id, product_identity_id, trade_unit_id, listing_id);

create index if not exists pos_outbox_events_status_idx
  on public.pos_outbox_events(company_id, status, created_at);
create index if not exists pos_outbox_events_type_idx
  on public.pos_outbox_events(company_id, event_type, occurred_at desc);

alter table public.pos_sales enable row level security;
alter table public.pos_sale_lines enable row level security;
alter table public.pos_returns enable row level security;
alter table public.pos_return_lines enable row level security;
alter table public.pos_outbox_events enable row level security;

create policy "Users can view POS sales in their company"
  on public.pos_sales for select
  using (company_id in (select public.get_user_company_ids()));

create policy "Users can insert POS sales in their company"
  on public.pos_sales for insert
  with check (company_id in (select public.get_user_company_ids()));

create policy "Users can view POS sale lines in their company"
  on public.pos_sale_lines for select
  using (company_id in (select public.get_user_company_ids()));

create policy "Users can insert POS sale lines in their company"
  on public.pos_sale_lines for insert
  with check (company_id in (select public.get_user_company_ids()));

create policy "Users can view POS returns in their company"
  on public.pos_returns for select
  using (company_id in (select public.get_user_company_ids()));

create policy "Users can insert POS returns in their company"
  on public.pos_returns for insert
  with check (company_id in (select public.get_user_company_ids()));

create policy "Users can view POS return lines in their company"
  on public.pos_return_lines for select
  using (company_id in (select public.get_user_company_ids()));

create policy "Users can insert POS return lines in their company"
  on public.pos_return_lines for insert
  with check (company_id in (select public.get_user_company_ids()));

create policy "Users can view POS outbox events in their company"
  on public.pos_outbox_events for select
  using (company_id in (select public.get_user_company_ids()));

create policy "Users can insert POS outbox events in their company"
  on public.pos_outbox_events for insert
  with check (company_id in (select public.get_user_company_ids()));

create policy "Users can update POS outbox events in their company"
  on public.pos_outbox_events for update
  using (company_id in (select public.get_user_company_ids()));
