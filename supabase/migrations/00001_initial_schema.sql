-- ============================================
-- POS System - Initial Database Schema
-- ============================================

-- 1. Companies (tenants)
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  owner_id uuid not null references auth.users(id),
  business_type text not null default 'retail',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index companies_owner_idx on public.companies(owner_id);

-- 2. Profiles (users linked to companies)
create type public.user_role as enum ('owner', 'admin', 'manager', 'cashier');

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  role public.user_role not null default 'cashier',
  display_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, company_id)
);

create index profiles_user_idx on public.profiles(user_id);
create index profiles_company_idx on public.profiles(company_id);

-- 3. Categories
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index categories_company_idx on public.categories(company_id);

-- 4. Products
create table public.products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  description text,
  sku text,
  barcode text,
  price numeric(12, 2) not null,
  cost_price numeric(12, 2),
  track_inventory boolean not null default false,
  inventory_count integer default 0,
  image_url text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_company_idx on public.products(company_id);
create index products_category_idx on public.products(category_id);
create unique index products_sku_company_idx on public.products(company_id, sku) where sku is not null;
create unique index products_barcode_company_idx on public.products(company_id, barcode) where barcode is not null;

-- 5. Payment Methods
create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  type text not null default 'cash',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index payment_methods_company_idx on public.payment_methods(company_id);

-- 6. Tax Rates
create table public.tax_rates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  rate numeric(5, 4) not null,
  is_default boolean not null default false,
  is_inclusive boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index tax_rates_company_idx on public.tax_rates(company_id);

-- 7. Orders
create type public.order_status as enum ('draft', 'completed', 'refunded', 'voided');

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_number integer not null default 0,
  status public.order_status not null default 'draft',
  subtotal numeric(12, 2) not null default 0,
  tax_total numeric(12, 2) not null default 0,
  discount_total numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  payment_method_id uuid references public.payment_methods(id),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index orders_company_idx on public.orders(company_id);
create index orders_created_at_idx on public.orders(created_at);
create index orders_status_idx on public.orders(company_id, status);

-- 8. Order Items
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity integer not null default 1,
  unit_price numeric(12, 2) not null,
  tax_rate numeric(5, 4) default 0,
  tax_amount numeric(12, 2) default 0,
  discount_amount numeric(12, 2) default 0,
  line_total numeric(12, 2) not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index order_items_order_idx on public.order_items(order_id);

-- 9. Company Settings
create table public.company_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade unique,
  currency text not null default 'USD',
  timezone text not null default 'UTC',
  locale text not null default 'en-US',
  branding jsonb not null default '{"primary_color": "#000000", "logo_url": null}'::jsonb,
  receipt_template jsonb not null default '{"show_logo": true, "header_text": "", "footer_text": "Thank you for your purchase!", "show_tax_breakdown": true}'::jsonb,
  pos_config jsonb not null default '{"quick_sale_mode": false, "require_customer": false, "allow_negative_inventory": false, "default_tax_rate_id": null}'::jsonb,
  custom_fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================
-- Auto-increment order numbers per company
-- ============================================
create or replace function public.next_order_number(p_company_id uuid)
returns integer
language sql
as $$
  select coalesce(max(order_number), 0) + 1
  from public.orders
  where company_id = p_company_id;
$$;

-- ============================================
-- RLS Helper Functions
-- ============================================
create or replace function public.get_user_company_ids()
returns setof uuid
language sql
security definer
stable
as $$
  select company_id from public.profiles
  where user_id = auth.uid() and is_active = true;
$$;

create or replace function public.user_has_role(p_company_id uuid, p_roles public.user_role[])
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid()
      and company_id = p_company_id
      and role = any(p_roles)
      and is_active = true
  );
$$;

-- ============================================
-- RLS Policies
-- ============================================

-- Companies
alter table public.companies enable row level security;

create policy "Users can view their companies"
  on public.companies for select
  using (id in (select public.get_user_company_ids()));

create policy "Users can insert companies (registration)"
  on public.companies for insert
  with check (owner_id = auth.uid());

create policy "Owners can update their companies"
  on public.companies for update
  using (public.user_has_role(id, array['owner']::public.user_role[]));

-- Profiles
alter table public.profiles enable row level security;

create policy "Users can view profiles in their companies"
  on public.profiles for select
  using (company_id in (select public.get_user_company_ids()));

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (user_id = auth.uid());

create policy "Admins+ can update profiles"
  on public.profiles for update
  using (public.user_has_role(company_id, array['owner', 'admin']::public.user_role[]));

create policy "Admins+ can delete profiles"
  on public.profiles for delete
  using (public.user_has_role(company_id, array['owner', 'admin']::public.user_role[]));

-- Categories
alter table public.categories enable row level security;

create policy "Users can view categories in their company"
  on public.categories for select
  using (company_id in (select public.get_user_company_ids()));

