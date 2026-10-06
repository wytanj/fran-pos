export const GIFT_CARD_TENDER = 'gift-card'
export const STORE_CREDIT_TENDER = 'store-credit'

const DEMO_GIFT_BALANCES_KEY = 'pos_demo_gift_balances'

export interface TenderSlice {
  mode: string
  amount: number
}

export interface RedeemQuote {
  available: number
  maxRedeem: number
}

export interface GiftCardSettlement {
  giftCardNo: string | null
  redeemed: number
  remaining: number | null
}

export interface MetadataGiftCard {
  giftCardNo: string | null
  balance: number
}

export function roundMoney(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function storedValueQuote(input: {
  balance: number
  tenders: TenderSlice[]
  mode: string
  saleRemaining: number
}): RedeemQuote {
  const balance = roundMoney(Math.max(0, input.balance))
  const spent = roundMoney(
    input.tenders
      .filter((tender) => tender.mode === input.mode)
      .reduce((sum, tender) => sum + (Number.isFinite(tender.amount) ? tender.amount : 0), 0),
  )
  const available = roundMoney(Math.max(0, balance - spent))
  const saleRemaining = roundMoney(Math.max(0, input.saleRemaining))
  return { available, maxRedeem: roundMoney(Math.min(available, saleRemaining)) }
}

export function giftCardQuote(input: {
  balance: number
  tenders: TenderSlice[]
  saleRemaining: number
}): RedeemQuote {
  return storedValueQuote({ ...input, mode: GIFT_CARD_TENDER })
}

export function remainingAfter(available: number, amount: number) {
  const redeem = roundMoney(Math.max(0, amount))
  return roundMoney(Math.max(0, roundMoney(available) - redeem))
}

export function nextTenderAmount(current: string, key: string, replacePrefill: boolean) {
  if (replacePrefill) {
    return { amount: key === '.' ? '0.' : key, replacePrefill: false }
  }
  if (key === '.' && current.includes('.')) return { amount: current, replacePrefill: false }
  return { amount: current + key, replacePrefill: false }
}

function metadataRecord(metadata: unknown): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  return Object.fromEntries(Object.entries(metadata))
}

function metadataNumber(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key]
  if (typeof value === 'number' && Number.isFinite(value)) return roundMoney(value)
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return roundMoney(Number(value))
  return null
}

function metadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function settleGiftCard(
  payments: Array<{ mode: string; amount: number; providerMetadata?: Record<string, unknown> | null }>,
): GiftCardSettlement | null {
  const gifts = payments.filter((payment) => payment.mode === GIFT_CARD_TENDER && payment.amount > 0)
  if (gifts.length === 0) return null
  const redeemed = roundMoney(gifts.reduce((sum, payment) => sum + payment.amount, 0))
  const last = gifts[gifts.length - 1]
  const metadata = last.providerMetadata ?? null
  const record = metadataRecord(metadata)
  const remaining = record ? metadataNumber(record, 'balance_after') : null
  const giftCardNo = record ? metadataString(record, 'gift_card_no') : null
  return { giftCardNo, redeemed, remaining }
}

export function readMetadataGiftCard(metadata: unknown): MetadataGiftCard | null {
  const record = metadataRecord(metadata)
  if (!record) return null
  const giftCardNo = metadataString(record, 'gift_card_no') ?? metadataString(record, 'giftCardNo')
  const balance =
    metadataNumber(record, 'gift_card_balance') ?? metadataNumber(record, 'giftCardBalance')
  const hasBalance = ['gift_card_balance', 'giftCardBalance'].some((key) => {
    const value = record[key]
    return value !== undefined && value !== null && value !== ''
  })
  if (!giftCardNo && !hasBalance) return null
  return { giftCardNo, balance: roundMoney(Math.max(0, balance ?? 0)) }
}

export function readGiftBalances(raw: string | null): Record<string, number> {
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const balances: Record<string, number> = {}
    for (const [id, value] of Object.entries(parsed)) {
      if (typeof value === 'number' && Number.isFinite(value)) balances[id] = roundMoney(Math.max(0, value))
    }
    return balances
  } catch {
    return {}
  }
}

export function writeGiftBalance(balances: Record<string, number>, customerId: string, balance: number) {
  return { ...balances, [customerId]: roundMoney(Math.max(0, balance)) }
}

export function applyGiftBalance<T extends { id: string; giftCardBalance: number }>(
  customer: T,
  balances: Record<string, number>,
): T {
  const stored = balances[customer.id]
  if (stored === undefined || stored === customer.giftCardBalance) return customer
  return { ...customer, giftCardBalance: stored }
}

let demoBalances: Record<string, number> | null = null

function demoStorage() {
  if (typeof localStorage === 'undefined') return null
  return localStorage
}

export function demoGiftBalances() {
  if (!demoBalances) demoBalances = readGiftBalances(demoStorage()?.getItem(DEMO_GIFT_BALANCES_KEY) ?? null)
  return demoBalances
}

export function rememberDemoGiftBalance(customerId: string, balance: number) {
  demoBalances = writeGiftBalance(demoGiftBalances(), customerId, balance)
  demoStorage()?.setItem(DEMO_GIFT_BALANCES_KEY, JSON.stringify(demoBalances))
}

export function applyDemoGiftBalance<T extends { id: string; giftCardBalance: number }>(customer: T): T {
  return applyGiftBalance(customer, demoGiftBalances())
}
