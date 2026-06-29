import type { SkumsGraphRefs } from '@pos/shared'

// Mock data for the POS terminal demo. All values are fictional and self-contained
// so the demo runs with `npm run dev` without any backend or login.

export interface StoreDestination {
  id: string
  name: string
  code: string
  inventoryLocationId: string
  address: string
  phone: string
  gst: string
  currency: string
}

export const STORE: StoreDestination = {
  id: 'fran-store-orchard',
  name: 'Fran Beauty Orchard',
  code: 'FRAN01',
  inventoryLocationId: 'fran-inv-orchard',
  address: '391 Orchard Road, #01-12 Ngee Ann City, Singapore 238872',
  phone: '+65 6733 1188',
  gst: 'GST Reg No. 201912345A',
  currency: 'SGD',
}

export const STORE_STORAGE_LOCATION_PATTERN = /^[A-Z]{1,2}(?:0[1-9]|[1-9][0-9]|100)$/

export function normalizeStoreStorageLocationCode(value: unknown) {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toUpperCase()
  return STORE_STORAGE_LOCATION_PATTERN.test(normalized) ? normalized : null
}

export const STORE_STORAGE_BUCKETS = [
  { storeCode: STORE.code, code: 'A01', label: 'A zone 01' },
  { storeCode: STORE.code, code: 'A02', label: 'A zone 02' },
  { storeCode: STORE.code, code: 'B01', label: 'B zone 01' },
  { storeCode: STORE.code, code: 'B02', label: 'B zone 02' },
  { storeCode: STORE.code, code: 'C01', label: 'C zone 01' },
  { storeCode: STORE.code, code: 'C02', label: 'C zone 02' },
  { storeCode: STORE.code, code: 'D01', label: 'D zone 01' },
  { storeCode: STORE.code, code: 'D02', label: 'D zone 02' },
  { storeCode: STORE.code, code: 'D03', label: 'D zone 03' },
  { storeCode: STORE.code, code: 'AA01', label: 'AA zone 01' },
  { storeCode: STORE.code, code: 'AA02', label: 'AA zone 02' },
  { storeCode: STORE.code, code: 'AA03', label: 'AA zone 03' },
] as const

export type PosRole = 'cashier' | 'manager'

export interface PosUser {
  id: string
  name: string
  pin: string
  role: PosRole
  staffMemberId?: string
  sessionId?: string
  sourceProvider?: string
  employmentType?: string | null
  isEor?: boolean
}

export const USERS: PosUser[] = [
  { id: 'u-cashier', name: 'Aisyah Rahman', pin: '1111', role: 'cashier' },
  { id: 'u-manager', name: 'Daniel Wong', pin: '9999', role: 'manager' },
]

export interface Product {
  id: string
  sku: string
  name: string
  category: string
  storeLocationCode?: string | null
  price: number
  /** Markdown / Stock Sales Specials price. When set, this is the live price. */
  mdPrice?: number
  qtyOnHand: number
  returnable: boolean
  emoji: string
  skums?: Partial<SkumsGraphRefs>
}

export const CATEGORIES = ['All', 'Skincare', 'Makeup', 'Haircare', 'Fragrance', 'Tools']

const PRODUCT_STORE_LOCATION_CODES: Record<string, string> = {
  'SKN-1001': 'A01',
  'SKN-1002': 'A01',
  'SKN-1003': 'A02',
  'SKN-1004': 'A02',
  'SKN-1005': 'B01',
  'SKN-1006': 'B01',
  'SKN-1007': 'B02',
  'MKP-2001': 'C01',
  'MKP-2002': 'C01',
  'MKP-2003': 'C02',
  'HAI-3001': 'D01',
  'HAI-3002': 'D02',
  'HAI-3003': 'D03',
  'FRG-4001': 'AA01',
  'FRG-4002': 'AA02',
  'TOL-5001': 'AA03',
}

export function storeLocationCodeForSku(sku: string | null | undefined) {
  return sku ? normalizeStoreStorageLocationCode(PRODUCT_STORE_LOCATION_CODES[sku]) : null
}

