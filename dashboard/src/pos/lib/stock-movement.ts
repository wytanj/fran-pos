import type { StoreDestination } from '@/pos/data/mock'
import { getActiveStore } from '@/pos/lib/pos-store-config'
import type { SkumsGraphRefs, SkumsPosInventoryEventInput } from '@pos/shared'

export const FLOOR_ADJUSTMENT_REASONS = [
  { code: 'damaged', label: 'Damaged' },
  { code: 'expired', label: 'Expired' },
  { code: 'tester', label: 'Tester' },
  { code: 'other', label: 'Other' },
] as const

export type FloorAdjustmentReason = (typeof FLOOR_ADJUSTMENT_REASONS)[number]['code']

export const FLOOR_ADJUSTMENT_EVENT = 'inventory.damage.reported' as const

export function parseFloorAdjustmentReason(value: string): FloorAdjustmentReason | null {
  const match = FLOOR_ADJUSTMENT_REASONS.find((reason) => reason.code === value)
  return match ? match.code : null
}

export interface StockMovementProduct extends Partial<SkumsGraphRefs> {
  id: string
  sku: string
  name: string
}

export interface PosInventoryEventInput {
  companyId: string | null
  product: StockMovementProduct
  quantity: number
  storageLocationCode: string
  reference: string
  reasonCode: FloorAdjustmentReason
  operatorName: string | null
  occurredAt?: string
  store?: StoreDestination
}

export function createPosInventoryEventPayload(input: PosInventoryEventInput): SkumsPosInventoryEventInput {
  const store = input.store ?? getActiveStore()
  const occurredAt = input.occurredAt ?? new Date().toISOString()

  return {
    event_type: FLOOR_ADJUSTMENT_EVENT,
    source: 'vantage_pos',
    idempotency_key: `${store.code}-${FLOOR_ADJUSTMENT_EVENT}-${input.product.sku}-${occurredAt}`,
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
    note: null,
    occurred_at: occurredAt,
    metadata: {
      company_id: input.companyId,
      operator_name: input.operatorName,
    },
  }
}
