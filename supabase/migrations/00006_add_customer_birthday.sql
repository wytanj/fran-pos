-- Store the POS-owned customer birthday used by CRM/loyalty search and enrolment.

alter table public.customers
  add column if not exists birthday date;

create index if not exists customers_birthday_idx
  on public.customers(company_id, birthday)
  where birthday is not null;
