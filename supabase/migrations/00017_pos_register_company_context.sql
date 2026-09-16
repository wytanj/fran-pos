-- Register unlock (HRM PIN, no Google): load company + settings for a bound device.
-- SECURITY DEFINER so anon tablet can read skums_connector / stripe_terminal after pair.

create or replace function public.get_pos_register_company_context(p_device_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.pos_register_devices%rowtype;
  company_row public.companies%rowtype;
  settings_row public.company_settings%rowtype;
begin
  if p_device_token is null or length(trim(p_device_token)) < 8 then
    raise exception 'device_token required';
  end if;

  select * into rec
  from public.pos_register_devices
  where device_token = trim(p_device_token) and revoked_at is null
  limit 1;

  if not found then
    raise exception 'Unknown or revoked device';
  end if;

  if rec.company_id is null then
    raise exception 'Register is not linked to a company';
  end if;

  update public.pos_register_devices
    set last_seen_at = now()
    where id = rec.id;

  select * into company_row
  from public.companies
  where id = rec.company_id
  limit 1;

  if not found then
    raise exception 'Company not found for register';
  end if;

  select * into settings_row
  from public.company_settings
  where company_id = rec.company_id
  limit 1;

  return jsonb_build_object(
    'device_token', rec.device_token,
    'store_code', rec.store_code,
    'register_id', rec.register_id,
    'company_id', rec.company_id,
    'label', rec.label,
    'company', to_jsonb(company_row),
    'settings', case when settings_row.id is null then null else to_jsonb(settings_row) end
  );
end;
$$;

revoke all on function public.get_pos_register_company_context(text) from public;
grant execute on function public.get_pos_register_company_context(text) to anon, authenticated, service_role;
