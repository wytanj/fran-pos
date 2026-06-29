-- POS return eligibility checks.
-- These rows preserve the product + email return check that was shown to floor
-- staff before POS executes a refund, exchange, or store-credit flow.

create table if not exists public.pos_return_checks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  crmos_decision_id text,
  crmos_authorization_id text,
  email_hint text not null,
  order_date_hint date,
  receipt_or_order_hint text,
  product_ref jsonb not null default '{}'::jsonb,
  sku text,
  requested_qty numeric(12,3) not null default 1,
  requested_action text not null check (requested_action in ('refund', 'exchange', 'store_credit', 'either')),
  decision text not null check (decision in (
    'eligible',
    'exchange_only',
    'store_credit_only',
    'manager_review',
    'ineligible',
    'not_found',
    'insufficient_context'
  )),
  allowed_actions jsonb not null default '[]'::jsonb,
  reason_codes text[] not null default '{}',
  manager_required boolean not null default false,
  matched_source_system text,
  matched_order_ref text,
  matched_order_line_ref text,
  raw_decision jsonb not null default '{}'::jsonb,
  checked_by_staff_id uuid,
  checked_at timestamptz not null default now(),
  expires_at timestamptz
);

create index if not exists pos_return_checks_company_checked_idx
  on public.pos_return_checks(company_id, checked_at desc);

create index if not exists pos_return_checks_email_idx
  on public.pos_return_checks(company_id, lower(email_hint), checked_at desc);

create index if not exists pos_return_checks_decision_idx
  on public.pos_return_checks(company_id, decision, checked_at desc);

alter table public.pos_returns
  add column if not exists crmos_decision_id text,
  add column if not exists crmos_authorization_id text,
  add column if not exists return_check_id uuid references public.pos_return_checks(id) on delete set null,
  add column if not exists eligibility_decision text,
  add column if not exists manager_ref uuid,
  add column if not exists manager_reason text;

alter table public.pos_return_lines
  add column if not exists crmos_order_line_id text,
  add column if not exists source_system text,
  add column if not exists source_order_ref text,
  add column if not exists match_type text not null default 'no_matched_sale',
  add column if not exists eligibility_reason_codes text[] not null default '{}',
  add column if not exists disposition text;

create index if not exists pos_returns_crmos_decision_idx
  on public.pos_returns(company_id, crmos_decision_id)
  where crmos_decision_id is not null;

create index if not exists pos_return_lines_match_idx
  on public.pos_return_lines(company_id, match_type, created_at desc);

revoke all on table public.pos_return_checks from public;
revoke all on table public.pos_return_checks from anon, authenticated, service_role;
grant select, insert, update on table public.pos_return_checks to authenticated, service_role;

alter table public.pos_return_checks enable row level security;

create policy "Users can view POS return checks in their company"
  on public.pos_return_checks for select
  to authenticated
  using (company_id in (select public.get_user_company_ids()));

create policy "Users can insert POS return checks in their company"
  on public.pos_return_checks for insert
  to authenticated
  with check (company_id in (select public.get_user_company_ids()));

create policy "Managers+ can update POS return checks in their company"
  on public.pos_return_checks for update
  to authenticated
  using (public.user_has_role(company_id, array['owner', 'admin', 'manager']::public.user_role[]))
  with check (public.user_has_role(company_id, array['owner', 'admin', 'manager']::public.user_role[]));
