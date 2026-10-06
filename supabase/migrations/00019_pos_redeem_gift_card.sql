create table if not exists public.pos_gift_card_redemptions (
  idempotency_key text primary key,
  customer_id uuid not null references public.customers(id),
  amount numeric(12,2) not null check (amount > 0),
  balance_after numeric(12,2) not null check (balance_after >= 0),
  created_at timestamptz not null default now()
);

revoke all on table public.pos_gift_card_redemptions from public, anon, authenticated;
grant select, insert on table public.pos_gift_card_redemptions to service_role;

alter table public.pos_gift_card_redemptions enable row level security;

create or replace function public.pos_redeem_gift_card(
  p_customer_id uuid,
  p_amount numeric,
  p_idempotency_key text
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric;
  v_after numeric;
  v_existing numeric;
  v_raw text;
begin
  if p_customer_id is null then
    raise exception 'customer_id required';
  end if;
  if p_amount is null or round(p_amount, 2) <= 0 then
    raise exception 'amount must be positive';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) = 0 then
    raise exception 'idempotency_key required';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_idempotency_key));

  select balance_after into v_existing
  from public.pos_gift_card_redemptions
  where idempotency_key = p_idempotency_key;
  if found then
    return v_existing;
  end if;

  select
    case
      when coalesce(metadata->>'gift_card_balance', '') ~ '^-?[0-9]+(\.[0-9]+)?$' then metadata->>'gift_card_balance'
      when coalesce(metadata->>'giftCardBalance', '') ~ '^-?[0-9]+(\.[0-9]+)?$' then metadata->>'giftCardBalance'
      else '0'
    end
  into v_raw
  from public.customers
  where id = p_customer_id
    and company_id in (select public.get_user_company_ids())
  for update;

  if not found then
    raise exception 'customer not found';
  end if;

  v_balance := round(v_raw::numeric, 2);
  if v_balance < round(p_amount, 2) then
    raise exception 'insufficient gift card balance';
  end if;

  v_after := round(v_balance - round(p_amount, 2), 2);

  update public.customers
  set
    metadata = jsonb_set(
      coalesce(metadata, '{}'::jsonb),
      '{gift_card_balance}',
      to_jsonb(v_after),
      true
    ),
    updated_at = now()
  where id = p_customer_id;

  insert into public.pos_gift_card_redemptions (idempotency_key, customer_id, amount, balance_after)
  values (p_idempotency_key, p_customer_id, round(p_amount, 2), v_after);

  return v_after;
end;
$$;

revoke all on function public.pos_redeem_gift_card(uuid, numeric, text) from public;
grant execute on function public.pos_redeem_gift_card(uuid, numeric, text) to authenticated, service_role;
