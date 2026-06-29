-- ============================================================
-- POS Supabase Bootstrap SQL
-- ============================================================
--
-- Purpose:
--   Run this in a fresh Supabase project owned by another Google
--   account to recreate the POS database schema, RLS policies,
--   auth signup trigger, and customer table.
--
-- Scope:
--   Schema only. This does not migrate auth users, storage objects,
--   environment variables, Vercel settings, or existing row data.
--
-- Recommended use:
--   1. Create the new Supabase project.
--   2. Run this entire file in the Supabase SQL editor.
--   3. Configure the POS app with the new project URL and anon key.
--   4. Create a new user through the POS registration page.
--
-- If copying existing business data later, migrate auth users first
-- or remap company owner_id / profiles.user_id / orders.created_by
-- to users that exist in the new project.

begin;

create extension if not exists pgcrypto with schema public;

-- ============================================================
-- Types
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'user_role') then
    create type public.user_role as enum ('owner', 'admin', 'manager', 'cashier');
  end if;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'order_status') then
    create type public.order_status as enum ('draft', 'completed', 'refunded', 'voided');
  end if;
end;
$$;

-- ============================================================
-- Core tables
-- ============================================================

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  owner_id uuid not null references auth.users(id),
  business_type text not null default 'retail',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists companies_owner_idx on public.companies(owner_id);

