-- Tighten API grants for customer identity link tables.
-- Supabase defaults can grant broad table privileges on newly created public
-- tables; keep these tables explicitly limited to the app's DML surface.

revoke all on table public.pos_customer_identifiers from public;
revoke all on table public.pos_customer_external_links from public;
revoke all on table public.pos_customer_identifiers from anon, authenticated, service_role;
revoke all on table public.pos_customer_external_links from anon, authenticated, service_role;

grant select, insert, update, delete on table public.pos_customer_identifiers to authenticated, service_role;
grant select, insert, update, delete on table public.pos_customer_external_links to authenticated, service_role;
