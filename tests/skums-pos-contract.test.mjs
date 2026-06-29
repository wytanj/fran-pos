import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const sharedTypes = readFileSync(new URL('../packages/shared/src/types/skums.ts', import.meta.url), 'utf8')
const sharedIndex = readFileSync(new URL('../packages/shared/src/index.ts', import.meta.url), 'utf8')
const posContext = readFileSync(new URL('../dashboard/src/pos/lib/pos-context.tsx', import.meta.url), 'utf8')
const salePage = readFileSync(new URL('../dashboard/src/pos/pages/sale.tsx', import.meta.url), 'utf8')
const mockData = readFileSync(new URL('../dashboard/src/pos/data/mock.ts', import.meta.url), 'utf8')
const adapter = readFileSync(new URL('../dashboard/src/pos/lib/skums-sale-adapter.ts', import.meta.url), 'utf8')
const saleSync = readFileSync(new URL('../dashboard/src/pos/lib/skums-sale-sync.ts', import.meta.url), 'utf8')
const client = readFileSync(new URL('../dashboard/src/pos/lib/skums-client.ts', import.meta.url), 'utf8')
const connector = readFileSync(new URL('../dashboard/src/pos/lib/skums-connector.ts', import.meta.url), 'utf8')
const productsPage = readFileSync(new URL('../dashboard/src/pages/products.tsx', import.meta.url), 'utf8')
const stockMovement = readFileSync(new URL('../dashboard/src/pos/lib/stock-movement.ts', import.meta.url), 'utf8')

test('shared package exports SKUMS POS graph contracts', () => {
  assert.match(sharedIndex, /export \* from '\.\/types\/skums\.js'/)

  for (const field of [
    'product_identity_id',
    'trade_unit_id',
    'listing_id',
    'channel_id',
    'sku_assignment_id',
    'identifier_id',
    'product_id',
    'variant_id',
    'batch_id',
  ]) {
    assert.match(sharedTypes, new RegExp(`${field}: string \\| null`))
  }

  assert.match(sharedTypes, /export interface SkumsPosScanResolution/)
  assert.match(sharedTypes, /match_status: 'none' \| 'single' \| 'ambiguous'/)
  assert.match(sharedTypes, /export interface SkumsPosCatalogItem extends SkumsGraphRefs/)
  assert.match(sharedTypes, /pos_enabled: boolean/)
  assert.match(sharedTypes, /storage_location_code: string \| null/)
  assert.match(sharedTypes, /revision_id\?: string \| null/)
  assert.match(sharedTypes, /export interface SkumsPosCatalogRevision/)
  assert.match(sharedTypes, /export interface SkumsPosAttentionState/)
  assert.match(sharedTypes, /export interface SkumsPosProposalState/)
  assert.match(sharedTypes, /export interface SkumsPosSaleInput/)
  assert.match(sharedTypes, /idempotency_key: string/)
  assert.match(sharedTypes, /export interface SkumsPosSaleResponse/)
  assert.match(sharedTypes, /line_ids: string\[\]/)
  assert.match(sharedTypes, /domain_event_ids: string\[\]/)
  assert.match(sharedTypes, /execution_log_ids: string\[\]/)
  assert.match(sharedTypes, /export type SkumsPosInventoryEventType/)
  assert.match(sharedTypes, /export interface SkumsPosInventoryEventInput extends Partial<SkumsGraphRefs>/)
  assert.match(sharedTypes, /export interface SkumsPosInventoryEventResponse/)
})

test('POS cart lines carry optional SKUMS graph references without breaking mock mode', () => {
  assert.match(posContext, /import type \{ SkumsGraphRefs \} from '@pos\/shared'/)
  assert.match(posContext, /export interface CartLine extends Partial<SkumsGraphRefs>/)
  assert.match(posContext, /const emptyGraphRefs = \(\): SkumsGraphRefs =>/)
  assert.match(posContext, /\.\.\.emptyGraphRefs\(\),/)
  assert.match(posContext, /\.\.\.p\.skums,/)
  assert.match(mockData, /skums\?: Partial<SkumsGraphRefs>/)
  assert.match(mockData, /storeLocationCode\?: string \| null/)
  assert.match(posContext, /storeLocationCode: p\.storeLocationCode \?\? storeLocationCodeForSku\(p\.sku\)/)
})

