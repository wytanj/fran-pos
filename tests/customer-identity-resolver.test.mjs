import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(new URL('../supabase/migrations/00009_create_customer_identity_links.sql', import.meta.url), 'utf8')
const grantMigration = readFileSync(
  new URL('../supabase/migrations/00010_tighten_customer_identity_table_grants.sql', import.meta.url),
  'utf8',
)
const sharedTypes = readFileSync(new URL('../packages/shared/src/types/database.ts', import.meta.url), 'utf8')
const customersHook = readFileSync(new URL('../dashboard/src/hooks/use-customers.ts', import.meta.url), 'utf8')
const customerModal = readFileSync(new URL('../dashboard/src/pos/components/customer-modal.tsx', import.meta.url), 'utf8')

test('customer identity migration adds multi-provider customer links with explicit API grants', () => {
  assert.match(migration, /create table if not exists public\.pos_customer_identifiers/)
  assert.match(migration, /create table if not exists public\.pos_customer_external_links/)
  assert.match(migration, /customers_company_id_id_idx/)
  assert.match(migration, /foreign key \(company_id, customer_id\) references public\.customers\(company_id, id\)/)
  assert.match(migration, /identifier_type text not null check \(identifier_type in \('email', 'phone', 'member_number', 'qr', 'external_ref', 'card'\)\)/)
  assert.match(migration, /unique\(company_id, identifier_type, normalized_value\)/)
  assert.match(migration, /unique\(company_id, provider, external_id\)/)
  assert.match(migration, /grant select, insert, update, delete on table public\.pos_customer_identifiers to authenticated, service_role/)
  assert.match(migration, /grant select, insert, update, delete on table public\.pos_customer_external_links to authenticated, service_role/)
  assert.match(migration, /alter table public\.pos_customer_identifiers enable row level security/)
  assert.match(migration, /alter table public\.pos_customer_external_links enable row level security/)
})

test('customer identity grant cleanup keeps anon out and limits API table privileges', () => {
  assert.match(grantMigration, /revoke all on table public\.pos_customer_identifiers from public/)
  assert.match(grantMigration, /revoke all on table public\.pos_customer_external_links from public/)
  assert.match(grantMigration, /revoke all on table public\.pos_customer_identifiers from anon, authenticated, service_role/)
  assert.match(grantMigration, /revoke all on table public\.pos_customer_external_links from anon, authenticated, service_role/)
  assert.match(grantMigration, /grant select, insert, update, delete on table public\.pos_customer_identifiers to authenticated, service_role/)
  assert.match(grantMigration, /grant select, insert, update, delete on table public\.pos_customer_external_links to authenticated, service_role/)
})

test('customer identity migration backfills existing POS customer handles', () => {
  assert.match(migration, /backfilled_from', 'customers\.email'/)
  assert.match(migration, /backfilled_from', 'customers\.phone'/)
  assert.match(migration, /backfilled_from', 'customers\.external_id'/)
  assert.match(migration, /lower\(trim\(email\)\)/)
  assert.match(migration, /regexp_replace\(phone, '\\D', '', 'g'\)/)
  assert.match(migration, /on conflict \(company_id, identifier_type, normalized_value\) do nothing/)
  assert.match(migration, /on conflict \(company_id, provider, external_id\) do nothing/)
})

test('shared types expose POS customer identity and resolver contracts', () => {
  assert.match(sharedTypes, /export type PosCustomerIdentifierType = 'email' \| 'phone' \| 'member_number' \| 'qr' \| 'external_ref' \| 'card'/)
  assert.match(sharedTypes, /export type PosCustomerResolutionStatus = 'none' \| 'exact' \| 'candidates'/)
  assert.match(sharedTypes, /export type PosCustomerResolutionSource = 'local' \| 'identity_link' \| 'external_link' \| 'fallback'/)
  assert.match(sharedTypes, /export interface PosCustomerIdentifier/)
  assert.match(sharedTypes, /export interface PosCustomerExternalLink/)
  assert.match(sharedTypes, /export interface PosCustomerResolution/)
})

test('customer hook resolves through identity links with customer-table fallback', () => {
  assert.match(customersHook, /export function useResolvedCustomers/)
  assert.match(customersHook, /queryKey: \['customer-resolution'/)
  assert.match(customersHook, /\.from\('pos_customer_identifiers'\)/)
  assert.match(customersHook, /\.from\('pos_customer_external_links'\)/)
  assert.match(customersHook, /optionalIdentityLinkError/)
  assert.match(customersHook, /Customer identifier table is not migrated yet/)
  assert.match(customersHook, /Customer external-link table is not migrated yet/)
  assert.match(customersHook, /loadDirectCustomerMatches/)
  assert.match(customersHook, /syncCustomerIdentityLinks\(data as Customer\)/)
  assert.match(customersHook, /ignoreDuplicates: true/)
})

test('customer modal uses the resolver path without removing manual add', () => {
  assert.match(customerModal, /useResolvedCustomers/)
  assert.match(customerModal, /resolutionSourceLabel/)
  assert.match(customerModal, /Identity link/)
  assert.match(customerModal, /External link/)
  assert.match(customerModal, /Local fallback/)
  assert.match(customerModal, /resolution\.warnings/)
  assert.match(customerModal, /splitCustomerFullName/)
  assert.match(customerModal, /toPosCustomer/)
  assert.match(customerModal, /Search mobile, full name, email, birthday/)
})
