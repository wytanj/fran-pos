import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  TAX_RATE,
  POINTS_PER_DOLLAR,
  storeLocationCodeForSku,
  type Customer,
  type PosUser,
  type Product,
  type SalesType,
} from '@/pos/data/mock'
import type { SkumsGraphRefs } from '@pos/shared'
import type { FranSaleContext } from '@/pos/fran/types'
import { buildSkumsSaleIdempotencyKey, getPosRegisterCode } from './skums-sale-adapter'
import { getActiveStore } from './pos-store-config'

export type PosMode = 'demo' | 'live'

const emptyGraphRefs = (): SkumsGraphRefs => ({
  product_identity_id: null,
  trade_unit_id: null,
  listing_id: null,
  channel_id: null,
  sku_assignment_id: null,
  identifier_id: null,
  product_id: null,
  variant_id: null,
  batch_id: null,
})

export interface CartLine extends Partial<SkumsGraphRefs> {
  lineId: string
  sku: string
  name: string
  lineKind?: 'product' | 'fran_reward' | 'fran_points' | 'manual_adjustment'
  unitPrice: number // current selling price (after markdown / overrides)
  listPrice: number // original ticket price
  qty: number // negative for returns/exchanges
  returnable: boolean
  storeLocationCode?: string | null
  isMarkdown: boolean
  /** Manual line discount, in absolute dollars off the line. */
  lineDiscount: number
  discountLabel?: string
  /** True when the price was manager-overridden. */
  overridden?: boolean
  overrideReason?: string
  note?: string
  franRewardQuoteId?: string | null
  franDecisionRef?: string | null
}

export interface AdjustmentLineInput {
  sku: string
  name: string
  amount: number
  lineKind: NonNullable<CartLine['lineKind']>
  discountLabel?: string
  note?: string
  franRewardQuoteId?: string | null
  franDecisionRef?: string | null
}

export interface CartPriceOverride {
  id: string
  reason: string
  originalTotal: number
  targetTotal: number
  adjustment: number
  appliedAt: string
}

export interface Payment {
  id: string
  mode: string
  label: string
  amount: number
  detail?: string
  provider?: string | null
  providerRef?: string | null
  providerMetadata?: Record<string, unknown>
  status?: 'pending' | 'captured' | 'failed' | 'refunded' | 'voided'
}

export type PosSaleSyncStatus = 'not_required' | 'syncing' | 'queued' | 'synced' | 'failed'
export type CompletedSaleLifecycleStatus = 'completed' | 'voided'

export interface PosSaleSyncState {
  status: PosSaleSyncStatus
  idempotencyKey: string
  saleId?: string | null
  domainEventIds?: string[]
  executionLogIds?: string[]
  error?: string | null
  updatedAt: string
}

export interface CompletedSale {
  receiptNo: string
  saleStatus: CompletedSaleLifecycleStatus
  lines: CartLine[]
  cartPriceOverride: CartPriceOverride | null
  customer: Customer | null
  salesType: SalesType
  payments: Payment[]
  subtotal: number
  discountTotal: number
  tax: number
  total: number
  pointsEarned: number
  cashier: string
  timestamp: string
  completedAtIso: string
  voidedAtIso: string | null
  voidReason: string | null
  storeCode: string
  registerCode: string
  idempotencyKey: string
  skumsSync: PosSaleSyncState
  isExchange: boolean
  fran: FranSaleContext | null
}

export interface SavedBasket {
  id: string
  label: string
  lines: CartLine[]
  cartPriceOverride: CartPriceOverride | null
  customer: Customer | null
  salesType: SalesType
  createdAt: string
  savedBy: string
  itemCount: number
  total: number
  storageMode: 'local' | 'server_pending'
}

interface PosState {
  mode: PosMode
  setMode: (mode: PosMode) => void
  user: PosUser | null
  setUser: (u: PosUser | null) => void
  cart: CartLine[]
  cartPriceOverride: CartPriceOverride | null
  customer: Customer | null
  salesType: SalesType
  payments: Payment[]
  savedBaskets: SavedBasket[]
  setCustomer: (c: Customer | null) => void
  setSalesType: (t: SalesType) => void
  addProduct: (p: Product) => void
  addAdjustmentLine: (input: AdjustmentLineInput) => string
  addReturnLine: (line: Omit<CartLine, 'lineId'>) => void
  updateQty: (lineId: string, delta: number) => void
  removeLine: (lineId: string) => void
  setLineDiscount: (lineId: string, discount: number, label: string) => void
  overrideLinePrice: (lineId: string, newPrice: number, reason: string) => void
  overrideCartTotal: (newTotal: number, reason: string) => void
  clearCartPriceOverride: () => void
  addPayment: (p: Omit<Payment, 'id'>) => void
  removePayment: (id: string) => void
  saveBasket: (label?: string) => SavedBasket | null
  resumeSavedBasket: (id: string) => void
  removeSavedBasket: (id: string) => void
  clearSale: () => void
  totals: Totals
  lastSale: CompletedSale | null
  updateLastSale: (sale: CompletedSale) => void
  completeSale: (options?: CompleteSaleOptions) => CompletedSale
  receiptCounter: number
}

