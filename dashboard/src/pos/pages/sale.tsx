import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ScanLine,
  Plus,
  Minus,
  Trash2,
  Tag,
  Pencil,
  Sparkles,
  X,
  ShoppingBag,
  Grid2X2,
  List,
  BookmarkPlus,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import { formatCurrency, cn } from '@/lib/utils'
import {
  PRODUCTS,
  SALES_TYPES,
  STORE,
  ACTIVE_PROMOTION,
  PRICE_OVERRIDE_REASONS,
  normalizeStoreStorageLocationCode,
  type Product,
  type SalesType,
} from '@/pos/data/mock'
import { usePos, type CartLine, type CompletedSale, type PosSaleSyncState } from '@/pos/lib/pos-context'
import { LineActionModal, type LineActionMode } from '@/pos/components/line-action-modal'
import { ManagerAuthModal } from '@/pos/components/manager-auth-modal'
import { PaymentModal } from '@/pos/components/payment-modal'
import { SaleCompleteModal } from '@/pos/components/sale-complete-modal'
import { FranCounterProfileCard } from '@/pos/fran/components/fran-counter-profile-card'
import { FranCustomerModal } from '@/pos/fran/components/fran-customer-modal'
import { FranMemberStrip } from '@/pos/fran/components/fran-member-strip'
import { FranRewardRedemptionPanel } from '@/pos/fran/components/fran-reward-redemption-panel'
import { createFranCrmClient } from '@/pos/fran/lib/fran-crm-client'
import type {
  FranAppliedReward,
  FranBasketLineInput,
  FranBasketPreview,
  FranCounterSession,
  FranLoyaltySyncState,
  FranRewardDecision,
  FranRewardQuote,
  FranSaleContext,
} from '@/pos/fran/types'
import { listSkumsPosCatalog, resolveSkumsPosScan } from '@/pos/lib/skums-client'
import {
  pendingSkumsSaleWriteCount,
  retryPendingSkumsSaleWrites,
  syncSkumsSaleWrite,
} from '@/pos/lib/skums-sale-sync'
import {
  buildPosOutboxEventsForCompletedSale,
  pendingPosOutboxEventCount,
  persistPosOutboxEvents,
  retryPendingPosOutboxEvents,
} from '@/pos/lib/pos-outbox'
import { useAuth } from '@/providers/auth-provider'
import { useSkumsConnector } from '@/hooks/use-skums-connector'
import type { Product as DbProduct, SkumsGraphRefs, SkumsPosCatalogItem, SkumsPosScanMatch } from '@pos/shared'

const graphFields: (keyof SkumsGraphRefs)[] = [
  'product_identity_id',
  'trade_unit_id',
  'listing_id',
  'channel_id',
  'sku_assignment_id',
  'identifier_id',
  'product_id',
  'variant_id',
  'batch_id',
]

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function storeLocationCodeFromMetadata(metadata: Record<string, unknown> | null | undefined) {
  const root = asRecord(metadata)
  const skums = asRecord(root.skums)
  const productData = asRecord(root.product_data)
  return normalizeStoreStorageLocationCode(
    root.store_location_code ??
      root.storage_location_code ??
      root.storeLocationCode ??
      skums.store_location_code ??
      skums.storage_location_code ??
      productData.store_location_code ??
      productData.storage_location_code ??
      productData.bin_location ??
      productData.location_code
  )
}

type CatalogViewMode = 'grid' | 'list'
type ScanMessage = { tone: 'info' | 'success' | 'warning' | 'error'; text: string }

function formatSignedCurrency(value: number) {
  if (Math.abs(value) < 0.005) return formatCurrency(0, STORE.currency)
  return `${value > 0 ? '+' : '-'}${formatCurrency(Math.abs(value), STORE.currency)}`
}

function toPosProduct(item: SkumsPosCatalogItem): Product {
  return {
    id: item.id,
    sku: item.sku,
    name: item.display_name || item.title,
    category: item.category_name || 'Uncategorized',
    storeLocationCode: normalizeStoreStorageLocationCode(item.storage_location_code) ?? storeLocationCodeFromMetadata(item.metadata),
    price: item.list_price || item.unit_price || 0,
    mdPrice: item.unit_price !== item.list_price ? item.unit_price : undefined,
    qtyOnHand: item.track_inventory ? item.stock_quantity : 999,
    returnable: true,
    emoji: 'P',
    skums: {
      product_identity_id: item.product_identity_id,
      trade_unit_id: item.trade_unit_id,
      listing_id: item.listing_id,
      channel_id: item.channel_id,
      sku_assignment_id: item.sku_assignment_id,
      identifier_id: item.identifier_id,
      product_id: item.product_id,
      variant_id: item.variant_id,
      batch_id: item.batch_id,
    },
  }
}

function skumsRefsFromMetadata(metadata: Record<string, unknown> | null | undefined): Partial<SkumsGraphRefs> {
  const source = metadata?.skums
  if (!source || typeof source !== 'object') return {}
  const refs: Partial<SkumsGraphRefs> = {}
  for (const field of graphFields) {
    const value = (source as Record<string, unknown>)[field]
    refs[field] = typeof value === 'string' ? value : null
  }
  return refs
}

function toLiveProduct(product: DbProduct): Product {
  return {
    id: product.id,
    sku: product.sku || product.barcode || product.id.slice(0, 8),
    name: product.name,
    category: product.category?.name || 'Uncategorized',
    storeLocationCode: storeLocationCodeFromMetadata(product.metadata),
    price: Number(product.price) || 0,
    qtyOnHand: product.track_inventory ? product.inventory_count : 999,
    returnable: true,
    emoji: 'P',
    skums: skumsRefsFromMetadata(product.metadata),
  }
}

function numberFromMetadata(metadata: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = metadata[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  }
  return 0
}

function cartLineNet(line: CartLine) {
  return line.unitPrice * line.qty - line.lineDiscount * (line.qty < 0 ? -1 : 1)
}

function isFranAdjustmentLine(line: CartLine) {
  return line.lineKind === 'fran_reward' || line.lineKind === 'fran_points'
}

function toFranBasketLine(line: CartLine): FranBasketLineInput {
  return {
    lineId: line.lineId,
    sku: line.sku,
    name: line.name,
    quantity: line.qty,
    unitPrice: line.unitPrice,
    lineTotal: cartLineNet(line),
    lineKind: line.lineKind ?? 'product',
  }
}