create table if not exists public.profiles (
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

create index if not exists profiles_user_idx on public.profiles(user_id);
create index if not exists profiles_company_idx on public.profiles(company_id);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists categories_company_idx on public.categories(company_id);

create table if not exists public.products (
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

create index if not exists products_company_idx on public.products(company_id);
create index if not exists products_category_idx on public.products(category_id);
create unique index if not exists products_sku_company_idx on public.products(company_id, sku) where sku is not null;
create unique index if not exists products_barcode_company_idx on public.products(company_id, barcode) where barcode is not null;

create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  type text not null default 'cash',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists payment_methods_company_idx on public.payment_methods(company_id);

create table if not exists public.tax_rates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  rate numeric(5, 4) not null,
  is_default boolean not null default false,
  is_inclusive boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists tax_rates_company_idx on public.tax_rates(company_id);

create table if not exists public.orders (
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

create index if not exists orders_company_idx on public.orders(company_id);
create index if not exists orders_created_at_idx on public.orders(created_at);
create index if not exists orders_status_idx on public.orders(company_id, status);

create table if not exists public.order_items (
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

create index if not exists order_items_order_idx on public.order_items(order_id);

create table if not exists public.company_settings (
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

-- ============================================================
-- Customers
-- ============================================================

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  first_name text,
  last_name text,
  email text,
  phone text,
  birthday date,
  external_id text,
  source text default 'manual',
  notes text,
  tags text[] default '{}',
  metadata jsonb default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customers
  add column if not exists birthday date;

create index if not exists customers_company_idx on public.customers(company_id);
create index if not exists customers_email_idx on public.customers(company_id, email) where email is not null;
create index if not exists customers_phone_idx on public.customers(company_id, phone) where phone is not null;
create index if not exists customers_birthday_idx on public.customers(company_id, birthday) where birthday is not null;
create unique index if not exists customers_external_idx on public.customers(company_id, source, external_id) where external_id is not null;
create index if not exists customers_name_idx on public.customers(company_id, lower(first_name), lower(last_name));

alter table public.orders
  add column if not exists customer_id uuid references public.customers(id) on delete set null;

create index if not exists orders_customer_idx on public.orders(customer_id) where customer_id is not null;

-- ============================================================
-- Helper functions
-- ============================================================

create or replace function public.next_order_number(p_company_id uuid)
returns integer
language sql
as $$
  select coalesce(max(order_number), 0) + 1
  from public.orders
  where company_id = p_company_id;
$$;

create or replace function public.get_user_company_ids()
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select company_id from public.profiles
  where user_id = auth.uid() and is_active = true;
$$;

create or replace function public.user_has_role(p_company_id uuid, p_roles public.user_role[])
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid()
      and company_id = p_company_id
      and role = any(p_roles)
      and is_active = true
  );
$$;

-- ============================================================
-- RLS
-- ============================================================

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.payment_methods enable row level security;
alter table public.tax_rates enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.company_settings enable row level security;
alter table public.customers enable row level security;

drop policy if exists "Users can view their companies" on public.companies;
create policy "Users can view their companies"
  on public.companies for select
  using (id in (select public.get_user_company_ids()));

drop policy if exists "Users can insert companies (registration)" on public.companies;
create policy "Users can insert companies (registration)"
  on public.companies for insert
  with check (owner_id = auth.uid());

drop policy if exists "Owners can update their companies" on public.companies;
create policy "Owners can update their companies"
  on public.companies for update
  using (public.user_has_role(id, array['owner']::public.user_role[]));

drop policy if exists "Users can view profiles in their companies" on public.profiles;
create policy "Users can view profiles in their companies"
  on public.profiles for select
  using (company_id in (select public.get_user_company_ids()));

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (user_id = auth.uid());

drop policy if exists "Admins+ can update profiles" on public.profiles;
create policy "Admins+ can update profiles"
  on public.profiles for update
  using (public.user_has_role(company_id, array['owner', 'admin']::public.user_role[]));

drop policy if exists "Admins+ can delete profiles" on public.profiles;
create policy "Admins+ can delete profiles"
  on public.profiles for delete
  using (public.user_has_role(company_id, array['owner', 'admin']::public.user_role[]));

drop policy if exists "Users can view categories in their company" on public.categories;
create policy "Users can view categories in their company"
  on public.categories for select
  using (company_id in (select public.get_user_company_ids()));

drop policy if exists "Managers+ can insert categories" on public.categories;
create policy "Managers+ can insert categories"
  on public.categories for insert
  with check (public.user_has_role(company_id, array['owner', 'admin', 'manager']::public.user_role[]));

drop policy if exists "Managers+ can update categories" on public.categories;
create policy "Managers+ can update categories"
  on public.categories for update
  using (public.user_has_role(company_id, array['owner', 'admin', 'manager']::public.user_role[]));

drop policy if exists "Managers+ can delete categories" on public.categories;
create policy "Managers+ can delete categories"
  on public.categories for delete
  using (public.user_has_role(company_id, array['owner', 'admin', 'manager']::public.user_role[]));

drop policy if exists "Users can view products in their company" on public.products;
create policy "Users can view products in their company"
  on public.products for select
  using (company_id in (select public.get_user_company_ids()));

drop policy if exists "Managers+ can insert products" on public.products;
create policy "Managers+ can insert products"
  on public.products for insert
  with check (public.user_has_role(company_id, array['owner', 'admin', 'manager']::public.user_role[]));

drop policy if exists "Managers+ can update products" on public.products;
create policy "Managers+ can update products"
  on public.products for update
  using (public.user_has_role(company_id, array['owner', 'admin', 'manager']::public.user_role[]));

drop policy if exists "Managers+ can delete products" on public.products;
create policy "Managers+ can delete products"
  on public.products for delete
  using (public.user_has_role(company_id, array['owner', 'admin', 'manager']::public.user_role[]));

drop policy if exists "Users can view payment methods in their company" on public.payment_methods;
create policy "Users can view payment methods in their company"
  on public.payment_methods for select
  using (company_id in (select public.get_user_company_ids()));

drop policy if exists "Admins+ can insert payment methods" on public.payment_methods;
create policy "Admins+ can insert payment methods"
  on public.payment_methods for insert
  with check (public.user_has_role(company_id, array['owner', 'admin']::public.user_role[]));

drop policy if exists "Admins+ can update payment methods" on public.payment_methods;
create policy "Admins+ can update payment methods"
  on public.payment_methods for update
  using (public.user_has_role(company_id, array['owner', 'admin']::public.user_role[]));

drop policy if exists "Admins+ can delete payment methods" on public.payment_methods;
create policy "Admins+ can delete payment methods"
  on public.payment_methods for delete
  using (public.user_has_role(company_id, array['owner', 'admin']::public.user_role[]));

drop policy if exists "Users can view tax rates in their company" on public.tax_rates;
create policy "Users can view tax rates in their company"
  on public.tax_rates for select
  using (company_id in (select public.get_user_company_ids()));

drop policy if exists "Admins+ can insert tax rates" on public.tax_rates;
create policy "Admins+ can insert tax rates"
  on public.tax_rates for insert
  with check (public.user_has_role(company_id, array['owner', 'admin']::public.user_role[]));

drop policy if exists "Admins+ can update tax rates" on public.tax_rates;
create policy "Admins+ can update tax rates"
  on public.tax_rates for update
  using (public.user_has_role(company_id, array['owner', 'admin']::public.user_role[]));

drop policy if exists "Admins+ can delete tax rates" on public.tax_rates;
create policy "Admins+ can delete tax rates"
  on public.tax_rates for delete
  using (public.user_has_role(company_id, array['owner', 'admin']::public.user_role[]));

drop policy if exists "Users can view orders in their company" on public.orders;
create policy "Users can view orders in their company"
  on public.orders for select
  using (company_id in (select public.get_user_company_ids()));

drop policy if exists "Users can insert orders in their company" on public.orders;
create policy "Users can insert orders in their company"
  on public.orders for insert
  with check (company_id in (select public.get_user_company_ids()));

drop policy if exists "Managers+ can update orders" on public.orders;
create policy "Managers+ can update orders"
  on public.orders for update
  using (public.user_has_role(company_id, array['owner', 'admin', 'manager']::public.user_role[]));

drop policy if exists "Users can view order items" on public.order_items;
create policy "Users can view order items"
  on public.order_items for select
  using (order_id in (select id from public.orders where company_id in (select public.get_user_company_ids())));

drop policy if exists "Users can insert order items" on public.order_items;
create policy "Users can insert order items"
  on public.order_items for insert
  with check (order_id in (select id from public.orders where company_id in (select public.get_user_company_ids())));

drop policy if exists "Users can view settings in their company" on public.company_settings;
create policy "Users can view settings in their company"
  on public.company_settings for select
  using (company_id in (select public.get_user_company_ids()));

drop policy if exists "Users can insert settings for their company" on public.company_settings;
create policy "Users can insert settings for their company"
  on public.company_settings for insert
  with check (company_id in (select public.get_user_company_ids()));

drop policy if exists "Admins+ can update settings" on public.company_settings;
create policy "Admins+ can update settings"
  on public.company_settings for update
  using (public.user_has_role(company_id, array['owner', 'admin']::public.user_role[]));

drop policy if exists "Users can view customers in their company" on public.customers;
create policy "Users can view customers in their company"
  on public.customers for select
  using (company_id in (select public.get_user_company_ids()));

drop policy if exists "Users can insert customers in their company" on public.customers;
create policy "Users can insert customers in their company"
  on public.customers for insert
  with check (company_id in (select public.get_user_company_ids()));

drop policy if exists "Managers+ can update customers" on public.customers;
create policy "Managers+ can update customers"
  on public.customers for update
  using (public.user_has_role(company_id, array['owner', 'admin', 'manager']::public.user_role[]));

drop policy if exists "Admins+ can delete customers" on public.customers;
create policy "Admins+ can delete customers"
  on public.customers for delete
  using (public.user_has_role(company_id, array['owner', 'admin']::public.user_role[]));

-- ============================================================
-- Auth trigger
-- ============================================================

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
    company_slug := lower(regexp_replace(new.raw_user_meta_data->>'company_name', '[^a-z0-9]+', '-', 'gi'));
    company_slug := trim(both '-' from company_slug);

    if company_slug = '' then
      company_slug := 'company';
    end if;

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
    values (
      new.id,
      new_company_id,
      'owner',
      coalesce(
        nullif(new.raw_user_meta_data->>'display_name', ''),
        nullif(new.raw_user_meta_data->>'full_name', ''),
        nullif(new.raw_user_meta_data->>'name', ''),
        new.email
      )
    );

    insert into public.company_settings (company_id) values (new_company_id);

    insert into public.payment_methods (company_id, name, type)
    values (new_company_id, 'Cash', 'cash');
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.create_company_profile(
  p_company_name text,
  p_display_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  existing_company_id uuid;
  new_company_id uuid;
  company_slug text;
begin
  if current_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if nullif(trim(p_company_name), '') is null then
    raise exception 'company name is required' using errcode = '22023';
  end if;

  select p.company_id
    into existing_company_id
  from public.profiles p
  where p.user_id = current_user_id
    and p.is_active = true
  order by p.created_at
  limit 1;

  if existing_company_id is not null then
    return existing_company_id;
  end if;

  company_slug := lower(regexp_replace(trim(p_company_name), '[^a-z0-9]+', '-', 'gi'));
  company_slug := trim(both '-' from company_slug);

  if company_slug = '' then
    company_slug := 'company';
  end if;

  if exists (select 1 from public.companies where slug = company_slug) then
    company_slug := company_slug || '-' || substr(gen_random_uuid()::text, 1, 8);
  end if;

  insert into public.companies (name, slug, owner_id)
  values (trim(p_company_name), company_slug, current_user_id)
  returning id into new_company_id;

  insert into public.profiles (user_id, company_id, role, display_name)
  values (
    current_user_id,
    new_company_id,
    'owner',
    coalesce(nullif(trim(p_display_name), ''), auth.email())
  );

  insert into public.company_settings (company_id)
  values (new_company_id);

  insert into public.payment_methods (company_id, name, type)
  values (new_company_id, 'Cash', 'cash');

  return new_company_id;
end;
$$;

revoke all on function public.create_company_profile(text, text) from public;
grant execute on function public.create_company_profile(text, text) to authenticated;

commit;
