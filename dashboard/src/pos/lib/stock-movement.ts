import type { StoreDestination } from '@/pos/data/mock'
import { getActiveStore } from '@/pos/lib/pos-store-config'
import type { SkumsGraphRefs, SkumsPosInventoryEventInput, SkumsPosInventoryEventType } from '@pos/shared'

export type StockInboundReason = 'supplier_delivery' | 'manual_count' | 'transfer_receipt' | 'opening_balance' | 'adjustment'
export type PosFloorInventoryAction = 'damage' | 'found_stock'

export interface StockMovementProduct extends Partial<SkumsGraphRefs> {
  id: string
  sku: string
  name: string
}

export interface StockInboundInput {
  companyId: string | null
  product: StockMovementProduct
  quantity: number
  currentOnHand: number
  storageLocationCode: string
  reference: string
  reason: StockInboundReason
  unitCost: number | null
  note: string | null
  operatorName: string | null
  occurredAt?: string
  store?: StoreDestination
}

export interface StockInboundPayload {
  event: 'inventory.stock_movement.created'
  source: 'vantage_pos'
  movement_type: 'inbound'
  company_id: string | null
  occurred_at: string
  store: {
    id: string
    code: string
    name: string
    inventory_location_id: string
  }
  product: StockMovementProduct
  location: {
    storage_location_code: string
  }
  quantity: number
  balance_before: number
  balance_after: number
  reference: string
  reason: StockInboundReason
  unit_cost: number | null
  note: string | null
  operator_name: string | null
  sync: {
    status: 'pending'
    targets: ['inventory_management_system', 'skums']
  }
}

export interface PosInventoryEventInput {
  eventType: SkumsPosInventoryEventType
  companyId: string | null
  product: StockMovementProduct
  quantity: number
  storageLocationCode: string
  reference: string
  reasonCode: string
  note: string | null
  operatorName: string | null
  occurredAt?: string
  store?: StoreDestination
}

export function createStockInboundPayload(input: StockInboundInput): StockInboundPayload {
  const store = input.store ?? getActiveStore()
  const occurredAt = input.occurredAt ?? new Date().toISOString()

  return {
    event: 'inventory.stock_movement.created',
    source: 'vantage_pos',
    movement_type: 'inbound',
    company_id: input.companyId,
    occurred_at: occurredAt,
    store: {
      id: store.id,
      code: store.code,
      name: store.name,
      inventory_location_id: store.inventoryLocationId,
    },
    product: input.product,
    location: {
      storage_location_code: input.storageLocationCode,
    },
    quantity: input.quantity,
    balance_before: input.currentOnHand,
    balance_after: input.currentOnHand + input.quantity,
    reference: input.reference,
    reason: input.reason,
    unit_cost: input.unitCost,
    note: input.note,
    operator_name: input.operatorName,
    sync: {
      status: 'pending',
      targets: ['inventory_management_system', 'skums'],
    },
  }
}

export function createPosInventoryEventPayload(input: PosInventoryEventInput): SkumsPosInventoryEventInput {
  const store = input.store ?? getActiveStore()
  const occurredAt = input.occurredAt ?? new Date().toISOString()

  return {
    event_type: input.eventType,
    source: 'vantage_pos',
    idempotency_key: `${store.code}-${input.eventType}-${input.product.sku}-${occurredAt}`,
    pos_location_code: store.code,
    inventory_location_id: store.inventoryLocationId,
    store: {
      code: store.code,
      name: store.name,
      inventory_location_id: store.inventoryLocationId,
    },
    product: {
      id: input.product.product_id ?? null,
      sku: input.product.sku,
      name: input.product.name,
      product_identity_id: input.product.product_identity_id ?? null,
      trade_unit_id: input.product.trade_unit_id ?? null,
      listing_id: input.product.listing_id ?? null,
      channel_id: input.product.channel_id ?? null,
      sku_assignment_id: input.product.sku_assignment_id ?? null,
      identifier_id: input.product.identifier_id ?? null,
      product_id: input.product.product_id ?? null,
      variant_id: input.product.variant_id ?? null,
      batch_id: input.product.batch_id ?? null,
    },
    sku: input.product.sku,
    product_identity_id: input.product.product_identity_id ?? null,
    trade_unit_id: input.product.trade_unit_id ?? null,
    listing_id: input.product.listing_id ?? null,
    channel_id: input.product.channel_id ?? null,
    sku_assignment_id: input.product.sku_assignment_id ?? null,
    identifier_id: input.product.identifier_id ?? null,
    product_id: input.product.product_id ?? null,
    variant_id: input.product.variant_id ?? null,
    batch_id: input.product.batch_id ?? null,
    quantity: input.quantity,
    storage_location_code: input.storageLocationCode,
    reason_code: input.reasonCode,
    reference: input.reference,
    note: input.note,
    occurred_at: occurredAt,
    metadata: {
      company_id: input.companyId,
      operator_name: input.operatorName,
    },
  }
}
