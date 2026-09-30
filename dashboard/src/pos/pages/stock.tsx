import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ClipboardList,
  Loader2,
  MapPin,
  Search,
  Store,
  Warehouse,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabase'
import { formatCurrency, cn } from '@/lib/utils'
import { PageHeader } from '@/pos/components/page-header'
import { useSkumsConnector } from '@/hooks/use-skums-connector'
import {
  PRODUCTS,
  STORE,
  STORE_STORAGE_BUCKETS,
  normalizeStoreStorageLocationCode,
  type Product as DemoProduct,
} from '@/pos/data/mock'
import { usePos } from '@/pos/lib/pos-context'
import { createSkumsPosInventoryEvent } from '@/pos/lib/skums-client'
import {
  createPosInventoryEventPayload,
  FLOOR_ADJUSTMENT_EVENT,
  FLOOR_ADJUSTMENT_REASONS,
  parseFloorAdjustmentReason,
  type FloorAdjustmentReason,
} from '@/pos/lib/stock-movement'
import { useAuth } from '@/providers/auth-provider'
import { useProducts } from '@/hooks/use-products'
import type { Product as DbProduct, SkumsGraphRefs, SkumsPosInventoryEventInput, SkumsPosInventoryEventResponse } from '@pos/shared'

type StockSource = 'demo' | 'live'

interface StockRow extends Partial<SkumsGraphRefs> {
  id: string
  sku: string
  name: string
  category: string
  storeLocationCode: string | null
  price: number
  qtyOnHand: number
  trackInventory: boolean
  returnable: boolean
  emoji: string
  source: StockSource
  metadata: Record<string, unknown>
}

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

function skumsRefsFromMetadata(metadata: Record<string, unknown> | null | undefined): Partial<SkumsGraphRefs> {
  const source = asRecord(metadata?.skums)
  const refs: Partial<SkumsGraphRefs> = {}
  for (const field of graphFields) {
    const value = source[field]
    refs[field] = typeof value === 'string' ? value : null
  }
  return refs
}

function toDemoStockRow(product: DemoProduct, adjustment: number): StockRow {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    category: product.category,
    storeLocationCode: product.storeLocationCode ?? null,
    price: product.mdPrice ?? product.price,
    qtyOnHand: product.qtyOnHand + adjustment,
    trackInventory: true,
    returnable: product.returnable,
    emoji: product.emoji,
    source: 'demo',
    metadata: {},
    ...product.skums,
  }
}

function toLiveStockRow(product: DbProduct): StockRow {
  const metadata = asRecord(product.metadata)
  return {
    id: product.id,
    sku: product.sku || product.barcode || product.id.slice(0, 8),
    name: product.name,
    category: product.category?.name || 'Uncategorized',
    storeLocationCode: storeLocationCodeFromMetadata(metadata),
    price: Number(product.price) || 0,
    qtyOnHand: product.track_inventory ? product.inventory_count : 0,
    trackInventory: product.track_inventory,
    returnable: true,
    emoji: 'P',
    source: 'live',
    metadata,
    ...skumsRefsFromMetadata(metadata),
  }
}

function skumsStatus(response: SkumsPosInventoryEventResponse | null) {
  return response?.data?.status ?? null
}

