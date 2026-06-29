import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(new URL('../supabase/migrations/00007_create_pos_source_outbox.sql', import.meta.url), 'utf8')
const sharedTypes = readFileSync(new URL('../packages/shared/src/types/database.ts', import.meta.url), 'utf8')
const outbox = readFileSync(new URL('../dashboard/src/pos/lib/pos-outbox.ts', import.meta.url), 'utf8')
const salePage = readFileSync(new URL('../dashboard/src/pos/pages/sale.tsx', import.meta.url), 'utf8')
const returnsPage = readFileSync(new URL('../dashboard/src/pos/pages/returns.tsx', import.meta.url), 'utf8')

test('POS source fact migration creates durable sales, returns, and outbox tables', () => {
  for (const table of [
    'public.pos_sales',
    'public.pos_sale_lines',
    'public.pos_returns',
    'public.pos_return_lines',
    'public.pos_outbox_events',
  ]) {
    assert.match(migration, new RegExp(`create table if not exists ${table.replace('.', '\\.')}`))
    assert.match(migration, new RegExp(`alter table ${table.replace('.', '\\.')} enable row level security`))
  }

  for (const eventType of [
    'pos.customer.attached',
    'pos.sale.completed',
    'pos.return.completed',
    'pos.reward.redeem_requested',
    'pos.reward.refund_requested',
  ]) {
    assert.match(migration, new RegExp(eventType.replaceAll('.', '\\.')))
  }

  assert.match(migration, /unique\(company_id, idempotency_key\)/)
  assert.match(migration, /pos_outbox_events_status_idx/)
  assert.match(migration, /Users can insert POS outbox events in their company/)
  assert.match(migration, /Users can update POS outbox events in their company/)
})

test('shared types expose provider-neutral POS source event contracts', () => {
  assert.match(sharedTypes, /export type PosSourceEventType =/)
  assert.match(sharedTypes, /export type PosOutboxEventStatus = 'queued' \| 'sent' \| 'acked' \| 'failed'/)
  assert.match(sharedTypes, /export interface PosSourceEventEnvelope/)
  assert.match(sharedTypes, /source_system: 'pos'/)
  assert.match(sharedTypes, /workspace_id: string/)
  assert.match(sharedTypes, /idempotency_key: string/)
  assert.match(sharedTypes, /payload: PosSourceEventEnvelope/)
  assert.match(sharedTypes, /export interface PosSale/)
  assert.match(sharedTypes, /export interface PosReturn/)
})

test('POS outbox builder emits replay-safe sale, return, and customer events', () => {
  assert.match(outbox, /export const POS_OUTBOX_SCHEMA_VERSION = 1/)
  assert.match(outbox, /pendingPosOutboxStorageKey = 'pos_pending_source_events'/)
  assert.match(outbox, /export function buildPosOutboxIdempotencyKey/)
  assert.match(outbox, /'pos',/)
  assert.match(outbox, /keyPart\(sale\.storeCode \|\| STORE\.code\)/)
  assert.match(outbox, /keyPart\(sale\.registerCode\)/)
  assert.match(outbox, /keyPart\(sale\.receiptNo\)/)
  assert.match(outbox, /event_id: eventIdFor\(idempotencyKey\)/)
  assert.match(outbox, /source_system: 'pos'/)
  assert.match(outbox, /schema_version: POS_OUTBOX_SCHEMA_VERSION/)
  assert.match(outbox, /customer_key: `pos:\$\{sale\.customer\.id\}`/)
  assert.match(outbox, /buildPosSaleCompletedEvent/)
  assert.match(outbox, /buildPosReturnCompletedEvent/)
  assert.match(outbox, /buildPosCustomerAttachedEvent/)
  assert.match(outbox, /export function toPosOutboxRow/)
  assert.match(outbox, /aggregate_type: aggregate\.aggregateType/)
  assert.match(outbox, /aggregate_id: aggregate\.aggregateId/)
  assert.match(outbox, /saleLines\.map\(\(line, index\) => linePayload\(line, index \+ 1\)\)/)
  assert.match(outbox, /returnLines\.map\(\(line, index\) => linePayload\(line, index \+ 1\)\)/)
})

test('POS outbox persists to Supabase with local fallback and idempotent retry', () => {
  assert.match(outbox, /readPendingEvents/)
  assert.match(outbox, /writePendingEvents/)
  assert.match(outbox, /export function pendingPosOutboxEventCount/)
  assert.match(outbox, /export function listPendingPosOutboxEvents/)
  assert.match(outbox, /export function enqueuePosOutboxEvents/)
  assert.match(outbox, /new Map\(existing\.map\(\(event\) => \[event\.idempotency_key, event\]\)\)/)
  assert.match(outbox, /byKey\.set\(event\.idempotency_key, event\)/)
  assert.match(outbox, /\.slice\(-100\)/)
  assert.match(outbox, /export function removePendingPosOutboxEvent/)
  assert.match(outbox, /export async function persistPosOutboxEvents/)
  assert.match(outbox, /enqueuePosOutboxEvents\(events\)/)
  assert.match(outbox, /\.from\('pos_outbox_events'\)/)
  assert.match(outbox, /\.upsert\(events\.map\(\(event\) => toPosOutboxRow\(companyId, event\)\), \{/)
  assert.match(outbox, /onConflict: 'company_id,idempotency_key'/)
  assert.match(outbox, /ignoreDuplicates: true/)
  assert.match(outbox, /removePendingPosOutboxEvent\(event\.idempotency_key\)/)
  assert.match(outbox, /export async function retryPendingPosOutboxEvents/)
})

test('sale and return completion paths persist POS source events without blocking checkout', () => {
  assert.match(salePage, /buildPosOutboxEventsForCompletedSale/)
  assert.match(salePage, /persistPosOutboxEvents/)
  assert.match(salePage, /workspaceId: company\?\.id \?\? 'demo'/)
  assert.match(salePage, /actorId: pos\.user\?\.staffMemberId \?\? pos\.user\?\.id \?\? null/)
  assert.match(salePage, /const sale = completeSale\(\{[\s\S]*void persistPosOutboxEvents\(company\?\.id, outboxEvents\)/)

  assert.match(returnsPage, /buildPosOutboxEventsForCompletedSale/)
  assert.match(returnsPage, /persistPosOutboxEvents/)
  assert.match(returnsPage, /const \{ company \} = useAuth\(\)/)
  assert.match(returnsPage, /workspaceId: company\?\.id \?\? 'demo'/)
  assert.match(returnsPage, /const sale: CompletedSale = \{[\s\S]*void persistPosOutboxEvents\(company\?\.id, outboxEvents\)/)
})