export const PRODUCTS: Product[] = [
  { id: 'p1', sku: 'SKN-1001', name: 'Hydra Veil Gel Cleanser', category: 'Skincare', price: 38.0, qtyOnHand: 36, returnable: true, emoji: '🧴' },
  { id: 'p2', sku: 'SKN-1002', name: 'Barrier Calm Serum', category: 'Skincare', price: 78.0, qtyOnHand: 24, returnable: true, emoji: '💧' },
  { id: 'p3', sku: 'SKN-1003', name: 'Bright C Renewal Essence', category: 'Skincare', price: 96.0, mdPrice: 72.0, qtyOnHand: 14, returnable: false, emoji: '✨' },
  { id: 'p4', sku: 'SKN-1004', name: 'Squalane Cloud Moisturiser', category: 'Skincare', price: 64.0, qtyOnHand: 31, returnable: true, emoji: '🧴' },
  { id: 'p5', sku: 'SKN-1005', name: 'Mineral Silk Sunscreen SPF50', category: 'Skincare', price: 52.0, qtyOnHand: 42, returnable: true, emoji: '☀️' },
  { id: 'p6', sku: 'SKN-1006', name: 'Overnight Repair Mask', category: 'Skincare', price: 88.0, mdPrice: 66.0, qtyOnHand: 8, returnable: false, emoji: '🌙' },
  { id: 'p7', sku: 'SKN-1007', name: 'Peptide Eye Cream', category: 'Skincare', price: 74.0, qtyOnHand: 19, returnable: true, emoji: '👁️' },
  { id: 'p8', sku: 'MKP-2001', name: 'Cushion Skin Tint', category: 'Makeup', price: 58.0, qtyOnHand: 28, returnable: true, emoji: '🪞' },
  { id: 'p9', sku: 'MKP-2002', name: 'Lip Tint Balm', category: 'Makeup', price: 32.0, mdPrice: 24.0, qtyOnHand: 56, returnable: false, emoji: '💄' },
  { id: 'p10', sku: 'MKP-2003', name: 'Brow Shape Gel', category: 'Makeup', price: 34.0, qtyOnHand: 33, returnable: true, emoji: '🪄' },
  { id: 'p11', sku: 'HAI-3001', name: 'Scalp Reset Shampoo', category: 'Haircare', price: 42.0, qtyOnHand: 27, returnable: true, emoji: '🫧' },
  { id: 'p12', sku: 'HAI-3002', name: 'Gloss Repair Conditioner', category: 'Haircare', price: 44.0, qtyOnHand: 25, returnable: true, emoji: '🫧' },
  { id: 'p13', sku: 'HAI-3003', name: 'Camellia Hair Oil', category: 'Haircare', price: 48.0, qtyOnHand: 18, returnable: true, emoji: '💧' },
  { id: 'p14', sku: 'FRG-4001', name: 'Neroli Eau de Parfum', category: 'Fragrance', price: 128.0, qtyOnHand: 12, returnable: true, emoji: '🌸' },
  { id: 'p15', sku: 'FRG-4002', name: 'Refillable Travel Atomizer', category: 'Fragrance', price: 28.0, qtyOnHand: 44, returnable: true, emoji: '🧪' },
  { id: 'p16', sku: 'TOL-5001', name: 'Facial Cleansing Brush', category: 'Tools', price: 36.0, mdPrice: 29.0, qtyOnHand: 16, returnable: false, emoji: '🪥' },
].map((product) => ({
  ...product,
  storeLocationCode: storeLocationCodeForSku(product.sku),
}))

export interface Customer {
  id: string
  name: string
  email: string
  phone: string
  birthday?: string | null
  tier: string
  points: number
  storeCredit: number
  giftCardBalance: number
  giftCardNo?: string
  source?: string
  externalId?: string | null
}

export const CUSTOMERS: Customer[] = [
  { id: 'c1', name: 'Wei Ling Tan', email: 'weiling.tan@email.com', phone: '+65 9123 4567', birthday: '1990-08-14', tier: 'Gold', points: 4280, storeCredit: 25.5, giftCardBalance: 100.0, giftCardNo: 'GC-8842-0091', source: 'demo' },
  { id: 'c2', name: 'Marcus Lee', email: 'marcus.lee@email.com', phone: '+65 9876 5432', birthday: '1988-03-02', tier: 'Silver', points: 1150, storeCredit: 0, giftCardBalance: 0, source: 'demo' },
  { id: 'c3', name: 'Priya Nair', email: 'priya.nair@email.com', phone: '+65 8234 1100', birthday: '1994-11-21', tier: 'Platinum', points: 9640, storeCredit: 80.0, giftCardBalance: 50.0, giftCardNo: 'GC-1190-7733', source: 'demo' },
]