test('sale adapter maps completed POS sales into SKUMS sale payloads', () => {
  assert.match(adapter, /export function toSkumsPosSaleInput\(sale: CompletedSale\): SkumsPosSaleInput/)
  assert.match(adapter, /export function buildSkumsSaleIdempotencyKey/)
  assert.match(adapter, /POS_REGISTER_CODE/)
  assert.match(adapter, /receipt_number: sale\.receiptNo/)
  assert.match(adapter, /idempotency_key: idempotencyKey/)
  assert.match(adapter, /completed_at: sale\.completedAtIso/)
  assert.match(adapter, /sale_type: sale\.isExchange \? 'exchange' : 'sale'/)
  assert.match(adapter, /product_identity_id: line\.product_identity_id \?\? null/)
  assert.match(adapter, /trade_unit_id: line\.trade_unit_id \?\? null/)
  assert.match(adapter, /sku_assignment_id: line\.sku_assignment_id \?\? null/)
  assert.match(adapter, /identifier_id: line\.identifier_id \?\? null/)
  assert.match(adapter, /line_type: line\.qty < 0 \? 'return' : 'sale'/)
  assert.match(adapter, /payment_method: payment\.mode/)
  assert.match(adapter, /provider_metadata: payment\.providerMetadata \?\? \{\}/)
  assert.match(adapter, /store_location_code: line\.storeLocationCode \?\? null/)
  assert.match(adapter, /inventory_location_id: STORE\.inventoryLocationId/)
})

test('SKUMS client targets POS scan and sale API endpoints with account connector settings', () => {
  assert.match(connector, /export function toSkumsConnectorConfig/)
  assert.match(connector, /skums_connector/)
  assert.match(client, /configOrThrow\(connector\)/)
  assert.match(client, /authorization: `Bearer \$\{config\.apiKey\}`/)
  assert.match(client, /'x-api-key': config\.apiKey/)
  assert.match(client, /SKUMS request failed \(\$\{res\.status\}\):/)
  assert.match(client, /export async function listSkumsPosCatalog/)
  assert.match(client, /Math\.min\(Math\.max\(params\.limit, 1\), 250\)/)
  assert.match(client, /export async function createSkumsPosInventoryEvent/)
  assert.match(client, /SKUMS POS sale writes require an idempotency key/)
  assert.match(sharedTypes, /has_more\?: boolean/)
  assert.match(sharedTypes, /next_offset\?: number \| null/)
  assert.match(client, /\$\{config\.apiUrl\}\/api\/v1\/pos\/catalog/)
  assert.match(client, /\$\{config\.apiUrl\}\/api\/v1\/pos\/scan/)
  assert.match(client, /\$\{config\.apiUrl\}\/api\/v1\/pos\/sales/)
  assert.match(client, /\$\{config\.apiUrl\}\/api\/v1\/pos\/inventory-events/)
  assert.match(client, /body: JSON\.stringify\(\{ identifier, \.\.\.context \}\)/)
  assert.match(client, /body: JSON\.stringify\(input\)/)
})

test('SKUMS sale writes are queued locally and retried with the same idempotency key', () => {
  assert.match(saleSync, /pendingSkumsSaleStorageKey = 'pos_pending_skums_sales'/)
  assert.match(saleSync, /toSkumsPosSaleInput\(sale\)/)
  assert.match(saleSync, /upsertQueuedWrite\(sale, payload, 'syncing', null\)/)
  assert.match(saleSync, /createSkumsPosSale\(payload, connector\)/)
  assert.match(saleSync, /removeQueuedWrite\(payload\.idempotency_key\)/)
  assert.match(saleSync, /queuedSaleSyncState\(payload\.idempotency_key, err\)/)
  assert.match(saleSync, /export async function retryPendingSkumsSaleWrites/)
})

test('POS stock movement helpers build SKUMS inventory event payloads without treating local product IDs as canonical', () => {
  assert.match(stockMovement, /export type PosFloorInventoryAction = 'damage' \| 'found_stock'/)
  assert.match(stockMovement, /export function createPosInventoryEventPayload/)
  assert.match(stockMovement, /event_type: input\.eventType/)
  assert.match(stockMovement, /idempotency_key: `\$\{store\.code\}-\$\{input\.eventType\}-\$\{input\.product\.sku\}-\$\{occurredAt\}`/)
  assert.match(stockMovement, /pos_location_code: store\.code/)
  assert.match(stockMovement, /inventory_location_id: store\.inventoryLocationId/)
  assert.match(stockMovement, /product_id: input\.product\.product_id \?\? null/)
})

test('POS sale page can load SKUMS catalog while retaining mock fallback', () => {
  assert.match(salePage, /useSkumsConnector/)
  assert.match(salePage, /listSkumsPosCatalog/)
  assert.match(salePage, /resolveSkumsPosScan/)
  assert.match(salePage, /syncSkumsSaleWrite/)
  assert.match(salePage, /retryPendingSkumsSaleWrites/)
  assert.match(salePage, /toPosProduct\(item: SkumsPosCatalogItem\): Product/)
  assert.match(salePage, /normalizeStoreStorageLocationCode\(item\.storage_location_code\)/)
  assert.match(salePage, /useState<Product\[\]>\(PRODUCTS\)/)
  assert.match(salePage, /setCatalogSource\('skums'\)/)
  assert.match(salePage, /skumsSync=\{saleSync\}/)
  assert.match(salePage, /pendingSkumsSaleWrites=\{pendingSaleWrites\}/)
  assert.match(productsPage, /SKUMS Connector/)
})