export default function StockPage() {
  const { mode, user: posUser } = usePos()
  const { company } = useAuth()
  const { connector: skumsConnector } = useSkumsConnector()
  const { data: dbProducts = [], isLoading } = useProducts()

  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [productSearch, setProductSearch] = useState('')
  const [selectedProductId, setSelectedProductId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [storageLocationCode, setStorageLocationCode] = useState<string>(STORE_STORAGE_BUCKETS[0]?.code ?? 'A01')
  const [floorReference, setFloorReference] = useState(`POS-${STORE.code}-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}`)
  const [floorReason, setFloorReason] = useState<FloorAdjustmentReason>('damaged')
  const [demoAdjustments, setDemoAdjustments] = useState<Record<string, number>>({})
  const [floorSubmitting, setFloorSubmitting] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastFloorEventStatus, setLastFloorEventStatus] = useState<{
    status: 'queued' | 'sent' | 'synced' | 'pending_approval' | 'failed'
    reference: string | null
  } | null>(null)

  const liveEnabled = mode === 'live' && Boolean(company)
  const stockRows = useMemo<StockRow[]>(() => {
    if (liveEnabled) return dbProducts.map(toLiveStockRow)
    return PRODUCTS.map((product) => toDemoStockRow(product, demoAdjustments[product.id] ?? 0))
  }, [dbProducts, demoAdjustments, liveEnabled])

  const selectedProduct = stockRows.find((product) => product.id === selectedProductId) ?? null
  const selectedLocationCode = normalizeStoreStorageLocationCode(storageLocationCode)
  const reportQty = Math.max(0, Math.floor(Number(quantity) || 0))
  const selectedFloorReason = FLOOR_ADJUSTMENT_REASONS.find((item) => item.code === floorReason) ?? FLOOR_ADJUSTMENT_REASONS[0]

  const categories = useMemo(() => ['All', ...Array.from(new Set(stockRows.map((p) => p.category))).sort()], [stockRows])
  const rows = useMemo(
    () =>
      stockRows.filter(
        (p) =>
          (category === 'All' || p.category === category) &&
          (search === '' ||
            p.name.toLowerCase().includes(search.toLowerCase()) ||
            p.sku.toLowerCase().includes(search.toLowerCase()) ||
            (p.storeLocationCode?.toLowerCase().includes(search.toLowerCase()) ?? false))
      ),
    [category, search, stockRows]
  )

  const productResults = useMemo(() => {
    const needle = productSearch.trim().toLowerCase()
    if (!needle) return stockRows.slice(0, 6)
    return stockRows
      .filter(
        (p) =>
          p.name.toLowerCase().includes(needle) ||
          p.sku.toLowerCase().includes(needle) ||
          (p.storeLocationCode?.toLowerCase().includes(needle) ?? false)
      )
      .slice(0, 6)
  }, [productSearch, stockRows])

  const totalUnits = stockRows.reduce((s, p) => s + p.qtyOnHand, 0)
  const lowStock = stockRows.filter((p) => p.trackInventory && p.qtyOnHand > 0 && p.qtyOnHand <= 5).length
  const outOfStock = stockRows.filter((p) => p.trackInventory && p.qtyOnHand === 0).length

  const flash = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  const createQueuedLocalInventoryEvent = async (payload: SkumsPosInventoryEventInput) => {
    if (!company || !selectedProduct) return

    const { data, error: insertError } = await supabase
      .from('pos_inventory_events')
      .insert({
        company_id: company.id,
        event_type: payload.event_type,
        status: 'queued',
        idempotency_key: payload.idempotency_key ?? null,
        product_id: selectedProduct.source === 'live' ? selectedProduct.id : null,
        sku: selectedProduct.sku,
        quantity: payload.quantity ?? null,
        store_code: STORE.code,
        storage_location_code: payload.storage_location_code ?? null,
        reference: payload.reference ?? null,
        reason_code: payload.reason_code ?? null,
        skums_event_id: null,
        skums_status: null,
        payload,
        response: {},
        error_message: null,
        synced_at: null,
      })
      .select('id')
      .single()

    if (insertError) {
      throw insertError
    }

    setLastFloorEventStatus({ status: 'queued', reference: payload.reference ?? null })
    return (data as { id: string } | null)?.id ?? null
  }

  const updateLocalInventoryEvent = async (
    eventId: string | null | undefined,
    payload: SkumsPosInventoryEventInput,
    status: 'queued' | 'sent' | 'synced' | 'pending_approval' | 'failed',
    response: SkumsPosInventoryEventResponse | null,
    err: Error | null
  ) => {
    if (!company || !eventId) return

    const { error: updateError } = await supabase
      .from('pos_inventory_events')
      .update({
        status,
        skums_event_id: response?.data?.id ?? null,
        skums_status: skumsStatus(response),
        response: response ?? {},
        error_message: err?.message ?? response?.data?.error_message ?? null,
        synced_at: response ? new Date().toISOString() : null,
      })
      .eq('id', eventId)
      .eq('company_id', company.id)

    if (updateError) {
      console.warn('Failed to update POS inventory event', updateError)
    }

    setLastFloorEventStatus({ status, reference: payload.reference ?? null })
  }

  const submitFloorEvent = async () => {
    setError(null)
    if (!selectedProduct) {
      setError('Select a product to report.')
      return
    }
    if (reportQty <= 0) {
      setError('Enter a quantity above zero.')
      return
    }
    if (!selectedLocationCode) {
      setError('Use a valid shelf location such as A01, A100, or AA01.')
      return
    }
    const reasonCode = parseFloorAdjustmentReason(floorReason)
    if (!reasonCode) {
      setError('Choose Damaged, Expired, Tester, or Other.')
      return
    }

    const payload = createPosInventoryEventPayload({
      companyId: company?.id ?? null,
      product: {
        id: selectedProduct.id,
        sku: selectedProduct.sku,
        name: selectedProduct.name,
        product_identity_id: selectedProduct.product_identity_id ?? null,
        trade_unit_id: selectedProduct.trade_unit_id ?? null,
        listing_id: selectedProduct.listing_id ?? null,
        channel_id: selectedProduct.channel_id ?? null,
        sku_assignment_id: selectedProduct.sku_assignment_id ?? null,
        identifier_id: selectedProduct.identifier_id ?? null,
        product_id: selectedProduct.product_id ?? null,
        variant_id: selectedProduct.variant_id ?? null,
        batch_id: selectedProduct.batch_id ?? null,
      },
      quantity: reportQty,
      storageLocationCode: selectedLocationCode,
      reference: floorReference.trim() || `POS-${STORE.code}`,
      reasonCode,
      operatorName: posUser?.name ?? null,
    })

    setFloorSubmitting(true)
    let localEventId: string | null | undefined = null
    try {
      let response: SkumsPosInventoryEventResponse | null = null
      let nextQty = selectedProduct.qtyOnHand
      localEventId = liveEnabled ? await createQueuedLocalInventoryEvent(payload) : null

      if (liveEnabled && skumsConnector) {
        await updateLocalInventoryEvent(localEventId, payload, 'sent', null, null)
        response = await createSkumsPosInventoryEvent(payload, skumsConnector)
        await updateLocalInventoryEvent(
          localEventId,
          payload,
          skumsStatus(response) === 'applied' ? 'synced' : 'pending_approval',
          response,
          null
        )
      }

      if (!liveEnabled) {
        const delta = -reportQty
        nextQty = Math.max(0, selectedProduct.qtyOnHand + delta)
        setDemoAdjustments((prev) => ({
          ...prev,
          [selectedProduct.id]: (prev[selectedProduct.id] ?? 0) + delta,
        }))
      }

      flash(
        liveEnabled
          ? `${selectedFloorReason.label} reported to SKUMS for ${skumsStatus(response) === 'applied' ? 'ledger update' : 'HQ approval (no stock change until applied)'}`
          : `${selectedFloorReason.label} recorded - demo on hand is now ${nextQty.toLocaleString()}`
      )
    } catch (err) {
      const eventError = err instanceof Error ? err : new Error('Failed to submit inventory event.')
      await updateLocalInventoryEvent(localEventId, payload, 'failed', null, eventError)
      setLastFloorEventStatus({ status: 'failed', reference: payload.reference ?? null })
      setError(eventError.message)
    } finally {
      setFloorSubmitting(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={Boxes} title="Stock on Hand" subtitle={`Live inventory for ${STORE.name} - this POS store only`} />

      <div className="grid gap-3 p-4 pb-0 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
                <Store className="h-4 w-4" /> Current POS store
              </div>
              <p className="mt-1 text-lg font-semibold">{STORE.name}</p>
              <p className="text-sm text-muted-foreground">{STORE.address}</p>
            </div>
            <div className="grid gap-2 text-sm sm:grid-cols-3">
              <StoreFact label="Store code" value={STORE.code} />
              <StoreFact label="IMS location" value={STORE.inventoryLocationId} />
              <StoreFact label="Mode" value={liveEnabled ? 'Live account' : 'Demo terminal'} />
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Stat icon={Warehouse} label="Total units" value={totalUnits.toLocaleString()} />
            <Stat icon={AlertTriangle} label="Low stock (<=5)" value={String(lowStock)} tone="warning" />
            <Stat icon={AlertTriangle} label="Out of stock" value={String(outOfStock)} tone="danger" />
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
                <MapPin className="h-4 w-4" /> Multi-store inventory
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                On-hand for {STORE.code} is a display cache. Canonical stock is SKUMS. Inbound uses Receive delivery or Transfers.
              </p>
            </div>
            <Badge variant="outline">IMS sync pending</Badge>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[380px_1fr]">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-primary" />
            <div>
              <p className="font-semibold">Floor adjustment</p>
              <p className="text-xs text-muted-foreground">
                Display cache for {STORE.name} ({STORE.code}). Canonical stock is the SKUMS ledger.
              </p>
            </div>
          </div>
          <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
            Inbound is <span className="font-semibold">Receive delivery</span> or <span className="font-semibold">Transfers</span> only.
            Floor reasons are Damaged, Expired, Tester, or Other. HQ applies the ledger.
          </div>

          <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Product</label>
              <Input
                className="mt-1"
                placeholder="Search product, SKU, or shelf..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
              <div className="mt-2 max-h-48 overflow-y-auto rounded-md border">
                {productResults.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => {
                      setSelectedProductId(product.id)
                      setProductSearch(product.sku)
                      if (product.storeLocationCode) setStorageLocationCode(product.storeLocationCode)
                    }}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-accent',
                      selectedProductId === product.id && 'bg-accent'
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{product.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {product.sku} - {product.qtyOnHand} on hand
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-xs text-primary">{product.storeLocationCode ?? '-'}</span>
                  </button>
                ))}
                {productResults.length === 0 && (
                  <p className="px-3 py-5 text-center text-sm text-muted-foreground">No products found.</p>
                )}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Quantity</label>
              <Input className="mt-1" type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Store</label>
                <div className="mt-1 flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">
                  {STORE.name} ({STORE.code})
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Shelf / bucket</label>
                <Select value={storageLocationCode} onChange={(e) => setStorageLocationCode(e.target.value)} className="mt-1">
                  {STORE_STORAGE_BUCKETS.map((bucket) => (
                    <option key={bucket.code} value={bucket.code}>
                      {bucket.code} - {bucket.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="rounded-lg border bg-background p-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <div>
                  <p className="text-sm font-semibold">Floor report ({FLOOR_ADJUSTMENT_EVENT})</p>
                  <p className="text-xs text-muted-foreground">
                    Sellable stock stays unchanged until SKUMS applies the adjustment.
                  </p>
                </div>
              </div>
              <div className="mt-3">
                <label className="text-xs font-medium text-muted-foreground">Reason</label>
                <Select
                  className="mt-1"
                  value={floorReason}
                  onChange={(e) => {
                    const next = parseFloorAdjustmentReason(e.target.value)
                    if (next) setFloorReason(next)
                  }}
                >
                  {FLOOR_ADJUSTMENT_REASONS.map((item) => (
                    <option key={item.code} value={item.code}>{item.label}</option>
                  ))}
                </Select>
              </div>
              <div className="mt-3">
                <label className="text-xs font-medium text-muted-foreground">Event reference</label>
                <Input className="mt-1" value={floorReference} onChange={(e) => setFloorReference(e.target.value)} />
              </div>
              <Button className="mt-3 w-full" variant="secondary" type="button" onClick={() => { void submitFloorEvent() }} disabled={floorSubmitting || isLoading}>
                {floorSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
                Report floor adjustment
              </Button>
              {lastFloorEventStatus && (
                <p className="mt-2 rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground">
                  Sync status: <span className="font-medium text-foreground">{lastFloorEventStatus.status}</span>
                  {lastFloorEventStatus.reference ? ` - ${lastFloorEventStatus.reference}` : ''}
                </p>
              )}
            </div>

            {selectedProduct && (
              <div className="rounded-md border bg-secondary/60 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Display on hand (cache)</span>
                  <span className="font-semibold tabular-nums">
                    {selectedProduct.qtyOnHand.toLocaleString()}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  This screen does not receive stock and does not edit the count. Use Receive delivery or Transfers.
                </p>
              </div>
            )}

            {error && <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          </div>
        </section>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card">
          <div className="border-b p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-56 flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search product, SKU, or shelf..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="flex max-w-full gap-1.5 overflow-x-auto">
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
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-secondary/95">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="p-3">SKU</th>
                  <th className="p-3">Product</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Location</th>
                  <th className="p-3 text-right">Price</th>
                  <th className="p-3 text-center">Source</th>
                  <th className="p-3 text-right">On hand</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="p-3 font-mono text-xs">{p.sku}</td>
                    <td className="p-3">
                      <span className="mr-1">{p.emoji}</span>
                      {p.name}
                      {!p.trackInventory && <Badge variant="outline" className="ml-2">Untracked</Badge>}
                    </td>
                    <td className="p-3 text-muted-foreground">{p.category}</td>
                    <td className="p-3 font-mono text-xs text-primary">{p.storeLocationCode ?? '-'}</td>
                    <td className="p-3 text-right tabular-nums">{formatCurrency(p.price, STORE.currency)}</td>
                    <td className="p-3 text-center">
                      <Badge variant={p.source === 'live' ? 'success' : 'secondary'}>{p.source === 'live' ? 'Live' : 'Demo'}</Badge>
                    </td>
                    <td className="p-3 text-right">
                      <span
                        className={cn(
                          'font-semibold tabular-nums',
                          p.trackInventory && p.qtyOnHand === 0 && 'text-destructive',
                          p.trackInventory && p.qtyOnHand > 0 && p.qtyOnHand <= 5 && 'text-amber-600'
                        )}
                      >
                        {p.trackInventory ? p.qtyOnHand : '-'}
                      </span>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-10 text-center text-sm text-muted-foreground">
                      {isLoading ? 'Loading stock...' : 'No stock rows found.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {toast && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-lg">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> {toast}
          </span>
        </div>
      )}
    </div>
  )
}

function StoreFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background px-3 py-2">
      <p className="text-[11px] font-medium uppercase text-muted-foreground">{label}</p>
      <p className="font-mono text-xs font-semibold">{value}</p>
    </div>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof ClipboardList
  label: string
  value: string
  tone?: 'warning' | 'danger'
}) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className={cn('h-4 w-4', tone === 'warning' && 'text-amber-600', tone === 'danger' && 'text-destructive')} />
        {label}
      </div>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
    </div>
  )
}
