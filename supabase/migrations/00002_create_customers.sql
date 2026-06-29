-- ============================================
-- Customers table - designed for external sync
-- ============================================

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,

  -- Core identity
  first_name text,
  last_name text,
  email text,
  phone text,

  -- External sync support
  external_id text,              -- ID from the source system (Shopify customer ID, CRM ID, etc.)
  source text default 'manual',  -- 'manual', 'shopify', 'hubspot', 'salesforce', 'csv_import', etc.

  -- Extra info
  notes text,
  tags text[] default '{}',
  metadata jsonb default '{}'::jsonb,  -- flexible: address, preferences, loyalty points, etc.

  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customers_company_idx on public.customers(company_id);
create index customers_email_idx on public.customers(company_id, email) where email is not null;
create index customers_phone_idx on public.customers(company_id, phone) where phone is not null;
create unique index customers_external_idx on public.customers(company_id, source, external_id) where external_id is not null;
create index customers_name_idx on public.customers(company_id, lower(first_name), lower(last_name));

-- Add customer_id to orders
alter table public.orders add column customer_id uuid references public.customers(id) on delete set null;
create index orders_customer_idx on public.orders(customer_id) where customer_id is not null;

-- RLS
alter table public.customers enable row level security;

create policy "Users can view customers in their company"
  on public.customers for select
  using (company_id in (select public.get_user_company_ids()));

create policy "Users can insert customers in their company"
  on public.customers for insert
  with check (company_id in (select public.get_user_company_ids()));

create policy "Managers+ can update customers"
  on public.customers for update
  using (public.user_has_role(company_id, array['owner', 'admin', 'manager']::public.user_role[]));

create policy "Admins+ can delete customers"
  on public.customers for delete
  using (public.user_has_role(company_id, array['owner', 'admin']::public.user_role[]));