create policy "Managers+ can insert categories"
  on public.categories for insert
  with check (public.user_has_role(company_id, array['owner', 'admin', 'manager']::public.user_role[]));

create policy "Managers+ can update categories"
  on public.categories for update
  using (public.user_has_role(company_id, array['owner', 'admin', 'manager']::public.user_role[]));

create policy "Managers+ can delete categories"
  on public.categories for delete
  using (public.user_has_role(company_id, array['owner', 'admin', 'manager']::public.user_role[]));

-- Products
alter table public.products enable row level security;

create policy "Users can view products in their company"
  on public.products for select
  using (company_id in (select public.get_user_company_ids()));

create policy "Managers+ can insert products"
  on public.products for insert
  with check (public.user_has_role(company_id, array['owner', 'admin', 'manager']::public.user_role[]));

create policy "Managers+ can update products"
  on public.products for update
  using (public.user_has_role(company_id, array['owner', 'admin', 'manager']::public.user_role[]));

create policy "Managers+ can delete products"
  on public.products for delete
  using (public.user_has_role(company_id, array['owner', 'admin', 'manager']::public.user_role[]));

-- Payment Methods
alter table public.payment_methods enable row level security;

create policy "Users can view payment methods in their company"
  on public.payment_methods for select
  using (company_id in (select public.get_user_company_ids()));

create policy "Admins+ can insert payment methods"
  on public.payment_methods for insert
  with check (public.user_has_role(company_id, array['owner', 'admin']::public.user_role[]));

create policy "Admins+ can update payment methods"
  on public.payment_methods for update
  using (public.user_has_role(company_id, array['owner', 'admin']::public.user_role[]));

create policy "Admins+ can delete payment methods"
  on public.payment_methods for delete
  using (public.user_has_role(company_id, array['owner', 'admin']::public.user_role[]));

-- Tax Rates
alter table public.tax_rates enable row level security;

create policy "Users can view tax rates in their company"
  on public.tax_rates for select
  using (company_id in (select public.get_user_company_ids()));

create policy "Admins+ can insert tax rates"
  on public.tax_rates for insert
  with check (public.user_has_role(company_id, array['owner', 'admin']::public.user_role[]));

create policy "Admins+ can update tax rates"
  on public.tax_rates for update
  using (public.user_has_role(company_id, array['owner', 'admin']::public.user_role[]));

create policy "Admins+ can delete tax rates"
  on public.tax_rates for delete
  using (public.user_has_role(company_id, array['owner', 'admin']::public.user_role[]));

-- Orders
alter table public.orders enable row level security;

create policy "Users can view orders in their company"
  on public.orders for select
  using (company_id in (select public.get_user_company_ids()));

create policy "Users can insert orders in their company"
  on public.orders for insert
  with check (company_id in (select public.get_user_company_ids()));

create policy "Managers+ can update orders"
  on public.orders for update
  using (public.user_has_role(company_id, array['owner', 'admin', 'manager']::public.user_role[]));

-- Order Items
alter table public.order_items enable row level security;

create policy "Users can view order items"
  on public.order_items for select
  using (order_id in (select id from public.orders where company_id in (select public.get_user_company_ids())));

create policy "Users can insert order items"
  on public.order_items for insert
  with check (order_id in (select id from public.orders where company_id in (select public.get_user_company_ids())));

-- Company Settings
alter table public.company_settings enable row level security;

create policy "Users can view settings in their company"
  on public.company_settings for select
  using (company_id in (select public.get_user_company_ids()));

create policy "Users can insert settings for their company"
  on public.company_settings for insert
  with check (company_id in (select public.get_user_company_ids()));

create policy "Admins+ can update settings"
  on public.company_settings for update
  using (public.user_has_role(company_id, array['owner', 'admin']::public.user_role[]));

-- ============================================
-- Auth Trigger: Auto-create company on signup
-- ============================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_company_id uuid;
  company_slug text;
begin
  if new.raw_user_meta_data->>'company_name' is not null then
    -- Generate slug from company name
    company_slug := lower(regexp_replace(new.raw_user_meta_data->>'company_name', '[^a-z0-9]+', '-', 'gi'));
    company_slug := trim(both '-' from company_slug);

    -- Ensure unique slug
    if exists (select 1 from public.companies where slug = company_slug) then
      company_slug := company_slug || '-' || substr(gen_random_uuid()::text, 1, 8);
    end if;

    insert into public.companies (name, slug, owner_id)
    values (
      new.raw_user_meta_data->>'company_name',
      company_slug,
      new.id
    )
    returning id into new_company_id;

    insert into public.profiles (user_id, company_id, role, display_name)
    values (new.id, new_company_id, 'owner', new.raw_user_meta_data->>'display_name');

    insert into public.company_settings (company_id) values (new_company_id);

    insert into public.payment_methods (company_id, name, type)
    values (new_company_id, 'Cash', 'cash');
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