interface CompleteSaleOptions {
  fran?: FranSaleContext | null
  pointsEarned?: number
}

interface Totals {
  subtotal: number
  discountTotal: number
  cartAdjustment: number
  taxIncluded: number
  total: number
  paid: number
  balance: number // remaining to collect (positive) or change/refund (negative)
  itemCount: number
  pointsEarned: number
}

const PosCtx = createContext<PosState | null>(null)

let lineSeq = 0
const nextLineId = () => `line-${++lineSeq}`
const savedBasketStorageKey = 'pos_saved_baskets'

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function lineDiscountImpact(line: Pick<CartLine, 'lineDiscount' | 'qty'>) {
  return line.lineDiscount * (line.qty < 0 ? -1 : 1)
}

function baseCartTotal(lines: CartLine[]) {
  return roundCurrency(
    lines.reduce((sum, line) => sum + line.unitPrice * line.qty - lineDiscountImpact(line), 0)
  )
}

interface SavedBasketStore {
  read: () => SavedBasket[]
  write: (baskets: SavedBasket[]) => void
}

function localSavedBasketStore(): SavedBasketStore {
  return {
    read: () => {
      if (typeof window === 'undefined') return []
      try {
        const parsed = JSON.parse(localStorage.getItem(savedBasketStorageKey) || '[]')
        return Array.isArray(parsed) ? parsed : []
      } catch {
        return []
      }
    },
    write: (baskets) => {
      if (typeof window === 'undefined') return
      localStorage.setItem(savedBasketStorageKey, JSON.stringify(baskets))
    },
  }
}

function savedBasketStoreForMode(_mode: PosMode): SavedBasketStore {
  // Live mode deliberately uses the same local adapter for Phase 1; the adapter
  // boundary keeps server-backed baskets from changing the cashier flow later.
  return localSavedBasketStore()
}

function readSavedBaskets(mode: PosMode): SavedBasket[] {
  return savedBasketStoreForMode(mode).read()
}

function writeSavedBaskets(mode: PosMode, baskets: SavedBasket[]) {
  savedBasketStoreForMode(mode).write(baskets)
}

