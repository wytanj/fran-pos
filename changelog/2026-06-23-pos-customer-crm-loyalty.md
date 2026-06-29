# POS Customer CRM and Loyalty Foundation

Date: 2026-06-23

## Summary

Added the first POS customer identity foundation for three customer modes:

- POS-only shops that only need a name, email, phone, or member handle to credit purchases.
- External SaaS CRM integrations that need stable external customer links.
- Open Spine CRM integrations that can extend loyalty into tiers, consent, segments, and richer customer memory later.

## Changes

- Added POS customer identifier and external-link tables with RLS, explicit API grants, uniqueness, and existing customer backfills.
- Added a follow-up grant hardening migration to remove broad default `anon` access on the new public tables.
- Added shared POS customer resolution contracts.
- Added a live customer resolver that can match customers by email, phone, member number, or external CRM reference, while keeping direct customer-table fallback.
- Updated the POS customer modal to use the resolver path and show match-source/warning state.
- Added contract tests for migrations, grants, shared types, resolver wiring, and customer modal behavior.
- Added a durable buildout reference in `docs/pos-customer-crm-loyalty-buildout.md`.

## Production Database

- Applied `00009_create_customer_identity_links.sql`.
- Applied `00010_tighten_customer_identity_table_grants.sql`.
- Verified `pos_migrations` records `00001` through `00010`.
- Verified `pos_customer_identifiers` and `pos_customer_external_links` exist.
- Verified `anon` has no table ACL on the new customer identity tables.
- Verified `authenticated` and `service_role` only have select, insert, update, and delete table privileges.

## Verification

- `npm test` passed.
- `npm run build` passed.
- Production deploy should follow the verified database migration state above.
