-- Customer identity links for POS, external CRMs, and Open Spine.
-- Existing customers.source/external_id remains for compatibility; these
-- tables allow one POS customer to carry many identifiers and provider links.

create unique index if not exists customers_company_id_id_idx
  on public.customers(company_id, id);

create table if not exists public.pos_customer_identifiers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null,
  identifier_type text not null check (identifier_type in ('email', 'phone', 'member_number', 'qr', 'external_ref', 'card')),
  normalized_value text not null,
  display_value text,
  provider text not null default 'pos',
  verified_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (company_id, customer_id) references public.customers(company_id, id) on delete cascade,
  unique(company_id, identifier_type, normalized_value)
);

create table if not exists public.pos_customer_external_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null,
  provider text not null,
  external_id text not null,
  external_ref jsonb not null default '{}'::jsonb,
  is_primary boolean not null default false,
  last_seen_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (company_id, customer_id) references public.customers(company_id, id) on delete cascade,
  unique(company_id, provider, external_id)
);

create index if not exists pos_customer_identifiers_customer_idx
  on public.pos_customer_identifiers(company_id, customer_id);

create index if not exists pos_customer_identifiers_lookup_idx
  on public.pos_customer_identifiers(company_id, identifier_type, normalized_value);

create index if not exists pos_customer_external_links_customer_idx
  on public.pos_customer_external_links(company_id, customer_id);

create index if not exists pos_customer_external_links_provider_idx
  on public.pos_customer_external_links(company_id, provider);

grant select, insert, update, delete on table public.pos_customer_identifiers to authenticated, service_role;
grant select, insert, update, delete on table public.pos_customer_external_links to authenticated, service_role;

alter table public.pos_customer_identifiers enable row level security;
alter table public.pos_customer_external_links enable row level security;

create policy "Users can view POS customer identifiers"
  on public.pos_customer_identifiers for select
  to authenticated
  using (company_id in (select public.get_user_company_ids()));

create policy "Users can insert POS customer identifiers"
  on public.pos_customer_identifiers for insert
  to authenticated
  with check (company_id in (select public.get_user_company_ids()));

create policy "Managers+ can update POS customer identifiers"
  on public.pos_customer_identifiers for update
  to authenticated
  using (public.user_has_role(company_id, array['owner', 'admin', 'manager']::public.user_role[]))
  with check (public.user_has_role(company_id, array['owner', 'admin', 'manager']::public.user_role[]));

create policy "Admins+ can delete POS customer identifiers"
  on public.pos_customer_identifiers for delete
  to authenticated
  using (public.user_has_role(company_id, array['owner', 'admin']::public.user_role[]));

create policy "Users can view POS customer external links"
  on public.pos_customer_external_links for select
  to authenticated
  using (company_id in (select public.get_user_company_ids()));

create policy "Users can insert POS customer external links"
  on public.pos_customer_external_links for insert
  to authenticated
  with check (company_id in (select public.get_user_company_ids()));

create policy "Managers+ can update POS customer external links"
  on public.pos_customer_external_links for update
  to authenticated
  using (public.user_has_role(company_id, array['owner', 'admin', 'manager']::public.user_role[]))
  with check (public.user_has_role(company_id, array['owner', 'admin', 'manager']::public.user_role[]));

create policy "Admins+ can delete POS customer external links"
  on public.pos_customer_external_links for delete
  to authenticated
  using (public.user_has_role(company_id, array['owner', 'admin']::public.user_role[]));

insert into public.pos_customer_identifiers (
  company_id,
  customer_id,
  identifier_type,
  normalized_value,
  display_value,
  provider,
  metadata
)
select
  company_id,
  id,
  'email',
  lower(trim(email)),
  trim(email),
  coalesce(nullif(trim(source), ''), 'pos'),
  jsonb_build_object('backfilled_from', 'customers.email')
from public.customers
where email is not null
  and trim(email) <> ''
on conflict (company_id, identifier_type, normalized_value) do nothing;

insert into public.pos_customer_identifiers (
  company_id,
  customer_id,
  identifier_type,
  normalized_value,
  display_value,
  provider,
  metadata
)
select
  company_id,
  id,
  'phone',
  regexp_replace(phone, '\D', '', 'g'),
  trim(phone),
  coalesce(nullif(trim(source), ''), 'pos'),
  jsonb_build_object('backfilled_from', 'customers.phone')
from public.customers
where phone is not null
  and regexp_replace(phone, '\D', '', 'g') <> ''
on conflict (company_id, identifier_type, normalized_value) do nothing;

insert into public.pos_customer_external_links (
  company_id,
  customer_id,
  provider,
  external_id,
  external_ref,
  is_primary,
  last_seen_at,
  metadata
)
select
  company_id,
  id,
  coalesce(nullif(trim(source), ''), 'external'),
  trim(external_id),
  jsonb_build_object('legacy_source', source),
  true,
  updated_at,
  jsonb_build_object('backfilled_from', 'customers.external_id')
from public.customers
where external_id is not null
  and trim(external_id) <> ''
on conflict (company_id, provider, external_id) do nothing;