export type SalesType = 'normal' | 'sponsorship' | 'staff' | 'vm-writeoff' | 'influencer'

export const SALES_TYPES: { value: SalesType; label: string; hint: string; requiresManager: boolean }[] = [
  { value: 'normal', label: 'Normal Sale', hint: 'Standard retail transaction', requiresManager: false },
  { value: 'sponsorship', label: 'Sponsorship', hint: 'Goods sponsored to event / partner', requiresManager: true },
  { value: 'staff', label: 'Staff Purchase', hint: 'Staff discount entitlement applies', requiresManager: true },
  { value: 'vm-writeoff', label: 'VM Write-off', hint: 'Visual merchandising / display write-off', requiresManager: true },
  { value: 'influencer', label: 'Influencer', hint: 'Influencer gifting / seeding', requiresManager: true },
]

export const PAYMENT_MODES = [
  { id: 'cash', label: 'Cash', icon: 'Banknote' },
  { id: 'card', label: 'Credit / Debit', icon: 'CreditCard' },
  { id: 'square_pos', label: 'Square POS', icon: 'CreditCard' },
  { id: 'paynow', label: 'PayNow QR', icon: 'QrCode' },
  { id: 'store-credit', label: 'Store Credit', icon: 'Wallet' },
  { id: 'gift-card', label: 'Gift Card', icon: 'Gift' },
  { id: 'misc', label: 'Misc / Exchange', icon: 'Shuffle' },
] as const

export type PaymentModeId = (typeof PAYMENT_MODES)[number]['id']

export const CARD_TYPES = ['Visa', 'Mastercard', 'Amex', 'NETS', 'UnionPay'] as const

// Manual discount keywords configured for this company (Item 4 in checklist).
export const DISCOUNT_REASONS = [
  { code: 'STAFF15', label: 'Staff Discount 15%', type: 'percent', value: 15 },
  { code: 'FRIEND10', label: 'Friends & Family 10%', type: 'percent', value: 10 },
  { code: 'DAMAGE', label: 'Display / Minor Damage', type: 'percent', value: 20 },
  { code: 'PRICEMATCH', label: 'Price Match', type: 'amount', value: 0 },
  { code: 'GOODWILL', label: 'Customer Goodwill', type: 'amount', value: 0 },
] as const

export const RETURN_REASONS = [
  'Shade mismatch',
  'Skin reaction concern',
  'Changed mind',
  'Faulty / defective',
  'Leaked or damaged packaging',
  'Gift return',
  'Other',
]

export const PRICE_OVERRIDE_REASONS = [
  'Competitor price match',
  'Manager goodwill',
  'Mislabelled ticket',
  'Display unit',
  'Bulk purchase',
]

// Active promotion the engine would surface during a sale (Item 5).
export const ACTIVE_PROMOTION = {
  code: 'SKINCARE-DUO',
  title: 'Skincare duo: 2nd item 30% off',
  description: 'Buy any 2 skincare products, the lower-priced one is 30% off.',
  category: 'Skincare',
}

export interface PastTransaction {
  receiptNo: string
  date: string
  cashier: string
  customer?: string
  type: 'Sale' | 'Refund' | 'Exchange'
  total: number
  payment: string
  items: { sku: string; name: string; qty: number; price: number }[]
  returnable: boolean
}

export const PAST_TRANSACTIONS: PastTransaction[] = [
  {
    receiptNo: 'FRAN01-000482',
    date: '2026-05-21 11:42',
    cashier: 'Aisyah Rahman',
    customer: 'Wei Ling Tan',
    type: 'Sale',
    total: 138.0,
    payment: 'Visa ****4421',
    returnable: true,
    items: [
      { sku: 'SKN-1002', name: 'Barrier Calm Serum', qty: 1, price: 78.0 },
      { sku: 'SKN-1005', name: 'Mineral Silk Sunscreen SPF50', qty: 1, price: 52.0 },
    ],
  },
  {
    receiptNo: 'FRAN01-000481',
    date: '2026-05-21 10:18',
    cashier: 'Aisyah Rahman',
    type: 'Sale',
    total: 24.0,
    payment: 'Cash',
    returnable: true,
    items: [{ sku: 'MKP-2002', name: 'Lip Tint Balm', qty: 1, price: 24.0 }],
  },
  {
    receiptNo: 'FRAN01-000480',
    date: '2026-05-20 17:55',
    cashier: 'Daniel Wong',
    customer: 'Priya Nair',
    type: 'Sale',
    total: 200.0,
    payment: 'Mastercard ****8830 + Gift Card',
    returnable: true,
    items: [
      { sku: 'FRG-4001', name: 'Neroli Eau de Parfum', qty: 1, price: 128.0 },
      { sku: 'SKN-1003', name: 'Bright C Renewal Essence', qty: 1, price: 72.0 },
    ],
  },
  {
    receiptNo: 'FRAN01-000478',
    date: '2026-05-20 14:09',
    cashier: 'Aisyah Rahman',
    type: 'Refund',
    total: -42.0,
    payment: 'Cash refund',
    returnable: false,
    items: [{ sku: 'HAI-3001', name: 'Scalp Reset Shampoo', qty: -1, price: 42.0 }],
  },
]

