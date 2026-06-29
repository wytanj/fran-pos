# POS Supabase Replication To Another Google Account

Use `supabase/bootstrap_google_account.sql` when creating a fresh Supabase project under another Google account.

## What It Creates

- POS tenant tables: `companies`, `profiles`, `categories`, `products`, `payment_methods`, `tax_rates`, `orders`, `order_items`, `company_settings`
- Customer table and order customer link
- RLS helper functions
- RLS policies
- Signup trigger that creates a company, owner profile, settings row, and Cash payment method when a new user signs up with `company_name`

## What It Does Not Copy

- Supabase Auth users
- Existing company/product/order/customer data
- Storage buckets or files
- Vercel environment variables
- OAuth provider settings
- POS company-specific SKUMS connector values

## Fresh Project Steps

1. Create the new Supabase project.
2. Run `bootstrap_google_account.sql` in the Supabase SQL editor.
3. Configure app environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Configure Supabase Auth redirect URLs for the POS app domain.
5. Register the first owner user through the POS registration page.
6. In POS Settings > Integrations, paste the SKUMS API URL and SKUMS account key for that company.

## Ongoing Migration Runner

Use the repo migration runner for incremental schema changes after the bootstrap:

```bash
npm run db:migrate:status
npm run db:migrate -- --dry-run
npm run db:migrate -- --to 002 --mark-applied
npm run db:migrate -- --only 003
npm run db:migrate
```

The runner reads SQL files from `supabase/migrations`, uses the Node `postgres` driver, and records applied migrations in `public.pos_migrations` with SHA-256 checksums. If a file changes after it was applied, the runner stops with a checksum mismatch instead of silently drifting.

Set one of these connection variables before running it:

```bash
SUPABASE_DB_URL=postgresql://...
DATABASE_URL=postgresql://...
POSTGRES_URL=postgresql://...
```

If no full URL is set, the runner can derive the direct Supabase DB URL from:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_DB_PASSWORD=...
```

For hosted Supabase, prefer the pooler URL if the direct `db.<project-ref>.supabase.co` hostname does not resolve from the current machine.

For an existing POS database that was created before this runner, first mark the already-applied bootstrap migrations as applied:

```bash
npm run db:migrate -- --to 002 --mark-applied
```

Then apply only the new incremental migration:

```bash
npm run db:migrate -- --only 003
```

## Existing Data Migration Note

If moving real data, migrate or recreate Supabase Auth users first. The schema references `auth.users(id)` from:

- `companies.owner_id`
- `profiles.user_id`
- `orders.created_by`

If user UUIDs differ in the new project, remap those columns during import.