export default function SalePage() {
  const pos = usePos()
  const { company } = useAuth()
  const { connector: skumsConnector } = useSkumsConnector()
  const {
    mode,
    cart,
    cartPriceOverride,
    salesType,
    totals,
    addProduct,
    addAdjustmentLine,
    updateQty,
    removeLine,
    setCustomer,
    setSalesType,
    setLineDiscount,
    overrideLinePrice,
    overrideCartTotal,
    clearCartPriceOverride,
    savedBaskets,
    saveBasket,
    resumeSavedBasket,
    removeSavedBasket,
    clearSale,
    completeSale,
    updateLastSale,
  } = pos
  const franCrm = useMemo(() => createFranCrmClient(), [])

  const [category, setCategory] = useState('All')
  const [search, setSearch] = useState('')
  const [franCustomerOpen, setFranCustomerOpen] = useState(false)
  const [franMemberDialogOpen, setFranMemberDialogOpen] = useState(false)
  const [franSession, setFranSession] = useState<FranCounterSession | null>(null)
  const [franPreview, setFranPreview] = useState<FranBasketPreview | null>(null)
  const [franPreviewLoading, setFranPreviewLoading] = useState(false)
  const [franPreviewError, setFranPreviewError] = useState<string | null>(null)
  const [franLoyaltySync, setFranLoyaltySync] = useState<FranLoyaltySyncState | null>(null)
  const [franQuote, setFranQuote] = useState<FranRewardQuote | null>(null)
  const [franAppliedReward, setFranAppliedReward] = useState<FranAppliedReward | null>(null)
  const [franQuoteLoading, setFranQuoteLoading] = useState(false)
  const [franRewardBasketKey, setFranRewardBasketKey] = useState<string | null>(null)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [cartOverrideOpen, setCartOverrideOpen] = useState(false)
  const [completedOpen, setCompletedOpen] = useState(false)
  const [voidingSale, setVoidingSale] = useState(false)
  const [promoDismissed, setPromoDismissed] = useState(false)
  const [catalog, setCatalog] = useState<Product[]>(PRODUCTS)
  const [catalogSource, setCatalogSource] = useState<'mock' | 'live' | 'skums'>('mock')
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [catalogRefreshToken, setCatalogRefreshToken] = useState(0)
  const [basketLabel, setBasketLabel] = useState('')
  const [basketNotice, setBasketNotice] = useState<string | null>(null)
  const [scanResolving, setScanResolving] = useState(false)
  const [scanMessage, setScanMessage] = useState<ScanMessage | null>(null)
  const [scanChoices, setScanChoices] = useState<Array<{ product: Product; confidence: number }>>([])
  const [saleSync, setSaleSync] = useState<PosSaleSyncState | null>(null)
  const [pendingSaleWrites, setPendingSaleWrites] = useState(0)
  const [retryingSaleWrites, setRetryingSaleWrites] = useState(false)
  const [pendingSourceEvents, setPendingSourceEvents] = useState(0)
  const [retryingSourceEvents, setRetryingSourceEvents] = useState(false)
  const productEntryRef = useRef<HTMLInputElement | null>(null)
  const [catalogView, setCatalogView] = useState<CatalogViewMode>(() => {
    if (typeof window === 'undefined') return 'grid'
    return localStorage.getItem('pos_catalog_view') === 'list' ? 'list' : 'grid'
  })

  // Line action (discount / override) + the manager-auth gate it routes through.
  const [lineAction, setLineAction] = useState<{ mode: LineActionMode; line: CartLine } | null>(null)
  const [pendingAuth, setPendingAuth] = useState<{ label: string; run: () => void } | null>(null)
  const preOverrideTotal = totals.total - totals.cartAdjustment
  const franBasketLines = useMemo(
    () => cart.filter((line) => line.qty > 0 && !isFranAdjustmentLine(line)).map(toFranBasketLine),
    [cart]
  )
  const franBasketKey = useMemo(
    () => JSON.stringify(franBasketLines.map((line) => [line.lineId, line.quantity, line.unitPrice, line.lineTotal])),
    [franBasketLines]
  )
  const franBasketTotals = useMemo(() => {
    const saleLines = cart.filter((line) => line.qty > 0 && !isFranAdjustmentLine(line))
    const subtotal = saleLines.reduce((sum, line) => sum + line.unitPrice * line.qty, 0)
    const discountTotal = saleLines.reduce((sum, line) => sum + line.lineDiscount, 0)
    return {
      subtotal,
      discountTotal,
      total: saleLines.reduce((sum, line) => sum + cartLineNet(line), 0),
    }
  }, [cart])
  const provisionalFranEarnPoints = useMemo(
    () => Math.max(0, Math.floor(franBasketTotals.total)),
    [franBasketTotals.total]
  )

  useEffect(() => {
    if (!franAppliedReward || !franRewardBasketKey || franBasketKey === franRewardBasketKey) return
    removeLine(franAppliedReward.lineId)
    setFranAppliedReward(null)
    setFranQuote(null)
    setFranRewardBasketKey(null)
  }, [franAppliedReward, franBasketKey, franRewardBasketKey, removeLine])

  useEffect(() => {
    let cancelled = false
    if (!franSession) {
      setFranPreview(null)
      setFranPreviewError(null)
      setFranPreviewLoading(false)
      setFranLoyaltySync(null)
      return
    }

    setFranPreviewLoading(true)
    setFranPreviewError(null)
    franCrm.previewBasket({
      session: franSession,
      cart: {
        cartId: franBasketKey,
        lines: franBasketLines,
        subtotal: franBasketTotals.subtotal,
        discountTotal: franBasketTotals.discountTotal,
        total: franBasketTotals.total,
        currency: STORE.currency,
        updatedAt: new Date().toISOString(),
      },
    })
      .then((preview) => {
        if (!cancelled) {
          setFranPreview(preview)
          setFranLoyaltySync({
            status: 'online',
            pointsEarnQueued: 0,
            reason: null,
            queuedAt: null,
            syncOnReconnect: false,
          })
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const reason = err instanceof Error ? err.message : 'Fran CRM preview unavailable'
          setFranPreview(null)
          setFranPreviewError('Fran CRM offline. Sale can continue; points earn will queue on payment.')
          setFranLoyaltySync(
            franSession.member && !franSession.member.tourist
              ? {
                  status: 'queued',
                  pointsEarnQueued: provisionalFranEarnPoints,
                  reason,
                  queuedAt: new Date().toISOString(),
                  syncOnReconnect: true,
                }
              : {
                  status: 'unavailable',
                  pointsEarnQueued: 0,
                  reason,
                  queuedAt: null,
                  syncOnReconnect: false,
                }
          )
        }
      })
      .finally(() => {
        if (!cancelled) setFranPreviewLoading(false)
      })

    return () => { cancelled = true }
  }, [franBasketKey, franBasketLines, franBasketTotals.discountTotal, franBasketTotals.subtotal, franBasketTotals.total, franCrm, franSession, provisionalFranEarnPoints])

  useEffect(() => {
    let cancelled = false
    if (mode === 'demo') {
      setCatalog(PRODUCTS)
      setCatalogSource('mock')
      setCatalogError(null)
      setCatalogLoading(false)
      return
    }

    setCatalogLoading(true)

    async function loadLiveCatalog() {
      if (!company) {
        setCatalog([])
        setCatalogError('Sign in to load live products')
        return
      }

      const { data, error } = await supabase
        .from('products')
        .select('*, category:categories(id, name)')
        .eq('company_id', company.id)
        .eq('is_active', true)
        .order('sort_order')

      if (error) throw error

      const liveProducts = ((data || []) as DbProduct[]).map(toLiveProduct)
      if (liveProducts.length > 0) {
        setCatalog(liveProducts)
        setCatalogSource('live')
        setCategory('All')
        setCatalogError(null)
        return
      }

      if (skumsConnector) {
        const res = await listSkumsPosCatalog({ limit: 250 }, skumsConnector)
        const skumsProducts = res.data.map(toPosProduct)
        if (skumsProducts.length > 0) {
          setCatalog(skumsProducts)
          setCatalogSource('skums')
          setCategory('All')
          setCatalogError(null)
          return
        }
        setCatalogError('No SKUMS products available for POS')
        return
      }

      setCatalog([])
      setCatalogError('No live products yet. Create products manually or add a SKUMS connector.')
    }

    loadLiveCatalog()
      .catch((err) => {
        if (!cancelled) setCatalogError(err instanceof Error ? err.message : 'Failed to load live catalog')
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false)
      })
    return () => { cancelled = true }
  }, [company, mode, skumsConnector?.apiKey, skumsConnector?.apiUrl, catalogRefreshToken])

  useEffect(() => {
    if (mode === 'demo') return

    const refreshCatalog = () => setCatalogRefreshToken((value) => value + 1)
    const refreshOnVisible = () => {
      if (document.visibilityState === 'visible') refreshCatalog()
    }
    const refreshOnStorage = (event: StorageEvent) => {
      if (event.key === 'pos_catalog_updated') refreshCatalog()
    }

    window.addEventListener('focus', refreshCatalog)
    window.addEventListener('storage', refreshOnStorage)
    window.addEventListener('pos-catalog-updated', refreshCatalog)
    document.addEventListener('visibilitychange', refreshOnVisible)

    return () => {
      window.removeEventListener('focus', refreshCatalog)
      window.removeEventListener('storage', refreshOnStorage)
      window.removeEventListener('pos-catalog-updated', refreshCatalog)
      document.removeEventListener('visibilitychange', refreshOnVisible)
    }
  }, [mode])

  const refreshPendingSaleWrites = useCallback(() => {
    setPendingSaleWrites(pendingSkumsSaleWriteCount())
  }, [])

  const retryQueuedSaleWrites = useCallback(async () => {
    if (!skumsConnector || pendingSkumsSaleWriteCount() === 0) {
      refreshPendingSaleWrites()
      return
    }

    setRetryingSaleWrites(true)
    try {
      await retryPendingSkumsSaleWrites(skumsConnector)
    } finally {
      refreshPendingSaleWrites()
      setRetryingSaleWrites(false)
    }
  }, [refreshPendingSaleWrites, skumsConnector?.apiKey, skumsConnector?.apiUrl])

  useEffect(() => {
    refreshPendingSaleWrites()
    if (mode !== 'live' || !skumsConnector) return

    void retryQueuedSaleWrites()
    const retryOnFocus = () => { void retryQueuedSaleWrites() }
    const retryOnVisible = () => {
      if (document.visibilityState === 'visible') void retryQueuedSaleWrites()
    }

    window.addEventListener('focus', retryOnFocus)
    document.addEventListener('visibilitychange', retryOnVisible)

    return () => {
      window.removeEventListener('focus', retryOnFocus)
      document.removeEventListener('visibilitychange', retryOnVisible)
    }
  }, [mode, refreshPendingSaleWrites, retryQueuedSaleWrites, skumsConnector?.apiKey, skumsConnector?.apiUrl])

  const refreshPendingSourceEvents = useCallback(() => {
    setPendingSourceEvents(pendingPosOutboxEventCount())
  }, [])

  const retryQueuedSourceEvents = useCallback(async () => {
    refreshPendingSourceEvents()
    if (!company?.id || pendingPosOutboxEventCount() === 0) return

    setRetryingSourceEvents(true)
    try {
      await retryPendingPosOutboxEvents(company.id)
    } finally {
      refreshPendingSourceEvents()
      setRetryingSourceEvents(false)
    }
  }, [company?.id, refreshPendingSourceEvents])

  useEffect(() => {
    refreshPendingSourceEvents()
    if (!company?.id) return

    void retryQueuedSourceEvents()
    const retryOnReconnect = () => { void retryQueuedSourceEvents() }
    const retryOnVisible = () => {
      if (document.visibilityState === 'visible') void retryQueuedSourceEvents()
    }

    window.addEventListener('focus', retryOnReconnect)
    window.addEventListener('online', retryOnReconnect)
    document.addEventListener('visibilitychange', retryOnVisible)

    return () => {
      window.removeEventListener('focus', retryOnReconnect)
      window.removeEventListener('online', retryOnReconnect)
      document.removeEventListener('visibilitychange', retryOnVisible)
    }
  }, [company?.id, refreshPendingSourceEvents, retryQueuedSourceEvents])

  const categories = useMemo(() => ['All', ...Array.from(new Set(catalog.map((p) => p.category))).sort()], [catalog])

  const filtered = useMemo(
    () =>
      catalog.filter(
        (p) =>
          (category === 'All' || p.category === category) &&
          (search === '' ||
            p.name.toLowerCase().includes(search.toLowerCase()) ||
            p.sku.toLowerCase().includes(search.toLowerCase()) ||
            (p.storeLocationCode?.toLowerCase().includes(search.toLowerCase()) ?? false))
      ),
    [catalog, category, search]
  )

  const promoQualifies =
    !promoDismissed &&
    cart.filter((l) => l.qty > 0 && catalog.find((p) => p.sku === l.sku)?.category === ACTIVE_PROMOTION.category).length >= 2

  const focusProductEntry = useCallback(() => {
    if (typeof window === 'undefined') return
    window.setTimeout(() => productEntryRef.current?.focus(), 0)
  }, [])

  const scanFirst = () => {
    const inStock = catalog.filter((p) => p.qtyOnHand > 0)
    if (inStock.length === 0) return
    addProduct(inStock[Math.floor(Math.random() * inStock.length)])
    setScanMessage(null)
    focusProductEntry()
  }

  const productFromScanMatch = (match: SkumsPosScanMatch): Product => {
    const existing = catalog.find((product) => {
      if (match.sku && product.sku.toLowerCase() === match.sku.toLowerCase()) return true
      return graphFields.some((field) => {
        const matchValue = match[field]
        return Boolean(matchValue && product.skums?.[field] === matchValue)
      })
    })
    if (existing) return existing

    const metadata = asRecord(match.metadata)
    const unitPrice = numberFromMetadata(metadata, ['unit_price', 'price', 'list_price'])
    return {
      id: match.product_id || match.sku || match.matched_value,
      sku: match.sku || match.matched_value,
      name: match.display_name,
      category: 'SKUMS resolved',
      storeLocationCode: storeLocationCodeFromMetadata(metadata),
      price: unitPrice,
      qtyOnHand: 999,
      returnable: true,
      emoji: 'P',
      skums: {
        product_identity_id: match.product_identity_id,
        trade_unit_id: match.trade_unit_id,
        listing_id: match.listing_id,
        channel_id: match.channel_id,
        sku_assignment_id: match.sku_assignment_id,
        identifier_id: match.identifier_id,
        product_id: match.product_id,
        variant_id: match.variant_id,
        batch_id: match.batch_id,
      },
    }
  }

  const handleScanSubmit = async () => {
    const needle = search.trim()
    if (!needle) return

    const exact = catalog.find(
      (p) => p.sku.toLowerCase() === needle.toLowerCase() || p.id.toLowerCase() === needle.toLowerCase()
    )
    if (exact) {
      addProduct(exact)
      setSearch('')
      setScanMessage(null)
      focusProductEntry()
      return
    }

    if (filtered.length > 0) {
      addProduct(filtered[0])
      setSearch('')
      setScanMessage(null)
      focusProductEntry()
      return
    }

    if (mode !== 'live' || !skumsConnector) {
      setScanMessage({ tone: 'warning', text: 'No local product matched this product code.' })
      focusProductEntry()
      return
    }

    setScanResolving(true)
    setScanMessage(null)
    try {
      const response = await resolveSkumsPosScan(
        needle,
        { location_id: STORE.inventoryLocationId },
        skumsConnector
      )
      const resolution = response.data
      if (resolution.match_status === 'single' && resolution.matches[0]) {
        addProduct(productFromScanMatch(resolution.matches[0]))
        setSearch('')
        setScanMessage({ tone: 'success', text: 'Resolved by SKUMS and added to cart.' })
        focusProductEntry()
      } else if (resolution.match_status === 'ambiguous' && resolution.matches.length > 0) {
        setScanChoices(resolution.matches.map((match) => ({
          product: productFromScanMatch(match),
          confidence: match.confidence,
        })))
        setScanMessage({ tone: 'info', text: 'Multiple SKUMS matches found. Select the correct item.' })
      } else {
        setScanMessage({ tone: 'warning', text: 'No SKUMS match found. Back office will review the scan.' })
      }
    } catch (err) {
      setScanMessage({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Scan service unavailable. Continue with product entry.',
      })
      focusProductEntry()
    } finally {
      setScanResolving(false)
    }
  }

  const submitProductEntry = async () => {
    if (search.trim()) {
      await handleScanSubmit()
      return
    }
    scanFirst()
  }

  const setCatalogViewMode = (view: CatalogViewMode) => {
    setCatalogView(view)
    localStorage.setItem('pos_catalog_view', view)
  }

  const chooseSalesType = (t: SalesType) => {
    const meta = SALES_TYPES.find((s) => s.value === t)!
    if (meta.requiresManager) {
      setPendingAuth({
        label: `Authorise "${meta.label}" sales type`,
        run: () => setSalesType(t),
      })
    } else {
      setSalesType(t)
    }
  }

  const flashBasketNotice = (message: string) => {
    setBasketNotice(message)
    window.setTimeout(() => setBasketNotice(null), 3200)
  }

  const handleSaveBasket = () => {
    const saved = saveBasket(basketLabel)
    if (!saved) return
    setBasketLabel('')
    flashBasketNotice(`${saved.label} saved for later checkout`)
  }

  const clearFranReward = () => {
    if (franAppliedReward?.status === 'quoted') {
      removeLine(franAppliedReward.lineId)
    }
    setFranAppliedReward(null)
    setFranQuote(null)
    setFranRewardBasketKey(null)
  }

  const clearFranSession = () => {
    clearFranReward()
    setFranSession(null)
    setFranPreview(null)
    setFranPreviewError(null)
    setFranLoyaltySync(null)
    setFranMemberDialogOpen(false)
    setCustomer(null)
  }

  const handleClearBasket = () => {
    clearSale()
    clearFranReward()
  }

  const quoteFranReward = async (reward: FranRewardDecision, pointsToRedeem?: number) => {
    if (!franSession || !franPreview) return
    setFranQuoteLoading(true)
    setFranPreviewError(null)
    try {
      const quote = await franCrm.quoteRewardRedemption({
        session: franSession,
        preview: franPreview,
        rewardId: reward.id,
        pointsToRedeem,
        basketTotal: franBasketTotals.total,
        currency: STORE.currency,
      })
      setFranQuote(quote)
    } catch (err) {
      setFranPreviewError(err instanceof Error ? err.message : 'Fran reward quote failed')
    } finally {
      setFranQuoteLoading(false)
    }
  }

  const confirmFranRewardQuote = () => {
    if (!franQuote) return
    const lineId = addAdjustmentLine({
      sku: `FRAN-${franQuote.rewardId.toUpperCase()}`,
      name: franQuote.lineLabel,
      amount: -Math.abs(franQuote.amount),
      lineKind: franQuote.pointsCost > 0 ? 'fran_points' : 'fran_reward',
      discountLabel: franQuote.title,
      note: franQuote.pointsCost > 0
        ? 'Fran CRM quoted points redemption. Deduct on payment confirmation.'
        : 'Fran CRM quoted reward',
      franRewardQuoteId: franQuote.quoteId,
      franDecisionRef: franQuote.decisionRef,
    })
    setFranAppliedReward({
      lineId,
      quote: franQuote,
      confirmedAt: new Date().toISOString(),
      status: 'quoted',
      commit: null,
      reverse: null,
      error: null,
    })
    setFranRewardBasketKey(franBasketKey)
    setFranQuote(null)
  }

  const buildFranSaleContext = (
    appliedReward: FranAppliedReward | null,
    loyaltySync: FranLoyaltySyncState | null = franLoyaltySync
  ): FranSaleContext => ({
    counterSession: franSession,
    basketPreview: franPreview,
    appliedReward,
    loyaltySync,
    memberMode: franSession?.mode ?? null,
  })

  const finalFranLoyaltySync = (
    appliedReward: FranAppliedReward | null,
    pointsEarned: number
  ): FranLoyaltySyncState | null => {
    const member = franSession?.member ?? null
    if (!member || member.tourist) return null

    const rewardCommitFailed = appliedReward?.status === 'failed'
    const shouldQueue = rewardCommitFailed || franLoyaltySync?.status === 'queued' || !franPreview
    if (!shouldQueue) {
      return {
        status: 'online',
        pointsEarnQueued: 0,
        reason: null,
        queuedAt: null,
        syncOnReconnect: false,
      }
    }

    return {
      status: 'queued',
      pointsEarnQueued: pointsEarned,
      reason: rewardCommitFailed
        ? appliedReward?.error ?? 'Fran CRM reward commit failed at payment completion.'
        : franLoyaltySync?.reason ?? 'Fran CRM preview unavailable at payment completion.',
      queuedAt: new Date().toISOString(),
      syncOnReconnect: true,
    }
  }

  const franReverseReasonKey = (reason: string) =>
    reason.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'reversal'

  const reverseCommittedFranReward = async (
    reward: FranAppliedReward,
    receiptNo: string,
    reason: 'payment_failed' | 'transaction_void'
  ): Promise<FranAppliedReward> => {
    if (reward.status !== 'committed' || !reward.commit) return reward

    try {
      const reverse = await franCrm.reverseRewardRedemption({
        commit: reward.commit,
        quote: reward.quote,
        receiptNo,
        reason,
        idempotencyKey: `fran:${reward.quote.quoteId}:reverse:${franReverseReasonKey(reason)}`,
      })

      return {
        ...reward,
        status: 'reversed',
        reverse,
        error: null,
      }
    } catch (err) {
      return {
        ...reward,
        status: 'reverse_failed',
        error: err instanceof Error ? err.message : 'Fran reward reversal failed',
      }
    }
  }

  const handlePaymentFailure = async (reason: string) => {
    if (franAppliedReward?.status === 'quoted') {
      removeLine(franAppliedReward.lineId)
      setFranAppliedReward(null)
      setFranQuote(null)
      setFranRewardBasketKey(null)
      setFranPreviewError('Payment failed. Fran reward was not committed; reward is available again.')
    } else if (franAppliedReward?.status === 'committed') {
      const receiptNo = `${STORE.code}-${String(pos.receiptCounter).padStart(6, '0')}`
      const reversed = await reverseCommittedFranReward(franAppliedReward, receiptNo, 'payment_failed')
      setFranAppliedReward(reversed)
      setFranPreviewError(
        reversed.status === 'reversed'
          ? 'Payment failed after Fran reward commit. CRM reversal restored points and made the reward available again.'
          : reversed.error ?? 'Fran reward reversal failed.'
      )
    } else {
      setFranPreviewError(reason || 'Payment failed.')
    }
    setPaymentOpen(false)
  }

  const handleVoidCompletedSale = async () => {
    const sale = pos.lastSale
    if (!sale || sale.saleStatus === 'voided') return

    setVoidingSale(true)
    try {
      const reward = sale.fran?.appliedReward ?? null
      const reversedReward = reward
        ? await reverseCommittedFranReward(reward, sale.receiptNo, 'transaction_void')
        : null
      const voidedAtIso = new Date().toISOString()
      const voidedSale: CompletedSale = {
        ...sale,
        saleStatus: 'voided',
        voidedAtIso,
        voidReason: 'transaction_void',
        payments: sale.payments.map((payment) => ({ ...payment, status: 'voided' })),
        fran: sale.fran
          ? {
              ...sale.fran,
              appliedReward: reversedReward,
            }
          : null,
      }

      updateLastSale(voidedSale)
      const outboxEvents = buildPosOutboxEventsForCompletedSale(voidedSale, {
        workspaceId: company?.id ?? 'demo',
        actorId: pos.user?.staffMemberId ?? pos.user?.id ?? null,
      })
      void persistPosOutboxEvents(company?.id, outboxEvents).then(refreshPendingSourceEvents)
    } finally {
      setVoidingSale(false)
    }
  }

  const completePaidSale = async () => {
    let saleReward = franAppliedReward
    const nextReceiptNo = `${STORE.code}-${String(pos.receiptCounter).padStart(6, '0')}`
    if (franAppliedReward?.status === 'quoted') {
      try {
        const commit = await franCrm.commitRewardRedemption({
          quote: franAppliedReward.quote,
          receiptNo: nextReceiptNo,
          idempotencyKey: `fran:${franAppliedReward.quote.quoteId}:commit`,
        })
        saleReward = {
          ...franAppliedReward,
          status: 'committed',
          commit,
          error: null,
        }
        setFranAppliedReward(saleReward)
      } catch (err) {
        saleReward = {
          ...franAppliedReward,
          status: 'failed',
          error: err instanceof Error ? err.message : 'Fran reward commit failed',
        }
        setFranAppliedReward(saleReward)
      }
    }

    try {
      const canFranEarn = Boolean(franSession?.member && !franSession.member.tourist)
      const finalPointsEarned = canFranEarn ? franPreview?.earnPoints ?? provisionalFranEarnPoints : 0
      const finalLoyaltySync = finalFranLoyaltySync(saleReward, finalPointsEarned)
      const sale = completeSale({
        fran: buildFranSaleContext(saleReward, finalLoyaltySync),
        pointsEarned: finalPointsEarned,
      })
      const outboxEvents = buildPosOutboxEventsForCompletedSale(sale, {
        workspaceId: company?.id ?? 'demo',
        actorId: pos.user?.staffMemberId ?? pos.user?.id ?? null,
      })
      void persistPosOutboxEvents(company?.id, outboxEvents).then(refreshPendingSourceEvents)
      const shouldSyncToSkums = mode === 'live' && Boolean(skumsConnector)
      setSaleSync({
        status: shouldSyncToSkums ? 'syncing' : 'not_required',
        idempotencyKey: sale.idempotencyKey,
        updatedAt: new Date().toISOString(),
      })
      if (shouldSyncToSkums && skumsConnector) {
        void syncSkumsSaleWrite(sale, skumsConnector).then((state) => {
          setSaleSync(state)
          refreshPendingSaleWrites()
        })
      }
      setPaymentOpen(false)
      setCompletedOpen(true)
      setFranSession(null)
      setFranPreview(null)
      setFranQuote(null)
      setFranAppliedReward(null)
      setFranRewardBasketKey(null)
      setFranLoyaltySync(null)
      setFranPreviewError(null)
      setFranCustomerOpen(false)
      setFranMemberDialogOpen(false)
    } catch (err) {
      if (saleReward?.status === 'committed') {
        const reversed = await reverseCommittedFranReward(saleReward, nextReceiptNo, 'payment_failed')
        setFranAppliedReward(reversed)
        setFranPreviewError(
          reversed.status === 'reversed'
            ? 'Payment failed after Fran reward commit. CRM reversal restored points and made the reward available again.'
            : reversed.error ?? 'Payment failed after Fran reward commit. Fran reversal needs attention.'
        )
      } else {
        setFranPreviewError(err instanceof Error ? err.message : 'Payment completion failed.')
      }
      setPaymentOpen(false)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <form
        className="flex shrink-0 flex-col gap-2 border-b bg-card p-3 md:flex-row md:items-center"
        onSubmit={(event) => {
          event.preventDefault()
          void submitProductEntry()
        }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Label htmlFor="product-entry" className="hidden shrink-0 text-xs font-semibold uppercase text-muted-foreground md:block">
            Product
          </Label>
          <Label htmlFor="product-entry" className="sr-only">Unified product entry</Label>
          <div className="relative min-w-0 flex-1">
            <ScanLine className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="product-entry"
              ref={productEntryRef}
              placeholder="Barcode / QR / SKU"
              aria-label="Product barcode, QR, or SKU"
              enterKeyHint="done"
              autoComplete="off"
              autoFocus
              className="h-11 pl-9 text-base sm:text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button type="submit" className="h-11 shrink-0 gap-2" disabled={scanResolving}>
            {scanResolving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
            <span className="hidden sm:inline">Add product</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </div>
        <div className="flex shrink-0 items-center justify-between gap-2 md:justify-end">
          <Badge variant="secondary" className="shrink-0">
            {catalogSource === 'skums' ? 'SKUMS catalog' : catalogSource === 'live' ? 'Live catalog' : 'Demo catalog'}
          </Badge>
          <div className="flex shrink-0 rounded-md border bg-background p-0.5">
            <button
              type="button"
              onClick={() => setCatalogViewMode('grid')}
              title="Grid view"
              aria-label="Grid view"
              aria-pressed={catalogView === 'grid'}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-sm transition-colors cursor-pointer',
                catalogView === 'grid' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <Grid2X2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setCatalogViewMode('list')}
              title="List view"
              aria-label="List view"
              aria-pressed={catalogView === 'list'}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-sm transition-colors cursor-pointer',
                catalogView === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </form>
      {scanMessage && (
        <div className="shrink-0 bg-card px-3 pb-3">
          <div
            className={cn(
              'flex items-start gap-2 rounded-md border px-3 py-2 text-sm',
              scanMessage.tone === 'success' && 'border-green-200 bg-green-50 text-green-800',
              scanMessage.tone === 'info' && 'border-blue-200 bg-blue-50 text-blue-800',
              scanMessage.tone === 'warning' && 'border-amber-200 bg-amber-50 text-amber-800',
              scanMessage.tone === 'error' && 'border-destructive/30 bg-destructive/10 text-destructive'
            )}
          >
            {scanMessage.tone === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>{scanMessage.text}</span>
          </div>
        </div>
      )}
      <FranMemberStrip
        session={franSession}
        preview={franPreview}
        appliedReward={franAppliedReward}
        previewLoading={franPreviewLoading}
        previewError={franPreviewError}
        loyaltySync={franLoyaltySync}
        onFindMember={() => setFranCustomerOpen(true)}
        onOpenDetails={() => setFranMemberDialogOpen(true)}
        onClearSession={clearFranSession}
      />
      <div className="flex h-full flex-col overflow-y-auto lg:flex-row min-h-0 flex-1 lg:overflow-hidden">
      {/* LEFT - catalogue */}
      <div className="flex min-h-[520px] min-w-0 flex-col lg:min-h-0 lg:flex-1">
        {/* Categories */}
        <div className="flex gap-1.5 overflow-x-auto border-b bg-card px-3 py-2">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={cn(
                'whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer',
                category === c ? 'bg-primary text-primary-foreground' : 'bg-secondary hover:bg-accent'
              )}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Catalogue */}
        <div
          className={cn(
            'flex-1 overflow-y-auto p-3',
            catalogView === 'grid'
              ? 'grid auto-rows-min grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4'
              : 'space-y-2'
          )}
        >
          {filtered.map((p) =>
            catalogView === 'grid'
              ? <ProductCard key={p.id} product={p} onAdd={() => addProduct(p)} />
              : <ProductListRow key={p.id} product={p} onAdd={() => addProduct(p)} />
          )}
          {filtered.length === 0 && (
            <p className="col-span-full py-10 text-center text-sm text-muted-foreground">
              {catalogLoading ? 'Loading products...' : catalogError || 'No products match.'}
            </p>
          )}
        </div>
      </div>

      {/* RIGHT — cart */}
      <div className="flex min-h-[460px] w-full shrink-0 flex-col border-t bg-card lg:min-h-0 lg:w-[380px] lg:border-l lg:border-t-0">
        {savedBaskets.length > 0 && (
          <div className="border-b bg-secondary/30 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Saved baskets</p>
              <Badge variant="secondary">{savedBaskets.length}</Badge>
            </div>
            <div className="space-y-2">
              {savedBaskets.slice(0, 3).map((basket) => (
                <div key={basket.id} className="rounded-md border bg-background p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{basket.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {Math.abs(basket.itemCount)} item{Math.abs(basket.itemCount) === 1 ? '' : 's'} - {formatCurrency(basket.total, STORE.currency)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        title="Resume basket"
                        onClick={() => {
                          resumeSavedBasket(basket.id)
                          flashBasketNotice(`${basket.label} resumed`)
                        }}
                        className="flex h-8 w-8 items-center justify-center rounded-md border hover:bg-accent"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Remove basket"
                        onClick={() => removeSavedBasket(basket.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-md border text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sales type */}
        <div className="border-b px-3 py-2">
          <div className="flex flex-wrap gap-1.5">
            {SALES_TYPES.map((s) => (
              <button
                key={s.value}
                onClick={() => chooseSalesType(s.value)}
                title={s.hint}
                className={cn(
                  'rounded-md border px-2 py-1 text-xs font-medium transition-colors cursor-pointer',
                  salesType === s.value ? 'border-primary bg-accent' : 'hover:bg-accent',
                  s.requiresManager && salesType !== s.value && 'text-muted-foreground'
                )}
              >
                {s.label}
                {s.requiresManager && ' 🔒'}
              </button>
            ))}
          </div>
        </div>

        {/* Promotion prompt */}
        {promoQualifies && (
          <div className="m-3 mb-0 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="flex-1">
              <p className="font-medium text-amber-900">{ACTIVE_PROMOTION.title}</p>
              <p className="text-xs text-amber-700">{ACTIVE_PROMOTION.description}</p>
            </div>
            <button onClick={() => setPromoDismissed(true)} className="text-amber-600 hover:text-amber-900">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Lines */}
        <div className="flex-1 overflow-y-auto p-3">
          {cart.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
              <ShoppingBag className="h-10 w-10 opacity-30" />
              <p className="mt-2 text-sm">Cart is empty</p>
              <p className="text-xs">Scan or tap a product to begin.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {cart.map((l) => (
                <CartRow
                  key={l.lineId}
                  line={l}
                  onInc={() => updateQty(l.lineId, 1)}
                  onDec={() => updateQty(l.lineId, -1)}
                  onRemove={() => {
                    if (isFranAdjustmentLine(l) && franAppliedReward?.lineId === l.lineId) clearFranReward()
                    else removeLine(l.lineId)
                  }}
                  onDiscount={() => setLineAction({ mode: 'discount', line: l })}
                  onOverride={() => setLineAction({ mode: 'override', line: l })}
                  readOnly={isFranAdjustmentLine(l)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Totals + actions */}
        <div className="border-t p-3">
          <div className="space-y-1 text-sm">
            <Row label={`Subtotal (${totals.itemCount} item${Math.abs(totals.itemCount) === 1 ? '' : 's'})`} value={formatCurrency(totals.subtotal, STORE.currency)} />
            {totals.discountTotal > 0 && (
              <Row label="Discounts" value={`-${formatCurrency(totals.discountTotal, STORE.currency)}`} muted />
            )}
            {cartPriceOverride && (
              <Row
                label={`Cart override (${cartPriceOverride.reason})`}
                value={formatSignedCurrency(totals.cartAdjustment)}
                muted
              />
            )}
            <Row label="GST 9% (incl.)" value={formatCurrency(totals.taxIncluded, STORE.currency)} muted />
            <div className="flex items-center justify-between pt-1 text-2xl font-bold">
              <span>Total</span>
              <span className="tabular-nums">{formatCurrency(totals.total, STORE.currency)}</span>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={handleSaveBasket} disabled={cart.length === 0}>
              <BookmarkPlus className="h-4 w-4" /> Save basket
            </Button>
            <Button variant="outline" onClick={() => setCartOverrideOpen(true)} disabled={cart.length === 0}>
              <Pencil className="h-4 w-4" /> Override total
            </Button>
            <Button variant="outline" className="col-span-2" onClick={handleClearBasket} disabled={cart.length === 0}>
              <Trash2 className="h-4 w-4" /> Clear
            </Button>
          </div>
          {cart.length > 0 && (
            <Input
              className="mt-2 h-9"
              placeholder="Optional basket name"
              value={basketLabel}
              onChange={(e) => setBasketLabel(e.target.value)}
            />
          )}
          {basketNotice && (
            <p className="mt-2 rounded-md bg-secondary px-3 py-2 text-xs text-muted-foreground">{basketNotice}</p>
          )}
          <Button
            className="mt-2 h-14 w-full text-lg"
            disabled={cart.length === 0 || totals.total <= 0 || !franSession}
            onClick={() => setPaymentOpen(true)}
          >
            {franSession ? `Pay ${formatCurrency(totals.total, STORE.currency)}` : 'Resolve member or exception'}
          </Button>
        </div>
      </div>

      {/* Modals */}
      <FranCustomerModal
        open={franCustomerOpen}
        client={franCrm}
        onClose={() => setFranCustomerOpen(false)}
        onResolved={(session, nextCustomer) => {
          clearFranReward()
          setFranSession(session)
          setCustomer(nextCustomer)
          setFranLoyaltySync(null)
          setFranQuote(null)
          setFranAppliedReward(null)
          setFranRewardBasketKey(null)
          setFranCustomerOpen(false)
          setFranMemberDialogOpen(true)
        }}
      />

      <Dialog open={franMemberDialogOpen} onOpenChange={setFranMemberDialogOpen}>
        <DialogContent
          className="flex max-h-[92dvh] w-[calc(100vw-1rem)] max-w-3xl flex-col overflow-hidden p-0 sm:w-full"
          onClose={() => setFranMemberDialogOpen(false)}
        >
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle>Fran member & rewards</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto p-3 sm:p-4">
            {franSession ? (
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
                <FranCounterProfileCard session={franSession} preview={franPreview} />
                <FranRewardRedemptionPanel
                  preview={franPreview}
                  quote={franQuote}
                  appliedReward={franAppliedReward}
                  quoteLoading={franQuoteLoading}
                  onQuote={(reward, pointsToRedeem) => { void quoteFranReward(reward, pointsToRedeem) }}
                  onConfirmQuote={confirmFranRewardQuote}
                  onClearReward={clearFranReward}
                />
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-center">
                <p className="text-sm font-semibold">Resolve Fran member / exception</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Scan a member QR/barcode, type a mobile number, or choose non-member/tourist before payment.
                </p>
                <Button className="mt-3" onClick={() => setFranCustomerOpen(true)}>
                  Find member
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <LineActionModal
        open={lineAction !== null}
        mode={lineAction?.mode ?? 'discount'}
        line={lineAction?.line ?? null}
        onClose={() => setLineAction(null)}
        onApplyDiscount={(lineId, amount, label) => {
          setLineAction(null)
          setPendingAuth({
            label: `Authorise discount: ${label}`,
            run: () => setLineDiscount(lineId, amount, label),
          })
        }}
        onApplyOverride={(lineId, price, reason) => {
          setLineAction(null)
          setPendingAuth({
            label: `Authorise price override to ${formatCurrency(price, STORE.currency)} (${reason})`,
            run: () => overrideLinePrice(lineId, price, reason),
          })
        }}
      />

      <CartOverrideModal
        open={cartOverrideOpen}
        currentTotal={preOverrideTotal}
        existingOverride={cartPriceOverride}
        onClose={() => setCartOverrideOpen(false)}
        onApply={(targetTotal, reason) => {
          setCartOverrideOpen(false)
          setPendingAuth({
            label: `Authorise cart total override to ${formatCurrency(targetTotal, STORE.currency)} (${reason})`,
            run: () => overrideCartTotal(targetTotal, reason),
          })
        }}
        onClear={() => {
          setCartOverrideOpen(false)
          setPendingAuth({
            label: 'Authorise removing cart total override',
            run: clearCartPriceOverride,
          })
        }}
      />

      <ManagerAuthModal
        open={pendingAuth !== null}
        action={pendingAuth?.label ?? ''}
        onCancel={() => setPendingAuth(null)}
        onAuthorized={() => {
          pendingAuth?.run()
          setPendingAuth(null)
        }}
      />

      <PaymentModal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        onComplete={() => { void completePaidSale() }}
        onPaymentFailed={(reason) => { void handlePaymentFailure(reason) }}
      />

      <SaleCompleteModal
        open={completedOpen}
        sale={pos.lastSale}
        skumsSync={saleSync}
        pendingSkumsSaleWrites={pendingSaleWrites}
        retryingSkumsSync={retryingSaleWrites}
        pendingSourceEvents={pendingSourceEvents}
        retryingSourceEvents={retryingSourceEvents}
        onRetrySourceEvents={() => { void retryQueuedSourceEvents() }}
        voidingSale={voidingSale}
        onRetrySkumsSync={() => { void retryQueuedSaleWrites() }}
        onVoidSale={() => { void handleVoidCompletedSale() }}
        onNewSale={() => setCompletedOpen(false)}
      />

      <Dialog open={scanChoices.length > 0} onOpenChange={(open) => !open && setScanChoices([])}>
        <DialogContent className="max-w-md">
          <div>
            <h2 className="text-lg font-semibold">Select scanned item</h2>
            <p className="text-sm text-muted-foreground">SKUMS returned more than one possible match.</p>
          </div>
          <div className="space-y-2">
            {scanChoices.map(({ product, confidence }) => (
              <button
                key={`${product.id}-${product.sku}`}
                type="button"
                onClick={() => {
                  addProduct(product)
                  setSearch('')
                  setScanChoices([])
                  setScanMessage({ tone: 'success', text: 'Selected SKUMS match added to cart.' })
                  focusProductEntry()
                }}
                className="flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left hover:bg-accent"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{product.name}</span>
                  <span className="block text-xs text-muted-foreground">{product.sku}</span>
                </span>
                <Badge variant="secondary">{Math.round(confidence * 100)}%</Badge>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  )
}

function ProductCard({ product, onAdd }: { product: Product; onAdd: () => void }) {
  const out = product.qtyOnHand <= 0
  const price = product.mdPrice ?? product.price
  return (
    <button
      onClick={onAdd}
      disabled={out}
      className={cn(
        'group flex flex-col rounded-xl border bg-card p-3 text-left shadow-sm transition-all hover:border-primary hover:shadow active:scale-[0.99] cursor-pointer',
        out && 'cursor-not-allowed opacity-50'
      )}
    >
      <div className="mb-2 flex items-start justify-between">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-secondary text-2xl">
          {product.emoji}
        </div>
        <div className="flex flex-col items-end gap-1">
          {product.mdPrice != null && <Badge variant="warning">MD / SSS</Badge>}
          {!product.returnable && <Badge variant="outline" className="text-[10px]">Non-returnable</Badge>}
        </div>
      </div>
      <p className="line-clamp-2 text-sm font-medium leading-tight">{product.name}</p>
      <p className="text-xs text-muted-foreground">{product.sku}</p>
      {product.storeLocationCode && (
        <p className="mt-0.5 text-[11px] font-medium text-primary">Loc {product.storeLocationCode}</p>
      )}
      <div className="mt-2 flex items-end justify-between">
        <div>
          {product.mdPrice != null ? (
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-destructive">{formatCurrency(product.mdPrice, STORE.currency)}</span>
              <span className="text-xs text-muted-foreground line-through">
                {formatCurrency(product.price, STORE.currency)}
              </span>
            </div>
          ) : (
            <span className="font-semibold">{formatCurrency(price, STORE.currency)}</span>
          )}
        </div>
        <span className={cn('text-xs', out ? 'font-medium text-destructive' : 'text-muted-foreground')}>
          {out ? 'Out' : `${product.qtyOnHand} in stock`}
        </span>
      </div>
    </button>
  )
}

function ProductListRow({ product, onAdd }: { product: Product; onAdd: () => void }) {
  const out = product.qtyOnHand <= 0
  const price = product.mdPrice ?? product.price
  return (
    <button
      onClick={onAdd}
      disabled={out}
      className={cn(
        'group flex w-full items-center gap-3 rounded-lg border bg-card p-3 text-left shadow-sm transition-colors hover:border-primary hover:bg-accent/40 active:scale-[0.997] cursor-pointer',
        out && 'cursor-not-allowed opacity-50'
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary text-xl">
        {product.emoji}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-medium">{product.name}</p>
          {product.mdPrice != null && <Badge variant="warning" className="shrink-0">MD / SSS</Badge>}
          {!product.returnable && <Badge variant="outline" className="shrink-0 text-[10px]">Non-returnable</Badge>}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {product.sku} - {product.category}
          {product.storeLocationCode ? ` - Loc ${product.storeLocationCode}` : ''}
        </p>
      </div>
      <div className="w-24 shrink-0 text-right">
        {product.mdPrice != null ? (
          <>
            <p className="font-semibold text-destructive">{formatCurrency(product.mdPrice, STORE.currency)}</p>
            <p className="text-xs text-muted-foreground line-through">{formatCurrency(product.price, STORE.currency)}</p>
          </>
        ) : (
          <p className="font-semibold">{formatCurrency(price, STORE.currency)}</p>
        )}
      </div>
      <span className={cn('w-20 shrink-0 text-right text-xs', out ? 'font-medium text-destructive' : 'text-muted-foreground')}>
        {out ? 'Out' : `${product.qtyOnHand} stock`}
      </span>
    </button>
  )
}

function CartRow({
  line,
  onInc,
  onDec,
  onRemove,
  onDiscount,
  onOverride,
  readOnly = false,
}: {
  line: CartLine
  onInc: () => void
  onDec: () => void
  onRemove: () => void
  onDiscount: () => void
  onOverride: () => void
  readOnly?: boolean
}) {
  const net = cartLineNet(line)
  const isReturn = line.qty < 0
  const isFranLine = isFranAdjustmentLine(line)
  return (
    <div
      className={cn(
        'rounded-lg border p-2.5',
        isReturn && 'border-destructive/40 bg-destructive/5',
        isFranLine && 'border-green-200 bg-green-50'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{line.name}</p>
          <p className="text-xs text-muted-foreground">
            {line.sku} · {formatCurrency(line.unitPrice, STORE.currency)}
            {line.isMarkdown && <span className="ml-1 text-amber-600">MD</span>}
            {line.overridden && <span className="ml-1 text-blue-600">overridden</span>}
            {isFranLine && <span className="ml-1 text-green-700">Fran CRM</span>}
            {line.storeLocationCode && <span className="ml-1 text-primary">Loc {line.storeLocationCode}</span>}
          </p>
          {line.lineDiscount > 0 && (
            <p className="text-xs text-green-700">
              {line.discountLabel}: -{formatCurrency(line.lineDiscount, STORE.currency)}
            </p>
          )}
          {line.overridden && line.overrideReason && (
            <p className="text-xs text-blue-700">Price override: {line.overrideReason}</p>
          )}
          {line.franDecisionRef && (
            <p className="text-xs text-green-700">Decision {line.franDecisionRef}</p>
          )}
        </div>
        <span className={cn('shrink-0 text-sm font-semibold tabular-nums', isReturn && 'text-destructive')}>
          {formatCurrency(net, STORE.currency)}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between">
        {readOnly ? (
          <span className="rounded-md bg-white/70 px-2 py-1 text-xs font-medium text-green-800">
            CRM quoted line
          </span>
        ) : (
          <div className="flex items-center gap-1">
            <button onClick={onDec} className="flex h-7 w-7 items-center justify-center rounded-md border hover:bg-accent cursor-pointer">
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="w-8 text-center text-sm font-medium tabular-nums">{line.qty}</span>
            <button onClick={onInc} className="flex h-7 w-7 items-center justify-center rounded-md border hover:bg-accent cursor-pointer">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <div className="flex items-center gap-1">
          {!readOnly && (
            <>
              <button onClick={onDiscount} title="Line discount" className="flex h-7 w-7 items-center justify-center rounded-md border hover:bg-accent cursor-pointer">
                <Tag className="h-3.5 w-3.5" />
              </button>
              <button onClick={onOverride} title="Price override" className="flex h-7 w-7 items-center justify-center rounded-md border hover:bg-accent cursor-pointer">
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          <button onClick={onRemove} title="Remove" className="flex h-7 w-7 items-center justify-center rounded-md border text-destructive hover:bg-destructive/10 cursor-pointer">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

function CartOverrideModal({
  open,
  currentTotal,
  existingOverride,
  onClose,
  onApply,
  onClear,
}: {
  open: boolean
  currentTotal: number
  existingOverride: { id: string; reason: string; targetTotal: number; adjustment: number } | null
  onClose: () => void
  onApply: (targetTotal: number, reason: string) => void
  onClear: () => void
}) {
  const [targetTotal, setTargetTotal] = useState('')
  const [reason, setReason] = useState(PRICE_OVERRIDE_REASONS[2])

  useEffect(() => {
    if (!open) return
    setTargetTotal((existingOverride?.targetTotal ?? currentTotal).toFixed(2))
    setReason(existingOverride?.reason ?? PRICE_OVERRIDE_REASONS[2])
  }, [currentTotal, existingOverride?.id, existingOverride?.reason, existingOverride?.targetTotal, open])

  const parsedTarget = Number(targetTotal)
  const validTarget = Number.isFinite(parsedTarget) && parsedTarget >= 0
  const adjustment = validTarget ? parsedTarget - currentTotal : 0
  const isUnchanged = Math.abs(adjustment) < 0.005 && !existingOverride

  const submit = () => {
    if (!validTarget || isUnchanged) return
    onApply(parsedTarget, reason)
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-w-md" onClose={onClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5" />
            Cart Total Override
          </DialogTitle>
        </DialogHeader>

        <div className="mt-2 rounded-lg border bg-muted/40 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Current cart total</span>
            <span className="font-medium tabular-nums">{formatCurrency(currentTotal, STORE.currency)}</span>
          </div>
          {existingOverride && (
            <div className="mt-1 flex justify-between text-blue-700">
              <span>Active override</span>
              <span className="font-medium tabular-nums">{formatCurrency(existingOverride.targetTotal, STORE.currency)}</span>
            </div>
          )}
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <Label htmlFor="cart-override-total">New cart total ({STORE.currency})</Label>
            <Input
              id="cart-override-total"
              type="number"
              min="0"
              step="0.01"
              className="mt-1"
              placeholder={currentTotal.toFixed(2)}
              value={targetTotal}
              onChange={(event) => setTargetTotal(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="cart-override-reason">Reason</Label>
            <select
              id="cart-override-reason"
              className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            >
              {PRICE_OVERRIDE_REASONS.map((overrideReason) => (
                <option key={overrideReason}>{overrideReason}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-primary/5 p-3 text-sm">
            <span className="text-muted-foreground">Cart adjustment</span>
            <span className="text-lg font-semibold tabular-nums">{formatSignedCurrency(adjustment)}</span>
          </div>
          <p className="text-xs text-muted-foreground">Requires manager authorisation to apply.</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {existingOverride && (
              <Button variant="outline" onClick={onClear}>
                Remove override
              </Button>
            )}
            <Button
              className={cn(existingOverride ? '' : 'sm:col-span-2')}
              onClick={submit}
              disabled={!validTarget || isUnchanged}
            >
              Continue to authorisation
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={cn('flex justify-between', muted && 'text-muted-foreground')}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}
