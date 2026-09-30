import type { Product } from '@/pos/data/mock'

/** Complimentary register bag. SKUMS may already stock this SKU. POS does not create it. */
export const PAPER_BAG_SKU = 'FRANBAG'
export const PAPER_BAG_NAME = 'Paper bag'
export const PAPER_BAG_PRICE = 0

const LOCAL_FEE_ID = 'fee-franbag'

type CatalogHit = {
  id: string
  name?: string
  price?: number
  mdPrice?: number
  trackInventory?: boolean
  skums?: Product['skums']
}

export function isPaperBagSku(sku: string | null | undefined) {
  return (sku ?? '').trim().toUpperCase() === PAPER_BAG_SKU
}

export function isPaperBagLine(line: { sku?: string | null; lineKind?: string | null }) {
  return line.lineKind === 'fee' || isPaperBagSku(line.sku)
}

/**
 * Price stays 0.00. A catalog price, including a 0.10 placeholder, is ignored.
 * Graph refs attach only when that catalog row already has track_inventory false.
 * A stock-tracked row, or no row, stays a local fee so the sale cannot decrement inventory.
 */
export function paperBagProduct(catalogProduct?: CatalogHit | null): Product {
  const linked = catalogProduct?.trackInventory === false ? catalogProduct : null
  return {
    id: linked?.id ?? LOCAL_FEE_ID,
    sku: PAPER_BAG_SKU,
    name: catalogProduct?.name?.trim() || PAPER_BAG_NAME,
    category: 'Fee',
    price: PAPER_BAG_PRICE,
    qtyOnHand: 999,
    returnable: false,
    emoji: '',
    trackInventory: false,
    skums: linked?.skums,
  }
}

export function lineCharge(line: {
  sku?: string | null
  lineKind?: string | null
  unitPrice: number
  listPrice: number
  qty: number
  lineDiscount: number
}) {
  if (isPaperBagLine(line)) {
    return { unitPrice: 0, listPrice: 0, discountAmount: 0, lineTotal: 0, nonStock: true }
  }
  const sign = line.qty < 0 ? -1 : 1
  return {
    unitPrice: line.unitPrice,
    listPrice: line.listPrice,
    discountAmount: line.lineDiscount,
    lineTotal: line.unitPrice * line.qty - line.lineDiscount * sign,
    nonStock: false,
  }
}
