import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BrowserMultiFormatOneDReader, BrowserQRCodeReader } from '@zxing/browser'
import { BarcodeFormat, ChecksumException, DecodeHintType, FormatException, NotFoundException } from '@zxing/library'
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
  Camera,
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
import { createFranExceptionSession, FranCustomerModal } from '@/pos/fran/components/fran-customer-modal'
import { FranMemberStrip } from '@/pos/fran/components/fran-member-strip'
import { FranRewardRedemptionPanel } from '@/pos/fran/components/fran-reward-redemption-panel'
import { FranVoucherScanPanel } from '@/pos/fran/components/fran-voucher-scan'
import {
  createFranCrmClient,
  fetchPosCapabilities,
  isFranCrmLiveConfigured,
} from '@/pos/fran/lib/fran-crm-client'
import { mockPreviewBasket } from '@/pos/fran/mock-crm'
import { evaluateFranPolicy } from '@/pos/fran/lib/fran-policy-evaluator'
import type {
  FranAppliedReward,
  FranBasketLineInput,
  FranBasketPreview,
  FranCounterSession,
  FranLoyaltySyncState,
  FranRewardDecision,
  FranRewardQuote,
  FranVoucherScan,
  FranSaleContext,
} from '@/pos/fran/types'
import { listSkumsPosCatalog, quoteSkumsPosBasket, resolveSkumsPosScan } from '@/pos/lib/skums-client'
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
import { useStripeConnector } from '@/hooks/use-stripe-connector'
import { tapToPaySupported, warmUpTapToPay } from '@/pos/lib/stripe-tap-to-pay'
import type {
  Product as DbProduct,
  SkumsGraphRefs,
  SkumsPosBasketQuoteInput,
  SkumsPosCatalogItem,
  SkumsPosScanMatch,
} from '@pos/shared'
import { POS_REGISTER_CODE } from '@/pos/lib/skums-sale-adapter'

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

type ScanMessage = { tone: 'info' | 'success' | 'warning' | 'error'; text: string }
type CameraScanStatus = 'idle' | 'starting' | 'scanning' | 'detected' | 'unsupported' | 'error'
type BarcodeResult = { rawValue?: string }
type NativeBarcodeDetector = { detect: (source: CanvasImageSource) => Promise<BarcodeResult[]> }
type NativeBarcodeDetectorConstructor = new (options?: { formats?: string[] }) => NativeBarcodeDetector
type WindowWithBarcodeDetector = Window & typeof globalThis & { BarcodeDetector?: NativeBarcodeDetectorConstructor }
type CameraScannerControls = { stop: () => void }

type CatalogViewMode = 'grid' | 'list'

const CAMERA_BARCODE_FORMATS = [
  'qr_code',
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'code_128',
  'code_39',
  'code_93',
  'codabar',
  'itf',
  'data_matrix',
]

const ZXING_1D_BARCODE_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODE_93,
  BarcodeFormat.CODABAR,
  BarcodeFormat.ITF,
]

function createZxingReaders() {
  const oneDimensionalHints = new Map<DecodeHintType, BarcodeFormat[] | boolean>([
    [DecodeHintType.POSSIBLE_FORMATS, ZXING_1D_BARCODE_FORMATS],
    [DecodeHintType.TRY_HARDER, true],
  ])
  const qrHints = new Map<DecodeHintType, boolean>([[DecodeHintType.TRY_HARDER, true]])

  return [new BrowserQRCodeReader(qrHints), new BrowserMultiFormatOneDReader(oneDimensionalHints)]
}

function isExpectedZxingScanMiss(error: unknown) {
  if (error instanceof NotFoundException || error instanceof ChecksumException || error instanceof FormatException) return true
  return error instanceof Error && error.message.includes('Could not create a Canvas')
}

function cameraScanErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : ''
  const lower = raw.toLowerCase()
  if (lower.includes('notallowed') || lower.includes('permission') || lower.includes('denied') || lower.includes('securityerror')) {
    return 'Camera is blocked. Allow Camera for Fran POS in Android settings, then tap the camera icon again.'
  }
  if (lower.includes('notfound') || lower.includes('requested device not found')) {
    return 'No camera was found on this device. Type the SKU or open Catalog instead.'
  }
  if (lower.includes('notreadable') || lower.includes('trackstart') || lower.includes('abort')) {
    return 'Another app is using the camera. Close it and tap the camera icon again.'
  }
  return raw || 'Camera scanner failed. Continue with the product entry field.'
}

async function requestCameraStream() {
  const attempts: MediaStreamConstraints[] = [
    {
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    },
    { audio: false, video: { facingMode: { ideal: 'environment' } } },
    { audio: false, video: true },
  ]
  let lastError: unknown = null
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints)
    } catch (err) {
      lastError = err
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Camera permission was blocked or no camera was found.')
}

/** Pause re-accept while the cart processes a hit, then keep the stream open. */
const CAMERA_RESCAN_COOLDOWN_MS = 1200
/** Ignore the same code still held in frame after it was accepted. */
const CAMERA_SAME_CODE_DEBOUNCE_MS = 2500

function formatSignedCurrency(value: number) {
  if (Math.abs(value) < 0.005) return formatCurrency(0, STORE.currency)
  return `${value > 0 ? '+' : '-'}${formatCurrency(Math.abs(value), STORE.currency)}`
}

