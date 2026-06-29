-- ============================================================
-- Authenticated POS company onboarding RPC
-- ============================================================

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