export function PosProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<PosMode>(() => {
    if (typeof window === 'undefined') return 'demo'
    return localStorage.getItem('pos_mode') === 'live' ? 'live' : 'demo'
  })
  const [user, setUser] = useState<PosUser | null>(null)
  const [cart, setCart] = useState<CartLine[]>([])
  const [cartPriceOverride, setCartPriceOverride] = useState<CartPriceOverride | null>(null)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [salesType, setSalesType] = useState<SalesType>('normal')
  const [payments, setPayments] = useState<Payment[]>([])
  const [savedBaskets, setSavedBaskets] = useState<SavedBasket[]>(() =>
    readSavedBaskets(typeof window !== 'undefined' && localStorage.getItem('pos_mode') === 'live' ? 'live' : 'demo')
  )
  const [lastSale, setLastSale] = useState<CompletedSale | null>(null)
  const [receiptCounter, setReceiptCounter] = useState(483)

  const setMode = useCallback((nextMode: PosMode) => {
    setModeState(nextMode)
    localStorage.setItem('pos_mode', nextMode)
    setSavedBaskets(readSavedBaskets(nextMode))
  }, [])

  const addProduct = (p: Product) => {
    const price = p.mdPrice ?? p.price
    setCartPriceOverride(null)
    setCart((prev) => {
      const existing = prev.find((l) => l.sku === p.sku && l.qty > 0 && !l.overridden)
      if (existing) {
        return prev.map((l) => (l.lineId === existing.lineId ? { ...l, qty: l.qty + 1 } : l))
      }
      return [
        ...prev,
        {
          lineId: nextLineId(),
          sku: p.sku,
          name: p.name,
          lineKind: 'product',
          unitPrice: price,
          listPrice: p.price,
          qty: 1,
          returnable: p.returnable,
          storeLocationCode: p.storeLocationCode ?? storeLocationCodeForSku(p.sku),
          isMarkdown: p.mdPrice != null,
          lineDiscount: 0,
          ...emptyGraphRefs(),
          ...p.skums,
        },
      ]
    })
  }

  const addAdjustmentLine = (input: AdjustmentLineInput) => {
    const lineId = nextLineId()
    const amount = roundCurrency(input.amount)
    setCartPriceOverride(null)
    setCart((prev) => [
      ...prev,
      {
        lineId,
        sku: input.sku,
        name: input.name,
        lineKind: input.lineKind,
        unitPrice: amount,
        listPrice: amount,
        qty: 1,
        returnable: false,
        storeLocationCode: null,
        isMarkdown: false,
        lineDiscount: 0,
        discountLabel: input.discountLabel,
        note: input.note,
        franRewardQuoteId: input.franRewardQuoteId ?? null,
        franDecisionRef: input.franDecisionRef ?? null,
        ...emptyGraphRefs(),
      },
    ])
    return lineId
  }

  const addReturnLine = (line: Omit<CartLine, 'lineId'>) => {
    setCartPriceOverride(null)
    setCart((prev) => [...prev, { ...line, lineId: nextLineId() }])
  }

  const updateQty = (lineId: string, delta: number) => {
    setCartPriceOverride(null)
    setCart((prev) =>
      prev
        .map((l) => {
          if (l.lineId !== lineId) return l
          const nextQty = l.qty + delta
          if (nextQty === 0) return null
          // Keep sign consistent (don't let a return flip into a sale via stepper)
          if (l.qty < 0 && nextQty > 0) return l
          if (l.qty > 0 && nextQty < 0) return l
          return { ...l, qty: nextQty }
        })
        .filter((l): l is CartLine => l !== null)
    )
  }

  const removeLine = (lineId: string) => {
    setCartPriceOverride(null)
    setCart((prev) => prev.filter((l) => l.lineId !== lineId))
  }

  const setLineDiscount = (lineId: string, discount: number, label: string) => {
    setCartPriceOverride(null)
    setCart((prev) =>
      prev.map((l) => (l.lineId === lineId ? { ...l, lineDiscount: discount, discountLabel: label } : l))
    )
  }

  const overrideLinePrice = (lineId: string, newPrice: number, reason: string) => {
    setCartPriceOverride(null)
    setCart((prev) =>
      prev.map((l) =>
        l.lineId === lineId
          ? { ...l, unitPrice: roundCurrency(newPrice), overridden: true, overrideReason: reason, note: reason }
          : l
      )
    )
  }

  const overrideCartTotal = (newTotal: number, reason: string) => {
    if (cart.length === 0) return
    const targetTotal = roundCurrency(Math.max(newTotal, 0))
    const originalTotal = baseCartTotal(cart)
    setCartPriceOverride({
      id: `cart-override-${Date.now()}`,
      reason,
      originalTotal,
      targetTotal,
      adjustment: roundCurrency(targetTotal - originalTotal),
      appliedAt: new Date().toISOString(),
    })
  }

  const clearCartPriceOverride = () => setCartPriceOverride(null)

  const addPayment = (p: Omit<Payment, 'id'>) =>
    setPayments((prev) => [...prev, { ...p, id: `pay-${Date.now()}-${prev.length}` }])

  const removePayment = (id: string) => setPayments((prev) => prev.filter((p) => p.id !== id))

  const clearSale = useCallback(() => {
    setCart([])
    setCartPriceOverride(null)
    setCustomer(null)
    setSalesType('normal')
    setPayments([])
  }, [])

  const totals = useMemo<Totals>(() => {
    let subtotal = 0
    let discountTotal = 0
    let itemCount = 0
    for (const l of cart) {
      const gross = l.unitPrice * l.qty
      subtotal += gross
      discountTotal += lineDiscountImpact(l)
      itemCount += l.qty
    }
    subtotal = roundCurrency(subtotal)
    discountTotal = roundCurrency(discountTotal)
    const baseNet = roundCurrency(subtotal - discountTotal)
    const cartAdjustment = cartPriceOverride ? roundCurrency(cartPriceOverride.targetTotal - baseNet) : 0
    const net = roundCurrency(baseNet + cartAdjustment)
    // GST is inclusive: extract the tax component for display.
    const taxIncluded = net - net / (1 + TAX_RATE)
    const paid = payments.reduce((s, p) => s + p.amount, 0)
    const total = net
    const balance = total - paid
    const pointsEarned = net > 0 ? Math.floor(net * POINTS_PER_DOLLAR) : 0
    return { subtotal, discountTotal, cartAdjustment, taxIncluded, total, paid, balance, itemCount, pointsEarned }
  }, [cart, cartPriceOverride, payments])

  // Always read the latest register state so payment completion cannot capture a stale cart.
  const saleSnapshotRef = useRef({
    cart,
    cartPriceOverride,
    customer,
    salesType,
    payments,
    totals,
    user,
    receiptCounter,
  })
  saleSnapshotRef.current = {
    cart,
    cartPriceOverride,
    customer,
    salesType,
    payments,
    totals,
    user,
    receiptCounter,
  }

  const completeSale = useCallback((options: CompleteSaleOptions = {}): CompletedSale => {
    const snapshot = saleSnapshotRef.current
    const completedAt = new Date()
    const completedAtIso = completedAt.toISOString()
    const receiptNo = `${getActiveStore().code}-${String(snapshot.receiptCounter).padStart(6, '0')}`
    const isExchange = snapshot.cart.some((l) => l.qty < 0)
    const idempotencyKey = buildSkumsSaleIdempotencyKey({ receiptNo, completedAtIso })
    const sale: CompletedSale = {
      receiptNo,
      saleStatus: 'completed',
      lines: snapshot.cart.map((line) => ({ ...line })),
      cartPriceOverride: snapshot.cartPriceOverride,
      customer: snapshot.customer,
      salesType: snapshot.salesType,
      payments: snapshot.payments.map((payment) => ({ ...payment })),
      subtotal: snapshot.totals.subtotal,
      discountTotal: snapshot.totals.discountTotal,
      tax: snapshot.totals.taxIncluded,
      total: snapshot.totals.total,
      pointsEarned: options.pointsEarned ?? snapshot.totals.pointsEarned,
      cashier: snapshot.user?.name ?? 'Demo Cashier',
      timestamp: completedAt.toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' }),
      completedAtIso,
      voidedAtIso: null,
      voidReason: null,
      storeCode: getActiveStore().code,
      registerCode: getPosRegisterCode(),
      idempotencyKey,
      skumsSync: {
        status: 'not_required',
        idempotencyKey,
        updatedAt: completedAtIso,
      },
      isExchange,
      fran: options.fran ?? null,
    }
    setLastSale(sale)
    setReceiptCounter((c) => c + 1)
    // Clear cart / tenders immediately so the next sale starts empty (member, non-member, or tourist).
    clearSale()
    return sale
  }, [clearSale])

  const saveBasket = (label?: string) => {
    if (cart.length === 0) return null
    const basket: SavedBasket = {
      id: `basket-${Date.now()}`,
      label: label?.trim() || customer?.name || `Basket ${savedBaskets.length + 1}`,
      lines: cart,
      cartPriceOverride,
      customer,
      salesType,
      createdAt: new Date().toISOString(),
      savedBy: user?.name ?? 'Cashier',
      itemCount: totals.itemCount,
      total: totals.total,
      storageMode: mode === 'live' ? 'server_pending' : 'local',
    }
    setSavedBaskets((prev) => {
      const next = [basket, ...prev].slice(0, 12)
      writeSavedBaskets(mode, next)
      return next
    })
    clearSale()
    return basket
  }

  const resumeSavedBasket = (id: string) => {
    const basket = savedBaskets.find((item) => item.id === id)
    if (!basket) return
    setCart(basket.lines.map((line) => ({ ...line, lineId: nextLineId() })))
    setCartPriceOverride(basket.cartPriceOverride ?? null)
    setCustomer(basket.customer)
    setSalesType(basket.salesType)
    setPayments([])
    setSavedBaskets((prev) => {
      const next = prev.filter((item) => item.id !== id)
      writeSavedBaskets(mode, next)
      return next
    })
  }

  const removeSavedBasket = (id: string) => {
    setSavedBaskets((prev) => {
      const next = prev.filter((item) => item.id !== id)
      writeSavedBaskets(mode, next)
      return next
    })
  }

  const value: PosState = {
    mode,
    setMode,
    user,
    setUser,
    cart,
    cartPriceOverride,
    customer,
    salesType,
    payments,
    savedBaskets,
    setCustomer,
    setSalesType,
    addProduct,
    addAdjustmentLine,
    addReturnLine,
    updateQty,
    removeLine,
    setLineDiscount,
    overrideLinePrice,
    overrideCartTotal,
    clearCartPriceOverride,
    addPayment,
    removePayment,
    saveBasket,
    resumeSavedBasket,
    removeSavedBasket,
    clearSale,
    totals,
    lastSale,
    updateLastSale: setLastSale,
    completeSale,
    receiptCounter,
  }

  return <PosCtx.Provider value={value}>{children}</PosCtx.Provider>
}

export function usePos() {
  const ctx = useContext(PosCtx)
  if (!ctx) throw new Error('usePos must be used within PosProvider')
  return ctx
}