function toPosProduct(item: SkumsPosCatalogItem): Product {
  return {
    id: item.id,
    sku: item.sku,
    barcodes: [item.identifiers?.ean, item.identifiers?.upc, item.identifiers?.gtin]
      .filter((code): code is string => Boolean(code)),
    name: item.display_name || item.title,
    category: item.category_name || 'Uncategorized',
    storeLocationCode: normalizeStoreStorageLocationCode(item.storage_location_code) ?? storeLocationCodeFromMetadata(item.metadata),
    price: item.list_price || item.unit_price || 0,
    mdPrice: item.unit_price !== item.list_price ? item.unit_price : undefined,
    qtyOnHand: item.track_inventory ? item.stock_quantity : 999,
    returnable: true,
    emoji: '',
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
    barcodes: product.barcode ? [product.barcode] : [],
    name: product.name,
    category: product.category?.name || 'Uncategorized',
    storeLocationCode: storeLocationCodeFromMetadata(product.metadata),
    price: Number(product.price) || 0,
    qtyOnHand: product.track_inventory ? product.inventory_count : 999,
    returnable: true,
    emoji: '',
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

function lightweightHash(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return hash.toString(16)
}

function productMatchesEntryQuery(product: Product, normalizedQuery: string) {
  if (!normalizedQuery) return true
  return (
    product.name.toLowerCase().includes(normalizedQuery) ||
    product.sku.toLowerCase().includes(normalizedQuery) ||
    (product.barcodes?.some((code) => code.toLowerCase().includes(normalizedQuery)) ?? false) ||
    (product.storeLocationCode?.toLowerCase().includes(normalizedQuery) ?? false)
  )
}

function availabilityForProduct(product: Product | undefined) {
  const availableQuantity = product?.qtyOnHand ?? null
  return {
    status: availableQuantity == null
      ? 'unknown'
      : availableQuantity <= 0
        ? 'out_of_stock'
        : availableQuantity <= 3
          ? 'low_stock'
          : 'available',
    track_inventory: availableQuantity !== 999,
    available_quantity: availableQuantity,
    snapshot_at: new Date().toISOString(),
  } as const
}

function restrictedFlagsForLine(line: CartLine, product: Product | undefined) {
  const flags: string[] = []
  if (!line.returnable || product?.returnable === false) flags.push('final_sale')
  if (line.lineKind && line.lineKind !== 'product') flags.push(line.lineKind)
  return flags
}

function toFranBasketLine(line: CartLine, product?: Product): FranBasketLineInput {
  const availability = availabilityForProduct(product)
  return {
    lineId: line.lineId,
    skumsProductId: line.product_id ?? product?.skums?.product_id ?? null,
    skumsVariantId: line.variant_id ?? product?.skums?.variant_id ?? null,
    sku: line.sku,
    barcode: line.identifier_id ?? null,
    name: line.name,
    quantity: line.qty,
    unitPrice: line.unitPrice,
    listPrice: line.listPrice,
    lineTotal: cartLineNet(line),
    lineKind: line.lineKind ?? 'product',
    quoteLineId: null,
    priceRevisionId: null,
    category: product?.category ?? null,
    brand: null,
    collection: null,
    rewardEligible: !isFranAdjustmentLine(line),
    sampleEligible: !isFranAdjustmentLine(line),
    restrictedFlags: restrictedFlagsForLine(line, product),
    availability,
  }
}

function toSkumsBasketQuoteLine(line: CartLine, product?: Product): SkumsPosBasketQuoteInput['lines'][number] {
  return {
    line_id: line.lineId,
    product_identity_id: line.product_identity_id ?? product?.skums?.product_identity_id ?? null,
    trade_unit_id: line.trade_unit_id ?? product?.skums?.trade_unit_id ?? null,
    listing_id: line.listing_id ?? product?.skums?.listing_id ?? null,
    channel_id: line.channel_id ?? product?.skums?.channel_id ?? null,
    sku_assignment_id: line.sku_assignment_id ?? product?.skums?.sku_assignment_id ?? null,
    identifier_id: line.identifier_id ?? product?.skums?.identifier_id ?? null,
    product_id: line.product_id ?? product?.skums?.product_id ?? null,
    variant_id: line.variant_id ?? product?.skums?.variant_id ?? null,
    batch_id: line.batch_id ?? product?.skums?.batch_id ?? null,
    sku: line.sku,
    barcode: line.identifier_id ?? null,
    display_name: line.name,
    quantity: line.qty,
    unit_price: line.unitPrice,
    list_price: line.listPrice,
    discount_amount: line.lineDiscount,
    line_total: cartLineNet(line),
    line_type: line.qty < 0 ? 'return' : 'sale',
    price_revision_id: null,
    category_name: product?.category ?? null,
    brand_name: null,
    collection_name: null,
    reward_eligible: !isFranAdjustmentLine(line),
    sample_eligible: !isFranAdjustmentLine(line),
    restricted_flags: restrictedFlagsForLine(line, product),
    availability: availabilityForProduct(product),
    metadata: {
      line_kind: line.lineKind ?? 'product',
      local_unit_price: line.unitPrice,
      local_list_price: line.listPrice,
      local_discount_label: line.discountLabel ?? null,
      overridden: line.overridden ?? false,
      override_reason: line.overrideReason ?? null,
    },
  }
}

export default function SalePage() {
  const pos = usePos()
  const { company } = useAuth()
  const { connector: skumsConnector } = useSkumsConnector()
  const { connector: stripe } = useStripeConnector()
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
  // Target: loyalty via SKUMS workspace key (POS â†’ SKUMS â†’ CRM).
  // Fallback: legacy direct CRM URL. Else mock.
  const franCrm = useMemo(() => {
    if (skumsConnector) {
      return createFranCrmClient({ mode: 'skums', skums: skumsConnector })
    }
    if (isFranCrmLiveConfigured()) return createFranCrmClient({ mode: 'live' })
    if (mode === 'demo') return createFranCrmClient({ mode: 'mock' })
    return createFranCrmClient()
  }, [mode, skumsConnector?.apiKey, skumsConnector?.apiUrl])

  /** M3: SKUMS + loyalty readiness when using workspace key */
  const [posCapabilities, setPosCapabilities] = useState<{
    ready_for_member_loyalty: boolean
    loyalty: { ok: boolean; status: string; message: string }
    skums: { ok: boolean }
  } | null>(null)
  const [posCapabilitiesError, setPosCapabilitiesError] = useState<string | null>(null)

  useEffect(() => {
    if (tapToPaySupported()) warmUpTapToPay(stripe)
  }, [])

  useEffect(() => {
    if (!skumsConnector) {
      setPosCapabilities(null)
      setPosCapabilitiesError(null)
      return
    }
    let cancelled = false
    void fetchPosCapabilities(skumsConnector)
      .then((caps) => {
        if (cancelled) return
        setPosCapabilities({
          ready_for_member_loyalty: Boolean(caps.ready_for_member_loyalty),
          loyalty: caps.loyalty,
          skums: caps.skums,
        })
        setPosCapabilitiesError(null)
      })
      .catch((err) => {
        if (cancelled) return
        setPosCapabilities(null)
        setPosCapabilitiesError(err instanceof Error ? err.message : 'Capabilities check failed')
      })
    return () => {
      cancelled = true
    }
  }, [skumsConnector?.apiKey, skumsConnector?.apiUrl])

  const openMemberLookup = () => {
    if (skumsConnector) {
      if (posCapabilitiesError) {
        setBasketNotice(
          `SKUMS not ready for loyalty: ${posCapabilitiesError}. Fix connector or use non-member/tourist.`,
        )
        return
      }
      if (posCapabilities && !posCapabilities.ready_for_member_loyalty) {
        setBasketNotice(
          posCapabilities.loyalty?.message ||
            'Loyalty not linked on this SKUMS workspace. HQ must set workspace_crm_links / FRAN_CRM_BASE_URL. Non-member and tourist still work.',
        )
        return
      }
    }
    setCameraOpen(false)
    setMobileCatalogOpen(false)
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    productEntryRef.current?.blur()
    franCustomerOpenRef.current = true
    setFranCustomerOpen(true)
  }

  const applyFranException = (mode: 'non_member' | 'tourist') => {
    const session = createFranExceptionSession(mode)
    clearFranReward()
    setFranSession(session)
    setCustomer(null)
    setFranLoyaltySync(null)
    setFranQuote(null)
    setFranAppliedReward(null)
    setFranRewardBasketKey(null)
    setFranPreview(null)
    setFranPreviewLoading(false)
    setFranPreviewError(null)
    setFranMemberDialogOpen(false)
    franCustomerOpenRef.current = false
    setFranCustomerOpen(false)
  }

  const [category, setCategory] = useState('All')
  const [search, setSearch] = useState('')
  const [franCustomerOpen, setFranCustomerOpen] = useState(false)
  const franCustomerOpenRef = useRef(false)
  franCustomerOpenRef.current = franCustomerOpen
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
  const [franVoucherScans, setFranVoucherScans] = useState<FranVoucherScan[]>([])
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [cartOverrideOpen, setCartOverrideOpen] = useState(false)
  const [completedOpen, setCompletedOpen] = useState(false)
  const [voidingSale, setVoidingSale] = useState(false)
  const [promoDismissed, setPromoDismissed] = useState(false)
  const [catalog, setCatalog] = useState<Product[]>(PRODUCTS)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [catalogRefreshToken, setCatalogRefreshToken] = useState(0)
  const [basketLabel, setBasketLabel] = useState('')
  const [basketNotice, setBasketNotice] = useState<string | null>(null)
  const [scanResolving, setScanResolving] = useState(false)
  const [scanMessage, setScanMessage] = useState<ScanMessage | null>(null)
  const [scanChoices, setScanChoices] = useState<Array<{ product: Product; confidence: number }>>([])
  const [mobileCatalogOpen, setMobileCatalogOpen] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraStatus, setCameraStatus] = useState<CameraScanStatus>('idle')
  const [cameraMessage, setCameraMessage] = useState(
    'Open the camera â€” scanning stays on and the first recognized barcode or QR is added automatically.'
  )
  const [cameraLastValue, setCameraLastValue] = useState<string | null>(null)
  const [saleSync, setSaleSync] = useState<PosSaleSyncState | null>(null)
  const [pendingSaleWrites, setPendingSaleWrites] = useState(0)
  const [retryingSaleWrites, setRetryingSaleWrites] = useState(false)
  const [pendingSourceEvents, setPendingSourceEvents] = useState(0)
  const [retryingSourceEvents, setRetryingSourceEvents] = useState(false)
  const productEntryRef = useRef<HTMLInputElement | null>(null)
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)
  const cameraFrameRef = useRef<number | null>(null)
  const cameraScanTimeoutRef = useRef<number | null>(null)
  const cameraCooldownRef = useRef<number | null>(null)
  const cameraScannerControlsRef = useRef<CameraScannerControls | null>(null)
  /** True while accepting a code or during the short post-accept cooldown. */
  const cameraBusyRef = useRef(false)
  const cameraLastAcceptedRef = useRef<{ value: string; at: number } | null>(null)
  const cameraSubmitRef = useRef<(value: string) => Promise<void>>(async () => {})
  const [catalogView, setCatalogView] = useState<CatalogViewMode>(() => {
    if (typeof window === 'undefined') return 'list'
    return localStorage.getItem('pos_catalog_view') === 'grid' ? 'grid' : 'list'
  })

  // Line action (discount / override) + the manager-auth gate it routes through.
  const [lineAction, setLineAction] = useState<{ mode: LineActionMode; line: CartLine } | null>(null)
  const [pendingAuth, setPendingAuth] = useState<{ label: string; run: () => void } | null>(null)
  const preOverrideTotal = totals.total - totals.cartAdjustment
  const catalogProductBySku = useMemo(() => {
    const bySku = new Map<string, Product>()
    for (const product of catalog) bySku.set(product.sku, product)
    return bySku
  }, [catalog])
  // Every scannable code (sku, barcodes, id) lowercased -> product, so a scan
  // resolves in one map hit instead of falling through to the remote resolver.
  const catalogProductByCode = useMemo(() => {
    const byCode = new Map<string, Product>()
    for (const product of catalog) {
      byCode.set(product.id.toLowerCase(), product)
      byCode.set(product.sku.toLowerCase(), product)
      for (const code of product.barcodes ?? []) byCode.set(code.toLowerCase(), product)
    }
    return byCode
  }, [catalog])
  const franBasketLines = useMemo(
    () => cart
      .filter((line) => line.qty > 0 && !isFranAdjustmentLine(line))
      .map((line) => toFranBasketLine(line, catalogProductBySku.get(line.sku))),
    [cart, catalogProductBySku]
  )
  const franBasketKey = useMemo(
    () => JSON.stringify(franBasketLines.map((line) => [
      line.lineId,
      line.sku,
      line.quantity,
      line.unitPrice,
      line.lineTotal,
      line.priceRevisionId,
    ])),
    [franBasketLines]
  )
  const skumsBasketQuoteLines = useMemo(
    () => cart
      .filter((line) => line.qty > 0 && !isFranAdjustmentLine(line))
      .map((line) => toSkumsBasketQuoteLine(line, catalogProductBySku.get(line.sku))),
    [cart, catalogProductBySku]
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
    if (!franSession || franSession.mode !== 'member') {
      setFranPreview(null)
      setFranPreviewError(null)
      setFranPreviewLoading(false)
      setFranLoyaltySync(null)
      return
    }
    const activeFranSession = franSession

    setFranPreviewLoading(true)
    setFranPreviewError(null)

    const cartPreviewInput = {
      session: activeFranSession,
      cart: {
        cartId: franBasketKey,
        lines: franBasketLines,
        subtotal: franBasketTotals.subtotal,
        discountTotal: franBasketTotals.discountTotal,
        total: franBasketTotals.total,
        currency: STORE.currency,
        updatedAt: new Date().toISOString(),
      },
    }

    async function loadFranPreview() {
      // Preferred live path: SKUMS basket quote + active Fran policy evaluation.
      if (
        mode === 'live' &&
        skumsConnector &&
        activeFranSession.member &&
        !activeFranSession.member.tourist &&
        skumsBasketQuoteLines.length > 0
      ) {
        try {
          const workspaceId = company?.id ?? 'demo'
          const programKey = 'fran-v2'
          const quotedAt = new Date().toISOString()
          const quoteInput: SkumsPosBasketQuoteInput = {
            cart_id: franBasketKey,
            location_id: STORE.inventoryLocationId,
            register_id: POS_REGISTER_CODE,
            register_session_id: pos.user?.sessionId ?? null,
            customer_ref: activeFranSession.member.crmCustomerId,
            currency: STORE.currency,
            subtotal: franBasketTotals.subtotal,
            discount_total: franBasketTotals.discountTotal,
            total: franBasketTotals.total,
            idempotency_key: `fran-pos-basket-quote:${activeFranSession.sessionId}:${lightweightHash(franBasketKey)}`,
            quoted_at: quotedAt,
            lines: skumsBasketQuoteLines,
            metadata: {
              workspace_id: workspaceId,
              program_key: programKey,
              member_id: activeFranSession.member.id,
              crm_customer_id: activeFranSession.member.crmCustomerId,
            },
          }
          const [policyBundle, quoteResponse] = await Promise.all([
            franCrm.getActivePolicy({ workspaceId, programKey }),
            quoteSkumsPosBasket(quoteInput, skumsConnector),
          ])
          return evaluateFranPolicy({
            policyBundle,
            quote: quoteResponse.data,
            session: activeFranSession,
            calculatedAt: quotedAt,
            voucherScans: franVoucherScans,
          })
        } catch {
          // Fall through to Fran basket preview (mock or live CRM).
        }
      }

      try {
        return await franCrm.previewBasket(cartPreviewInput)
      } catch {
        // Last-resort demo-safe preview so the rewards panel is never blank after member resolve.
        return mockPreviewBasket(cartPreviewInput)
      }
    }

    loadFranPreview()
      .then((preview) => {
        if (!cancelled) {
          const cachedPolicyStatus = preview.policyCacheStatus === 'stale' || preview.policyCacheStatus === 'offline_fallback'
          const cachedPolicyReason = preview.policyCacheStatus === 'stale'
            ? 'Cached Fran policy is stale; earn requires CRM replay.'
            : 'Fran CRM policy loaded from offline cache; earn requires CRM replay.'
          setFranPreview(preview)
          setFranPreviewError(
            preview.policyCacheStatus === 'stale'
              ? 'Cached Fran policy is stale. Earn can be shown as queued; redemption requires a live refresh.'
              : preview.policyCacheStatus === 'offline_fallback'
                ? 'Using cached Fran policy because CRM is offline. Confirm live policy before redemption.'
                : null
          )
          setFranLoyaltySync(
            cachedPolicyStatus && preview.memberId
              ? {
                  status: 'queued',
                  pointsEarnQueued: preview.earnPoints,
                  reason: cachedPolicyReason,
                  queuedAt: new Date().toISOString(),
                  syncOnReconnect: true,
                }
              : {
                  status: 'online',
                  pointsEarnQueued: 0,
                  reason: null,
                  queuedAt: null,
                  syncOnReconnect: false,
                }
          )
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const reason = err instanceof Error ? err.message : 'Fran CRM preview unavailable'
          setFranPreview(null)
          setFranPreviewError(
            mode === 'live'
              ? 'Fran loyalty quote unavailable. Sale can continue, but earn and rewards are unverified.'
              : 'Fran CRM offline. Sale can continue; points earn will queue on payment.'
          )
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
  }, [
    company?.id,
    franBasketKey,
    franBasketLines,
    franBasketTotals.discountTotal,
    franBasketTotals.subtotal,
    franBasketTotals.total,
    franCrm,
    franSession,
    franVoucherScans,
    mode,
    pos.user?.sessionId,
    provisionalFranEarnPoints,
    skumsBasketQuoteLines,
    skumsConnector,
  ])

  useEffect(() => {
    let cancelled = false
    if (mode === 'demo') {
      setCatalog(PRODUCTS)
      setCatalogError(null)
      setCatalogLoading(false)
      return
    }

    setCatalogLoading(true)

    async function loadLiveCatalog() {
      if (!company) {
        setCatalog([])
        setCatalogError('Bind register and unlock with HRM PIN to load live products')
        return
      }

      // Prefer SKUMS when connector is enabled (JT: SKUMS-first for live registers).
      if (skumsConnector) {
        try {
          const res = await listSkumsPosCatalog({ limit: 250 }, skumsConnector)
          const skumsProducts = res.data.map(toPosProduct)
          if (skumsProducts.length > 0) {
            setCatalog(skumsProducts)
            setCategory('All')
            setCatalogError(null)
            return
          }
          setCatalog([])
          setCatalogError('No SKUMS products available for POS')
          return
        } catch (err) {
          setCatalog([])
          setCatalogError(err instanceof Error ? err.message : 'Failed to load SKUMS catalog')
          return
        }
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
        setCategory('All')
        setCatalogError(null)
        return
      }

      setCatalog([])
      setCatalogError('No live products yet. Create products manually or add a SKUMS connector.')
    }

    loadLiveCatalog()
      .catch((err) => {
        if (!cancelled) {
          setCatalogError(err instanceof Error ? err.message : 'Failed to load live catalog')
        }
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
    () => {
      const normalizedSearch = search.trim().toLowerCase()
      return catalog.filter(
        (p) =>
          (category === 'All' || p.category === category) &&
          productMatchesEntryQuery(p, normalizedSearch)
      )
    },
    [catalog, category, search]
  )

  const promoQualifies =
    !promoDismissed &&
    cart.filter((l) => l.qty > 0 && catalog.find((p) => p.sku === l.sku)?.category === ACTIVE_PROMOTION.category).length >= 2

  const focusProductEntry = useCallback((options?: { select?: boolean }) => {
    if (typeof window === 'undefined') return
    window.setTimeout(() => {
      if (franCustomerOpenRef.current) return
      productEntryRef.current?.focus()
      // Select the leftover text after a miss so the next scan or keystroke
      // replaces it â€” hardware scanners type into whatever is selected.
      if (options?.select) productEntryRef.current?.select()
    }, 0)
  }, [])

  const stopCameraHardware = useCallback(() => {
    cameraScannerControlsRef.current?.stop()
    cameraScannerControlsRef.current = null
    if (cameraScanTimeoutRef.current != null) {
      window.clearTimeout(cameraScanTimeoutRef.current)
      cameraScanTimeoutRef.current = null
    }
    if (cameraCooldownRef.current != null) {
      window.clearTimeout(cameraCooldownRef.current)
      cameraCooldownRef.current = null
    }
    if (cameraFrameRef.current != null) {
      window.cancelAnimationFrame(cameraFrameRef.current)
      cameraFrameRef.current = null
    }
    cameraBusyRef.current = false
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop())
    cameraStreamRef.current = null
    if (cameraVideoRef.current) cameraVideoRef.current.srcObject = null
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
      emoji: '',
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

  const handleScanSubmit = async (inputValue = search) => {
    const needle = inputValue.trim()
    if (!needle) return
    const normalizedNeedle = needle.toLowerCase()

    const exact = catalogProductByCode.get(normalizedNeedle)
    if (exact) {
      addProduct(exact)
      setSearch('')
      setScanMessage(null)
      focusProductEntry()
      return
    }

    const localMatches = catalog.filter(
      (product) =>
        (category === 'All' || product.category === category) &&
        productMatchesEntryQuery(product, normalizedNeedle)
    )

    if (localMatches.length > 0) {
      addProduct(localMatches[0])
      setSearch('')
      setScanMessage(null)
      focusProductEntry()
      return
    }

    if (mode !== 'live' || !skumsConnector) {
      setScanMessage({ tone: 'warning', text: 'No local product matched this product code.' })
      focusProductEntry({ select: true })
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
        focusProductEntry({ select: true })
      }
    } catch (err) {
      setScanMessage({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Scan service unavailable. Continue with product entry.',
      })
      focusProductEntry({ select: true })
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

  cameraSubmitRef.current = async (value: string) => {
    setSearch(value)
    await handleScanSubmit(value)
  }

  useEffect(() => {
    if (!cameraOpen) {
      stopCameraHardware()
      setCameraStatus('idle')
      return
    }

    let cancelled = false
    cameraBusyRef.current = false
    cameraLastAcceptedRef.current = null
    setCameraStatus('starting')
    setCameraLastValue(null)
    setCameraMessage('Requesting camera access...')

    async function startCameraScanner() {
      if (typeof window === 'undefined' || typeof navigator === 'undefined') return
      if (!window.isSecureContext) {
        setCameraStatus('error')
        setCameraMessage(
          window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
            ? 'Camera requires HTTPS or localhost. Restart Fran POS with USB debugging still on.'
            : 'Camera requires HTTPS or localhost. Keep USB debugging on and reopen Fran POS so the scanner can use 127.0.0.1.',
        )
        return
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraStatus('unsupported')
        setCameraMessage('This browser cannot request camera access. Use the product entry field instead.')
        return
      }

      const Detector = (window as WindowWithBarcodeDetector).BarcodeDetector
      let detector: NativeBarcodeDetector | null = null
      if (Detector) {
        try {
          detector = new Detector({ formats: CAMERA_BARCODE_FORMATS })
        } catch {
          try {
            detector = new Detector()
          } catch {
            detector = null
          }
        }
      }

      try {
        const stream = await requestCameraStream()

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        cameraStreamRef.current = stream
        const video = cameraVideoRef.current
        if (!video) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        video.srcObject = stream
        video.muted = true
        video.playsInline = true
        await video.play()
        if (cancelled) return

        setCameraStatus('scanning')
        setCameraMessage(
          detector
            ? 'Scanning stays on. The first recognized barcode or QR is added automatically.'
            : 'Native barcode detection is unavailable here. Using the compatible scanner fallback â€” first recognized code is added automatically.'
        )

        const scheduleRescan = () => {
          if (cameraCooldownRef.current != null) {
            window.clearTimeout(cameraCooldownRef.current)
            cameraCooldownRef.current = null
          }
          cameraCooldownRef.current = window.setTimeout(() => {
            cameraCooldownRef.current = null
            if (cancelled) return
            cameraBusyRef.current = false
            setCameraStatus('scanning')
            setCameraMessage('Scanning for the next barcode or QR...')
          }, CAMERA_RESCAN_COOLDOWN_MS)
        }

        const handleDetectedValue = async (value: string) => {
          const normalized = value.trim()
          if (!normalized || cancelled || cameraBusyRef.current) return

          const last = cameraLastAcceptedRef.current
          const now = Date.now()
          if (last && last.value === normalized && now - last.at < CAMERA_SAME_CODE_DEBOUNCE_MS) {
            return
          }

          cameraBusyRef.current = true
          setCameraLastValue(normalized)
          setCameraStatus('detected')
          setCameraMessage(`Detected ${normalized}. Adding to cart...`)

          try {
            await cameraSubmitRef.current(normalized)
            cameraLastAcceptedRef.current = { value: normalized, at: Date.now() }
            if (!cancelled) {
              setCameraMessage(`Accepted ${normalized}. Keep scanning for the next item.`)
            }
          } catch (err) {
            if (!cancelled) {
              setCameraStatus('error')
              setCameraMessage(cameraScanErrorMessage(err))
            }
          }

          if (!cancelled) scheduleRescan()
        }

        if (detector) {
          const scanFrame = async () => {
            if (cancelled) return
            const activeVideo = cameraVideoRef.current
            if (!cameraBusyRef.current && activeVideo && activeVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
              try {
                const codes = await detector.detect(activeVideo)
                const value = codes.find((code) => code.rawValue?.trim())?.rawValue?.trim()
                if (value) {
                  void handleDetectedValue(value)
                }
              } catch (err) {
                if (!cancelled) {
                  setCameraStatus('error')
                  setCameraMessage(cameraScanErrorMessage(err))
                }
              }
            }
            if (!cancelled) {
              cameraFrameRef.current = window.requestAnimationFrame(() => { void scanFrame() })
            }
          }

          cameraFrameRef.current = window.requestAnimationFrame(() => { void scanFrame() })
          return
        }

        const readers = createZxingReaders()
        let compatibleScannerStopped = false
        const stopCompatibleScanner = () => {
          compatibleScannerStopped = true
          if (cameraScanTimeoutRef.current != null) {
            window.clearTimeout(cameraScanTimeoutRef.current)
            cameraScanTimeoutRef.current = null
          }
          if (cameraFrameRef.current != null) {
            window.cancelAnimationFrame(cameraFrameRef.current)
            cameraFrameRef.current = null
          }
        }
        cameraScannerControlsRef.current = { stop: stopCompatibleScanner }

        const scanCompatibleFrame = () => {
          if (cancelled || compatibleScannerStopped) return
          const activeVideo = cameraVideoRef.current
          if (!cameraBusyRef.current && activeVideo && activeVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            for (const reader of readers) {
              try {
                const value = reader.decode(activeVideo).getText().trim()
                if (value) {
                  void handleDetectedValue(value)
                  break
                }
              } catch (err) {
                if (!isExpectedZxingScanMiss(err)) {
                  if (!cancelled) {
                    setCameraStatus('error')
                    setCameraMessage(cameraScanErrorMessage(err))
                  }
                  // Keep the loop alive for transient decode failures.
                  break
                }
              }
            }
          }

          if (cancelled || compatibleScannerStopped) return
          cameraScanTimeoutRef.current = window.setTimeout(() => {
            cameraFrameRef.current = window.requestAnimationFrame(scanCompatibleFrame)
          }, 120)
        }

        cameraFrameRef.current = window.requestAnimationFrame(scanCompatibleFrame)
      } catch (err) {
        setCameraStatus('error')
        setCameraMessage(err instanceof Error ? err.message : 'Camera permission was blocked or no camera was found.')
      }
    }

    void startCameraScanner()

    return () => {
      cancelled = true
      stopCameraHardware()
    }
  }, [cameraOpen, stopCameraHardware])

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
    setFranVoucherScans([])
    setFranSession(null)
    setFranPreview(null)
    setFranPreviewError(null)
    setFranLoyaltySync(null)
    setFranMemberDialogOpen(false)
    setFranCustomerOpen(false)
    setCustomer(null)
  }

  /** Reset register after a completed sale (or explicit New Sale). Cart must not retain prior lines. */
  const startNewSale = () => {
    clearSale()
    clearFranSession()
    setFranQuote(null)
    setFranAppliedReward(null)
    setFranRewardBasketKey(null)
    setBasketLabel('')
    setBasketNotice(null)
    setScanMessage(null)
    setSearch('')
    setPromoDismissed(false)
    setPaymentOpen(false)
    setCompletedOpen(false)
    setSaleSync(null)
    focusProductEntry()
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

  const authorizeFranVoucher = async (code: string) => {
    const memberId = franSession?.member?.id || null
    const res = await franCrm.authorizeVoucher({
      code,
      memberId,
    })
    if (res.valid) {
      setFranVoucherScans((prev) => {
        const next = prev.filter((s) => s.code !== res.code)
        next.push({
          kind: res.kind || 'other',
          code: res.code,
          label: res.label,
          scannedAt: new Date().toISOString(),
        })
        return next
      })
      // Dens redeem â†’ open points reward quote for cashier confirm
      if (res.kind === 'points_redeem' && res.pointsCost > 0 && franPreview) {
        const densReward: FranRewardDecision = {
          id: 'fran-points-redemption',
          title: res.label || `Redeem ${res.pointsCost} pts`,
          description: 'FWB fixed dens redemption from scanned voucher.',
          kind: 'points_redemption',
          value: res.discount,
          pointsCost: res.pointsCost,
          expiresAt: res.expiresAt,
          eligible: true,
          reason: null,
          requiresConfirmation: true,
        }
        void quoteFranReward(densReward, res.pointsCost)
      }
    }
    return res
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

  const sendFranLoyaltyExecutionEvent = (sale: CompletedSale, appliedReward: FranAppliedReward | null) => {
    const preview = sale.fran?.basketPreview
    const session = sale.fran?.counterSession
    const member = session?.member
    if (!preview || !session || !member || member.tourist) return

    const pointsRedeemed = appliedReward?.quote.pointsCost ?? 0
    const redeemDiscountAmount = appliedReward?.quote.amount ?? 0
    const idempotencyKey = `fran:${sale.receiptNo}:loyalty-execution:${preview.policyVersionId ?? preview.previewId}`

    // L-pos: commit_sale to CRM ledger (earn + redeem) â€” non-blocking; outbox is replay-safe.
    void franCrm
      .commitSale({
        saleId: sale.idempotencyKey,
        receiptNo: sale.receiptNo,
        idempotencyKey,
        session,
        memberId: member.id,
        policyVersionId: preview.policyVersionId ?? null,
        assignmentId: preview.assignmentId ?? null,
        skumsQuoteId: preview.skumsQuoteId ?? null,
        skumsReservationId: null,
        pointsEarned: sale.pointsEarned,
        pointsRedeemed,
        redeemDiscountAmount,
        evaluationTrace: preview.evaluationTrace ?? null,
        netSpend: sale.total ?? preview.earnProjection?.totalAfterDiscount ?? 0,
        currency: preview.earnProjection?.policy.currency ?? STORE.currency,
        occurredAt: sale.completedAtIso,
      })
      .catch(() => {
        // Queue path: sendEvent + outbox still record the execution fact.
      })

    void franCrm.sendEvent({
      eventType: 'fran.loyalty_execution.committed',
      idempotencyKey,
      occurredAt: sale.completedAtIso,
      payload: {
        policy_version_id: preview.policyVersionId ?? null,
        assignment_id: preview.assignmentId ?? null,
        member_id: member.id,
        account_id: member.crmCustomerId,
        skums_quote_id: preview.skumsQuoteId ?? null,
        skums_reservation_id: null,
        pos_sale_id: sale.idempotencyKey,
        receipt_number: sale.receiptNo,
        reward_quote_id: appliedReward?.quote.quoteId ?? null,
        reward_commit_id: appliedReward?.commit?.commitId ?? null,
        reward_status: appliedReward?.status ?? null,
        points_earned: sale.pointsEarned,
        points_redeemed: pointsRedeemed,
        evaluation_trace: preview.evaluationTrace ?? null,
        commit_sale: true,
      },
    }).catch(() => {
      // The local POS outbox carries the replay-safe execution fact; checkout must not block here.
    })
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
      const finalPointsEarned = canFranEarn
        ? franPreview?.earnPoints ?? franLoyaltySync?.pointsEarnQueued ?? (mode === 'demo' ? provisionalFranEarnPoints : 0)
        : 0
      const finalLoyaltySync = finalFranLoyaltySync(saleReward, finalPointsEarned)
      const sale = completeSale({
        fran: buildFranSaleContext(saleReward, finalLoyaltySync),
        pointsEarned: finalPointsEarned,
      })
      sendFranLoyaltyExecutionEvent(sale, saleReward)
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
      // completeSale already emptied the cart; clear Fran counter state for the next transaction.
      clearFranSession()
      setFranQuote(null)
      setFranAppliedReward(null)
      setFranRewardBasketKey(null)
      setBasketLabel('')
      setSearch('')
      setPaymentOpen(false)
      setCompletedOpen(true)
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

  const addFromMobileCatalogue = (product: Product) => {
    addProduct(product)
    setMobileCatalogOpen(false)
    focusProductEntry()
  }

  const renderCatalogViewToggle = () => (
    <div className="flex shrink-0 rounded-md border bg-background p-0.5">
      <button
        type="button"
        onClick={() => setCatalogViewMode('grid')}
        title="Grid view"
        aria-label="Grid view"
        aria-pressed={catalogView === 'grid'}
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-sm transition-colors cursor-pointer',
          catalogView === 'grid' ? 'bg-brown text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
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
          catalogView === 'list' ? 'bg-brown text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
        )}
      >
        <List className="h-4 w-4" />
      </button>
    </div>
  )

  const renderCategoryStrip = () => (
    <div className="flex gap-1.5 overflow-x-auto border-b bg-card px-3 py-2">
      {categories.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => setCategory(c)}
          className={cn(
            'whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer',
            category === c ? 'bg-yellow font-semibold text-brown' : 'bg-surface-sunken hover:bg-yellow-soft'
          )}
        >
          {c}
        </button>
      ))}
    </div>
  )

  const renderProductCatalogue = (onProductAdd: (product: Product) => void) => (
    <div
      className={cn(
        'min-h-0 flex-1 overflow-y-auto p-3',
        catalogView === 'grid'
          ? 'grid auto-rows-min grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4'
          : 'space-y-0 p-0'
      )}
    >
      {filtered.map((p) =>
        catalogView === 'grid'
          ? <ProductCard key={p.id} product={p} onAdd={() => onProductAdd(p)} />
          : <ProductListRow key={p.id} product={p} onAdd={() => onProductAdd(p)} />
      )}
      {filtered.length === 0 && (
        <p className="col-span-full px-3 py-10 text-center text-sm text-muted-foreground">
          {catalogLoading ? 'Loading products...' : catalogError || 'No products match.'}
        </p>
      )}
    </div>
  )

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {franCustomerOpen && (
        <FranCustomerModal
          open
          client={franCrm}
          onClose={() => {
            franCustomerOpenRef.current = false
            setFranCustomerOpen(false)
          }}
          onResolved={(session, nextCustomer) => {
            clearFranReward()
            setFranSession(session)
            setCustomer(nextCustomer)
            setFranLoyaltySync(null)
            setFranQuote(null)
            setFranAppliedReward(null)
            setFranRewardBasketKey(null)
            franCustomerOpenRef.current = false
            setFranCustomerOpen(false)
            if (session.mode === 'member') setFranMemberDialogOpen(true)
          }}
        />
      )}
      <div
        className={cn('flex min-h-0 flex-1 flex-col overflow-hidden', franCustomerOpen && 'hidden')}
        inert={franCustomerOpen || undefined}
        aria-hidden={franCustomerOpen || undefined}
      >
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
              className={cn('h-11 pl-9 text-base sm:text-sm', search ? 'pr-[5.5rem]' : 'pr-12')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                aria-label="Clear product entry"
                title="Clear"
                onClick={() => {
                  setSearch('')
                  setScanMessage(null)
                  focusProductEntry()
                }}
                className="absolute right-11 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-sunken hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              className={cn(
                'absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border transition-colors',
                cameraOpen
                  ? 'border-brown bg-yellow text-brown'
                  : 'border-line bg-white text-brown hover:bg-surface-sunken',
              )}
              aria-label={cameraOpen ? 'Close camera scanner' : 'Open camera scanner'}
              aria-pressed={cameraOpen}
              title={cameraOpen ? 'Close camera scanner' : 'Scan with camera'}
              onClick={() => setCameraOpen((open) => !open)}
            >
              {cameraOpen ? <X className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
            </button>
          </div>
          <Button type="submit" className="h-11 shrink-0 gap-2 px-3 sm:px-4" disabled={scanResolving} title="Add typed SKU or barcode" aria-label="Add product">
            {scanResolving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            <span className="hidden sm:inline">Add product</span>
          </Button>
          <Button type="button" variant="outline" size="sm" className="gap-2 md:hidden" title="Browse catalog" aria-label="Browse catalog" onClick={() => setMobileCatalogOpen(true)}>
            <ShoppingBag className="h-4 w-4" />
            <span className="sr-only">Catalog</span>
          </Button>
        </div>
        <div className="hidden shrink-0 items-center justify-end gap-2 md:flex">
          {renderCatalogViewToggle()}
        </div>
      </form>
      {cameraOpen && (
        <div className="shrink-0 border-b bg-card px-3 pb-3">
          <div className="grid gap-3 rounded-lg border bg-background p-2 md:grid-cols-[minmax(260px,420px)_minmax(0,1fr)] md:p-3">
            <div className="relative h-36 overflow-hidden rounded-md bg-black md:aspect-video md:h-auto">
              <video
                ref={cameraVideoRef}
                className="h-full w-full object-cover"
                muted
                playsInline
                autoPlay
              />
              <div className="pointer-events-none absolute inset-x-[12%] top-1/2 h-16 -translate-y-1/2 rounded-lg border-2 border-white/80 shadow-[0_0_0_999px_rgba(0,0,0,0.18)] md:h-24" />
              <div className="absolute inset-x-2 bottom-2 flex items-end justify-between gap-2 md:hidden">
                <div className="min-w-0">
                  <Badge
                    variant={
                      cameraStatus === 'scanning' || cameraStatus === 'detected'
                        ? 'success'
                        : cameraStatus === 'error' || cameraStatus === 'unsupported'
                          ? 'warning'
                          : 'secondary'
                    }
                  >
                    {cameraStatus === 'scanning'
                      ? 'Point at a barcode'
                      : cameraStatus === 'detected'
                        ? 'Added'
                        : cameraStatus === 'error' || cameraStatus === 'unsupported'
                          ? 'Camera blocked'
                          : 'Starting'}
                  </Badge>
                  {(cameraStatus === 'error' || cameraStatus === 'unsupported') && (
                    <p className="mt-1 max-h-12 overflow-hidden text-[11px] leading-snug text-white">
                      {cameraMessage}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/60 text-white"
                  aria-label="Close camera scanner"
                  onClick={() => setCameraOpen(false)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="hidden min-w-0 flex-col justify-between gap-3 md:flex">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      cameraStatus === 'scanning' || cameraStatus === 'detected'
                        ? 'success'
                        : cameraStatus === 'error' || cameraStatus === 'unsupported'
                          ? 'warning'
                          : 'secondary'
                    }
                  >
                    {cameraStatus === 'starting'
                      ? 'Starting camera'
                      : cameraStatus === 'scanning'
                        ? 'Scanning'
                        : cameraStatus === 'detected'
                          ? 'Accepted'
                          : cameraStatus === 'unsupported'
                            ? 'Unsupported'
                            : cameraStatus === 'error'
                              ? 'Needs attention'
                              : 'Camera ready'}
                  </Badge>
                  {cameraLastValue && <Badge variant="outline" className="font-mono">{cameraLastValue}</Badge>}
                </div>
                <p className="text-sm font-medium">Desktop webcam scanner</p>
                <p className="text-sm text-muted-foreground">{cameraMessage}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setCameraOpen(false)}>
                  <X className="h-4 w-4" />
                  Close camera
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
      {scanMessage && (
        <div className="shrink-0 bg-card px-3 pb-3">
          <div
            className={cn(
              'flex items-start gap-2 rounded-md border px-3 py-2 text-sm',
              scanMessage.tone === 'success' && 'border-transparent bg-success-soft text-success',
              scanMessage.tone === 'info' && 'border-line bg-yellow-soft text-brown',
              scanMessage.tone === 'warning' && 'border-warning/30 bg-warning-soft text-warning',
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
        salesType={salesType}
        onChooseSalesType={chooseSalesType}
        onFindMember={openMemberLookup}
        onOpenDetails={() => {
          if (franSession?.mode === 'member') setFranMemberDialogOpen(true)
        }}
        onClearSession={clearFranSession}
        onTourist={() => applyFranException('tourist')}
        onNonMember={() => applyFranException('non_member')}
      />
      <div className="flex min-h-0 flex-1 overflow-hidden md:flex-row">
      {/* LEFT - catalogue */}
      <div className="hidden min-h-0 min-w-0 flex-col md:flex md:flex-1">
        {renderCategoryStrip()}
        {renderProductCatalogue(addProduct)}
      </div>

      {/* RIGHT â€” cart */}
      <div className="flex min-h-0 w-full flex-1 flex-col bg-card md:w-[380px] md:shrink-0 md:border-l">
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

        {/* Sales type â€” labeled chips on wide / landscape. Portrait uses icons in FranMemberStrip. */}
        <div className="hidden border-b px-3 py-2 lg:block">
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
                {s.requiresManager && ' ðŸ”’'}
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
            <div className="min-w-0">
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
            <div className="flex items-center justify-between pt-1 font-display text-[28px] font-bold tracking-tight">
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

      {mobileCatalogOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Dismiss product catalog"
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileCatalogOpen(false)}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Product catalog"
            className="absolute inset-y-0 right-0 flex w-[min(100vw-1rem,26rem)] flex-col bg-card shadow-xl"
          >
            <div className="flex items-center justify-between border-b px-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">Product catalog</p>
                <p className="text-xs text-muted-foreground">Browse only when a product cannot scan.</p>
              </div>
              <button
                type="button"
                aria-label="Close product catalog"
                onClick={() => setMobileCatalogOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-md border bg-background transition-colors hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center justify-end gap-2 border-b px-3 py-2">
              {renderCatalogViewToggle()}
            </div>
            {renderCategoryStrip()}
            {renderProductCatalogue(addFromMobileCatalogue)}
          </aside>
        </div>
      )}
      </div>

      <Dialog
        open={franMemberDialogOpen && franSession?.mode === 'member'}
        onOpenChange={setFranMemberDialogOpen}
      >
        <DialogContent
          className="flex max-h-[92dvh] w-[calc(100vw-1rem)] max-w-3xl flex-col overflow-hidden p-0 sm:w-full"
          onClose={() => setFranMemberDialogOpen(false)}
        >
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle>Fran member & rewards</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto p-3 sm:p-4">
            {franSession ? (
              <div className="grid gap-3">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
                  <FranCounterProfileCard session={franSession} preview={franPreview} />
                  <FranRewardRedemptionPanel
                    preview={franPreview}
                    quote={franQuote}
                    appliedReward={franAppliedReward}
                    quoteLoading={franQuoteLoading}
                    previewLoading={franPreviewLoading}
                    previewError={franPreviewError}
                    hasSession={Boolean(franSession)}
                    hasSaleItems={franBasketLines.length > 0}
                    onQuote={(reward, pointsToRedeem) => { void quoteFranReward(reward, pointsToRedeem) }}
                    onConfirmQuote={confirmFranRewardQuote}
                    onClearReward={clearFranReward}
                  />
                </div>
                {franSession.member && !franSession.member.tourist && (
                  <FranVoucherScanPanel
                    memberId={franSession.member.id}
                    scans={franVoucherScans}
                    densOptions={
                      franPreview?.pointsRedemption?.fixedDenominations?.map((d) => ({
                        points: d.points,
                        discount: d.discount,
                      })) || [
                        { points: 200, discount: 6 },
                        { points: 500, discount: 20 },
                        { points: 1000, discount: 50 },
                        { points: 1500, discount: 90 },
                        { points: 2500, discount: 175 },
                      ]
                    }
                    onAuthorize={authorizeFranVoucher}
                    onRemove={(code) =>
                      setFranVoucherScans((prev) => prev.filter((s) => s.code !== code))
                    }
                    onQuoteDens={async (points) => {
                      const member = franSession.member
                      if (!member) return null
                      const available =
                        franPreview?.pointsRedemption?.availablePoints ?? member.pointsBalance
                      const q = await franCrm.quoteRedeemDens({
                        memberId: member.id,
                        points,
                        availablePoints: available,
                        currency: STORE.currency,
                      })
                      return { code: q.voucher.code, label: q.voucher.label }
                    }}
                  />
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-center">
                <p className="text-sm font-semibold">Resolve Fran member / exception</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Scan a member QR/barcode, type a mobile number, or choose non-member/tourist before payment.
                </p>
                <Button className="mt-3" onClick={openMemberLookup}>
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
        onNewSale={startNewSale}
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
      type="button"
      onClick={onAdd}
      disabled={out}
      className={cn(
        'group flex h-full min-w-0 flex-col overflow-hidden rounded-xl border bg-card p-3 text-left shadow-sm transition-all hover:border-primary hover:shadow active:scale-[0.99] cursor-pointer',
        out && 'cursor-not-allowed opacity-50'
      )}
    >
      <div className="mb-2 flex min-w-0 items-start justify-between gap-2">
        {product.emoji ? (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-xl">
            {product.emoji}
          </div>
        ) : (
          <div className="h-10 w-10 shrink-0" />
        )}
        <div className="flex min-w-0 flex-wrap items-start justify-end gap-1">
          {product.mdPrice != null && <Badge variant="warning" className="shrink-0">MD / SSS</Badge>}
          {!product.returnable && (
            <Badge variant="outline" className="shrink-0 text-[10px]">Non-returnable</Badge>
          )}
        </div>
      </div>
      <p className="line-clamp-2 min-w-0 text-sm font-medium leading-tight">{product.name}</p>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">{product.sku}</p>
      {product.storeLocationCode && (
        <p className="mt-0.5 truncate text-[11px] font-medium text-primary">Loc {product.storeLocationCode}</p>
      )}
      <div className="mt-auto flex min-w-0 items-end justify-between gap-2 pt-2">
        <div className="min-w-0 shrink-0 tabular-nums">
          {product.mdPrice != null ? (
            <div className="flex flex-col items-start gap-0.5">
              <span className="text-sm font-semibold leading-none text-destructive">
                {formatCurrency(product.mdPrice, STORE.currency)}
              </span>
              <span className="text-[11px] leading-none text-muted-foreground line-through">
                {formatCurrency(product.price, STORE.currency)}
              </span>
            </div>
          ) : (
            <span className="text-sm font-semibold leading-none">{formatCurrency(price, STORE.currency)}</span>
          )}
        </div>
        <span
          className={cn(
            'shrink-0 text-right text-xs tabular-nums leading-none',
            out ? 'font-medium text-destructive' : 'text-muted-foreground',
          )}
        >
          {out ? 'Out' : `${product.qtyOnHand} in stock`}
        </span>
      </div>
    </button>
  )
}

function ProductListRow({ product, onAdd }: { product: Product; onAdd: () => void }) {
  const out = product.qtyOnHand <= 0
  const price = product.mdPrice ?? product.price
  const metaBits = [
    product.sku,
    Array.isArray(product.barcodes) && product.barcodes[0] ? product.barcodes[0] : null,
    product.storeLocationCode ? `Loc ${product.storeLocationCode}` : null,
    product.mdPrice != null ? 'MD' : null,
    !product.returnable ? 'NR' : null,
  ].filter(Boolean)
  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={out}
      className={cn(
        'flex w-full min-w-0 items-center gap-3 border-b border-line px-3 py-2 text-left transition-colors hover:bg-accent/40 active:bg-accent/55 cursor-pointer',
        out && 'cursor-not-allowed opacity-50'
      )}
    >
      <div className="min-w-0 flex-1 overflow-hidden">
        <p className="line-clamp-2 text-sm font-medium leading-snug">{product.name}</p>
        <p className="truncate text-xs text-muted-foreground">{metaBits.join(' · ')}</p>
      </div>
      <div className="flex w-[5.5rem] shrink-0 flex-col items-end justify-center gap-0.5 tabular-nums">
        {product.mdPrice != null ? (
          <>
            <span className="text-sm font-semibold leading-none text-destructive">
              {formatCurrency(product.mdPrice, STORE.currency)}
            </span>
            <span className="text-[11px] leading-none text-muted-foreground line-through">
              {formatCurrency(product.price, STORE.currency)}
            </span>
          </>
        ) : (
          <span className="text-sm font-semibold leading-none">{formatCurrency(price, STORE.currency)}</span>
        )}
        <span className={cn('text-[11px] leading-none', out ? 'font-medium text-destructive' : 'text-muted-foreground')}>
          {out ? 'Out' : `${product.qtyOnHand} stk`}
        </span>
      </div>
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
        'border-b border-line px-2.5 py-2',
        isReturn && 'bg-destructive/5',
        isFranLine && 'bg-success-soft'
      )}
    >
      <div className="flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1 overflow-hidden">
          <p className="truncate text-sm font-medium leading-snug">{line.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {line.sku} · {formatCurrency(line.unitPrice, STORE.currency)}
            {line.isMarkdown && <span className="ml-1 text-warning">MD</span>}
            {line.overridden && <span className="ml-1 text-brown">ovr</span>}
            {isFranLine && <span className="ml-1 text-success">Fran</span>}
            {line.storeLocationCode && <span className="ml-1 text-primary">Loc {line.storeLocationCode}</span>}
          </p>
          {line.lineDiscount > 0 && (
            <p className="truncate text-xs text-success">
              {line.discountLabel}: -{formatCurrency(line.lineDiscount, STORE.currency)}
            </p>
          )}
          {line.overridden && line.overrideReason && (
            <p className="truncate text-xs text-brown">Override: {line.overrideReason}</p>
          )}
          {line.franDecisionRef && (
            <p className="truncate text-xs text-success">Decision {line.franDecisionRef}</p>
          )}
        </div>
        <span className={cn('shrink-0 text-sm font-semibold tabular-nums', isReturn && 'text-destructive')}>
          {formatCurrency(net, STORE.currency)}
        </span>
      </div>
      <div className="mt-1.5 flex min-w-0 items-center justify-between gap-2">
        {readOnly ? (
          <span className="truncate rounded-full bg-white/70 px-2 py-0.5 text-xs font-medium text-success">
            CRM quoted line
          </span>
        ) : (
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" onClick={onDec} className="flex h-7 w-7 items-center justify-center rounded-md border hover:bg-accent cursor-pointer">
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="w-8 text-center text-sm font-medium tabular-nums">{line.qty}</span>
            <button type="button" onClick={onInc} className="flex h-7 w-7 items-center justify-center rounded-md border hover:bg-accent cursor-pointer">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <div className="flex shrink-0 items-center gap-1">
          {!readOnly && (
            <>
              <button type="button" onClick={onDiscount} title="Line discount" className="flex h-7 w-7 items-center justify-center rounded-md border hover:bg-accent cursor-pointer">
                <Tag className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={onOverride} title="Price override" className="flex h-7 w-7 items-center justify-center rounded-md border hover:bg-accent cursor-pointer">
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          <button type="button" onClick={onRemove} title="Remove" className="flex h-7 w-7 items-center justify-center rounded-md border text-destructive hover:bg-destructive/10 cursor-pointer">
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
            <div className="mt-1 flex justify-between text-brown">
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
