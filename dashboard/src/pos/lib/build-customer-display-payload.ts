/**
 * Pure builder: Screen A register state → Screen B display payload.
 *
 * No React, no Supabase, no path aliases — `tests/customer-display-payload.test.mjs`
 * imports this file directly under node. Keep it that way.
 */

import {
  CUSTOMER_DISPLAY_PAYLOAD_VERSION,
  type CustomerDisplayLine,
  type CustomerDisplayMember,
  type CustomerDisplayPayload,
  type CustomerDisplayState,
} from './customer-display-types.ts'

/** Structural subset of `CartLine` (pos-context) the face needs. */
export interface DisplayCartLineInput {
  lineId: string
  name: string
  qty: number
  unitPrice: number
  lineDiscount?: number
  lineKind?: 'product' | 'fran_reward' | 'fran_points' | 'manual_adjustment' | null
}

/** Structural subset of `Totals` (pos-context). */
export interface DisplayTotalsInput {
  itemCount: number
  total: number
  /** Remaining to collect once partial tenders exist; falls back to total. */
  balance?: number
}

/** Structural subset of `CompletedSale` (pos-context). */
export interface DisplayCompletedSaleInput {
  receiptNo: string
  total: number
  saleStatus?: string
}

/** Structural subset of `FranCounterSession` (pos/fran/types). */
export interface DisplayFranSessionInput {
  mode: 'member' | 'non_member' | 'tourist'
  member: {
    name: string
    tier?: string | null
    tierLabel?: string | null
    tourist?: boolean
  } | null
}

/** Structural subset of `FranBasketPreview.tierProgress` (pos/fran/types). */
export interface DisplayTierProgressInput {
  nextTierLabel: string | null
  gapRemaining?: number | null
  spendRequiredForNextTier?: number | null
  crossesTierThreshold?: boolean
}

export interface BuildCustomerDisplayPayloadInput {
  storeName: string
  storeCode: string
  laneCode?: string
  currency: string
  cart: DisplayCartLineInput[]
  totals: DisplayTotalsInput
  /** PaymentModal open on A → "amount due" on B. */
  paymentOpen: boolean
  /** SaleCompleteModal open on A → thank-you flash on B. */
  completedOpen: boolean
  lastSale?: DisplayCompletedSaleInput | null
  franSession?: DisplayFranSessionInput | null
  tierProgress?: DisplayTierProgressInput | null
  thankYouMessage?: string
  now?: Date
}

export const DEFAULT_THANK_YOU_MESSAGE = 'Thank you'

function roundMoney(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100
}

/**
 * Guest-facing money. SGD reads "S$12.50" (the POS receipt style is
 * "SGD 12.50" which is fine for staff but noisy on a 10-inch face).
 */
export function formatDisplayMoney(amount: number, currency: string) {
  const value = roundMoney(amount)
  const abs = Math.abs(value).toFixed(2)
  const sign = value < 0 ? '-' : ''
  if (currency === 'SGD') return `${sign}S$${abs}`
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value)
  } catch {
    return `${sign}${currency} ${abs}`
  }
}

function cartLineNet(line: DisplayCartLineInput) {
  const discount = Number(line.lineDiscount) || 0
  return roundMoney(line.unitPrice * line.qty - discount * (line.qty < 0 ? -1 : 1))
}

export function toDisplayLines(cart: DisplayCartLineInput[]): CustomerDisplayLine[] {
  return cart.map((line) => ({
    id: line.lineId,
    name: line.name,
    qty: line.qty,
    lineTotal: cartLineNet(line),
    kind: line.lineKind && line.lineKind !== 'product' ? 'adjustment' : 'product',
  }))
}

export function toDisplayMember(session: DisplayFranSessionInput | null | undefined): CustomerDisplayMember | null {
  if (!session || session.mode !== 'member' || !session.member) return null
  const member = session.member
  const name = String(member.name || '').trim()
  if (!name) return null
  const tierLabel = member.tourist ? null : String(member.tierLabel || member.tier || '').trim() || null
  return { name, tierLabel }
}

/**
 * P1 ties-to-hit one-liner. Exactly one strip max; null when there is nothing
 * honest to say (no next tier, or the gap is unknown).
 */
export function formatTiesToHit(progress: DisplayTierProgressInput | null | undefined, currency: string): string | null {
  if (!progress || !progress.nextTierLabel) return null
  const gapRaw =
    typeof progress.gapRemaining === 'number'
      ? progress.gapRemaining
      : typeof progress.spendRequiredForNextTier === 'number'
        ? progress.spendRequiredForNextTier
        : null
  if (gapRaw === null || !Number.isFinite(gapRaw)) return null
  const gap = roundMoney(gapRaw)
  if (gap <= 0) {
    return progress.crossesTierThreshold ? `${progress.nextTierLabel} unlocked with this purchase` : null
  }
  return `${formatDisplayMoney(gap, currency)} more → ${progress.nextTierLabel}`
}

export function resolveDisplayState(input: {
  cartCount: number
  paymentOpen: boolean
  completedOpen: boolean
  lastSale?: DisplayCompletedSaleInput | null
}): CustomerDisplayState {
  if (input.completedOpen && input.lastSale && input.lastSale.saleStatus !== 'voided') return 'done'
  if (input.paymentOpen && input.cartCount > 0) return 'paying'
  if (input.cartCount > 0) return 'cart'
  return 'idle'
}

export function buildCustomerDisplayPayload(input: BuildCustomerDisplayPayloadInput): CustomerDisplayPayload {
  const state = resolveDisplayState({
    cartCount: input.cart.length,
    paymentOpen: input.paymentOpen,
    completedOpen: input.completedOpen,
    lastSale: input.lastSale,
  })
  const publishedAt = (input.now ?? new Date()).toISOString()
  const base: CustomerDisplayPayload = {
    version: CUSTOMER_DISPLAY_PAYLOAD_VERSION,
    state,
    storeName: input.storeName,
    storeCode: input.storeCode,
    laneCode: input.laneCode || 'MAIN',
    currency: input.currency,
    lines: [],
    itemCount: 0,
    runningTotal: 0,
    amountDue: null,
    member: null,
    tiesToHit: null,
    thankYouMessage: null,
    receiptNo: null,
    publishedAt,
  }

  if (state === 'idle') return base

  if (state === 'done') {
    const sale = input.lastSale!
    return {
      ...base,
      runningTotal: roundMoney(sale.total),
      amountDue: roundMoney(sale.total),
      member: toDisplayMember(input.franSession),
      thankYouMessage: input.thankYouMessage || DEFAULT_THANK_YOU_MESSAGE,
      receiptNo: sale.receiptNo,
    }
  }

  const runningTotal = roundMoney(input.totals.total)
  const balance = typeof input.totals.balance === 'number' ? input.totals.balance : runningTotal
  const amountDue = state === 'paying' ? roundMoney(Math.max(0, balance > 0 ? balance : runningTotal)) : null

  return {
    ...base,
    lines: toDisplayLines(input.cart),
    itemCount: input.totals.itemCount,
    runningTotal,
    amountDue,
    member: toDisplayMember(input.franSession),
    tiesToHit: formatTiesToHit(input.tierProgress, input.currency),
  }
}

/** Stable key so the publisher skips no-op republishes (ignores publishedAt). */
export function customerDisplayPayloadKey(payload: CustomerDisplayPayload) {
  // JSON.stringify drops undefined, so publishedAt is excluded from the key.
  return JSON.stringify({ ...payload, publishedAt: undefined })
}