export interface Transfer {
  id: string
  type: 'inbound' | 'outbound'
  ref: string
  fromStoreCode: string
  toStoreCode: string
  from: string
  to: string
  status: 'In Transit' | 'Pending Receipt' | 'Received' | 'Draft' | 'Sent'
  created: string
  lines: { sku: string; name: string; qty: number }[]
}

export const TRANSFERS: Transfer[] = [
  {
    id: 't1',
    type: 'inbound',
    ref: 'STN-INB-20514',
    fromStoreCode: 'WH01',
    toStoreCode: STORE.code,
    from: 'Central Fulfilment (WH01)',
    to: 'Fran Beauty Orchard (FRAN01)',
    status: 'Pending Receipt',
    created: '2026-05-20',
    lines: [
      { sku: 'SKN-1004', name: 'Squalane Cloud Moisturiser', qty: 12 },
      { sku: 'SKN-1005', name: 'Mineral Silk Sunscreen SPF50', qty: 18 },
      { sku: 'FRG-4001', name: 'Neroli Eau de Parfum', qty: 6 },
    ],
  },
  {
    id: 't2',
    type: 'inbound',
    ref: 'STN-INB-20498',
    fromStoreCode: 'FRAN02',
    toStoreCode: STORE.code,
    from: 'Fran Beauty Vivocity (FRAN02)',
    to: 'Fran Beauty Orchard (FRAN01)',
    status: 'In Transit',
    created: '2026-05-19',
    lines: [{ sku: 'TOL-5001', name: 'Facial Cleansing Brush', qty: 8 }],
  },
  {
    id: 't3',
    type: 'outbound',
    ref: 'ITR-OUT-30221',
    fromStoreCode: STORE.code,
    toStoreCode: 'WH01',
    from: 'Fran Beauty Orchard (FRAN01)',
    to: 'Central Fulfilment (WH01)',
    status: 'Sent',
    created: '2026-05-18',
    lines: [{ sku: 'SKN-1002', name: 'Barrier Calm Serum', qty: 3 }],
  },
]

export const INTEGRATIONS = [
  { from: 'POS', to: 'Receipt printer', flow: 'Thermal receipt printing', status: 'Coming soon', lastSync: 'Planned' },
  { from: 'POS', to: 'Barcode scanner', flow: 'Barcode and QR scan input', status: 'Coming soon', lastSync: 'Planned' },
  { from: 'POS', to: 'Cash drawer', flow: 'Drawer kick on cash payment', status: 'Coming soon', lastSync: 'Planned' },
  { from: 'POS', to: 'Payment terminal', flow: 'Card terminal handoff', status: 'Coming soon', lastSync: 'Planned' },
  { from: 'POS', to: 'Customer display', flow: 'Cart and total display', status: 'Coming soon', lastSync: 'Planned' },
  { from: 'POS', to: 'Label printer', flow: 'Shelf and barcode labels', status: 'Coming soon', lastSync: 'Planned' },
]

export const TAX_RATE = 0.09 // GST 9% (inclusive)
export const POINTS_PER_DOLLAR = 1

export const TOP_SELLERS = [
  { sku: 'SKN-1005', name: 'Mineral Silk Sunscreen SPF50', units: 142, revenue: 7384 },
  { sku: 'SKN-1002', name: 'Barrier Calm Serum', units: 98, revenue: 7644 },
  { sku: 'MKP-2002', name: 'Lip Tint Balm', units: 86, revenue: 2752 },
  { sku: 'HAI-3001', name: 'Scalp Reset Shampoo', units: 64, revenue: 2688 },
  { sku: 'FRG-4001', name: 'Neroli Eau de Parfum', units: 31, revenue: 3968 },
]
