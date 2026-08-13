import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, ChevronUp, RefreshCw, X } from 'lucide-react'
import { toast } from 'sonner'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/providers/auth-provider'
import { loadSkumsConnectorForCompany } from '@/hooks/use-skums-connector'
import { listSkumsPosCatalog } from '@/pos/lib/skums-client'
import { SKUMS_CONNECTOR_MISSING_MESSAGE, type SkumsConnectorConfig } from '@/pos/lib/skums-connector'
import {
  skumsCatalogItemToProductInput,
  type ProductInput,
} from '@/hooks/use-products'
import type { SkumsPosCatalogItem } from '@pos/shared'

type SyncStatus = 'idle' | 'estimating' | 'ready' | 'syncing' | 'completed' | 'failed'

export interface SkumsSyncCategorySummary {
  name: string
  total: number
  toCreate: number
  toUpdate: number
}

export interface SkumsSyncSummary {
  catalogTotal: number
  posEligible: number
  toCreate: number
  toUpdate: number
  categories: SkumsSyncCategorySummary[]
}

interface SkumsSyncJobState {
  status: SyncStatus
  summary: SkumsSyncSummary | null
  created: number
  updated: number
  processed: number
  total: number
  error: string | null
}

interface ExistingProductRow {
  id: string
  sku: string | null
  barcode: string | null
  metadata: Record<string, any> | null
}

interface PreparedSkumsSync {
  connector: SkumsConnectorConfig
  items: SkumsPosCatalogItem[]
  existingByKey: Map<string, ExistingProductRow>
  summary: SkumsSyncSummary
}

interface SkumsImportJobContextValue {
  job: SkumsSyncJobState
  prepareImport: () => Promise<SkumsSyncSummary>
  startImport: () => Promise<void>
  resetImport: () => void
}

const initialJob: SkumsSyncJobState = {
  status: 'idle',
  summary: null,
  created: 0,
  updated: 0,
  processed: 0,
  total: 0,
  error: null,
}

const SkumsImportJobContext = createContext<SkumsImportJobContextValue | null>(null)

function itemKeys(item: SkumsPosCatalogItem) {
  return [
    item.product_id ? `skums:${item.product_id}` : null,
    item.id ? `skums:${item.id}` : null,
    item.sku ? `sku:${item.sku}` : null,
    item.identifiers.ean ? `bc:${item.identifiers.ean}` : null,
    item.identifiers.upc ? `bc:${item.identifiers.upc}` : null,
    item.identifiers.gtin ? `bc:${item.identifiers.gtin}` : null,
  ].filter(Boolean) as string[]
}

function existingKeys(row: ExistingProductRow) {
  const skumsId = row.metadata?.skums?.product_id || row.metadata?.skums?.id
  return [
    skumsId ? `skums:${skumsId}` : null,
    row.sku ? `sku:${row.sku}` : null,
    row.barcode ? `bc:${row.barcode}` : null,
  ].filter(Boolean) as string[]
}

function isImportableItem(item: SkumsPosCatalogItem) {
  return item.pos_enabled && item.status === 'active'
}

function categoryName(item: SkumsPosCatalogItem) {
  return item.category_name || 'Uncategorized'
}

function findExisting(item: SkumsPosCatalogItem, map: Map<string, ExistingProductRow>) {
  for (const key of itemKeys(item)) {
    const hit = map.get(key)
    if (hit) return hit
  }
  return null
}

async function loadExistingProducts(companyId: string) {
  const { data, error } = await supabase
    .from('products')
    .select('id, sku, barcode, metadata')
    .eq('company_id', companyId)

  if (error) throw error

  const map = new Map<string, ExistingProductRow>()
  for (const row of (data || []) as ExistingProductRow[]) {
    for (const key of existingKeys(row)) {
      if (!map.has(key)) map.set(key, row)
    }
  }
  return map
}

async function loadCatalog(
  connector: SkumsConnectorConfig,
  onProgress: (processed: number, total: number) => void
) {
  const pageSize = 250
  let offset = 0
  let catalogTotal = 0
  let hasMore = true
  const items: SkumsPosCatalogItem[] = []

  while (hasMore) {
    const response = await listSkumsPosCatalog({ limit: pageSize, offset }, connector)
    catalogTotal = response.total
    items.push(...response.data)
    onProgress(items.length, Math.max(catalogTotal, items.length))

    const nextOffset = typeof response.next_offset === 'number' ? response.next_offset : offset + response.data.length
    hasMore = response.has_more ?? (nextOffset > offset && nextOffset < response.total)
    if (nextOffset <= offset) hasMore = false
    offset = nextOffset
  }

  return { items, catalogTotal: Math.max(catalogTotal, items.length) }
}

function summarizeCatalog(
  items: SkumsPosCatalogItem[],
  existingByKey: Map<string, ExistingProductRow>,
  catalogTotal: number
): SkumsSyncSummary {
  const categories = new Map<string, SkumsSyncCategorySummary>()
  let posEligible = 0
  let toCreate = 0
  let toUpdate = 0

  for (const item of items.filter(isImportableItem)) {
    posEligible += 1
    const name = categoryName(item)
    const current = categories.get(name) || { name, total: 0, toCreate: 0, toUpdate: 0 }
    current.total += 1
    if (findExisting(item, existingByKey)) {
      current.toUpdate += 1
      toUpdate += 1
    } else {
      current.toCreate += 1
      toCreate += 1
    }
    categories.set(name, current)
  }

  return {
    catalogTotal,
    posEligible,
    toCreate,
    toUpdate,
    categories: Array.from(categories.values()).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)),
  }
}

function notifyCatalogUpdated() {
  if (typeof window === 'undefined') return
  const timestamp = new Date().toISOString()
  localStorage.setItem('pos_catalog_updated', timestamp)
  window.dispatchEvent(new CustomEvent('pos-catalog-updated', { detail: { timestamp } }))
}

export function SkumsImportProvider({ children }: { children: ReactNode }) {
  const { company } = useAuth()
  const queryClient = useQueryClient()
  const [job, setJob] = useState<SkumsSyncJobState>(initialJob)
  const preparedRef = useRef<PreparedSkumsSync | null>(null)

  const prepareImport = useCallback(async () => {
    if (!company) throw new Error('No company selected')
    if (job.status === 'syncing') {
      if (job.summary) return job.summary
      throw new Error('SKUMS sync already running')
    }

    preparedRef.current = null
    setJob({
      ...initialJob,
      status: 'estimating',
    })

    try {
      const connector = await loadSkumsConnectorForCompany(company.id)
      if (!connector) throw new Error(SKUMS_CONNECTOR_MISSING_MESSAGE)

      const existingByKey = await loadExistingProducts(company.id)
      const { items, catalogTotal } = await loadCatalog(connector, (processed, total) => {
        setJob((prev) => ({
          ...prev,
          status: 'estimating',
          processed,
          total,
        }))
      })
      const summary = summarizeCatalog(items, existingByKey, catalogTotal)

      preparedRef.current = {
        connector,
        items,
        existingByKey,
        summary,
      }
      setJob({
        ...initialJob,
        status: 'ready',
        summary,
        total: summary.toCreate + summary.toUpdate,
      })
      return summary
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to prepare SKUMS sync'
      setJob((prev) => ({
        ...prev,
        status: 'failed',
        error: message,
      }))
      throw err
    }
  }, [company, job.status, job.summary])

  const startImport = useCallback(async () => {
    if (!company) throw new Error('No company selected')
    const companyId = company.id

    const prepared = preparedRef.current || await prepareImport().then(() => preparedRef.current)
    if (!prepared) throw new Error('SKUMS sync was not prepared')

    const workItems = prepared.items.filter(isImportableItem)
    setJob((prev) => ({
      ...prev,
      status: 'syncing',
      created: 0,
      updated: 0,
      processed: 0,
      total: workItems.length,
      error: null,
    }))

    const existingByKey = new Map(prepared.existingByKey)
    let created = 0
    let updated = 0
    let processed = 0
    const insertBatch: ProductInput[] = []
    const insertBatchSize = 50

    async function flushInserts() {
      if (insertBatch.length === 0) return
      const batch = insertBatch.splice(0, insertBatch.length)
      const { data, error } = await supabase
        .from('products')
        .insert(batch.map((row) => ({ ...row, company_id: companyId })))
        .select('id, sku, barcode, metadata')
      if (error) throw error
      created += batch.length
      for (const row of (data || []) as ExistingProductRow[]) {
        for (const key of existingKeys(row)) existingByKey.set(key, row)
      }
    }

    try {
      for (const item of workItems) {
        const input = skumsCatalogItemToProductInput(item)
        const existing = findExisting(item, existingByKey)

        if (existing) {
          const { error } = await supabase
            .from('products')
            .update({
              name: input.name,
              description: input.description,
              sku: input.sku ?? existing.sku,
              barcode: input.barcode ?? existing.barcode,
              price: input.price,
              track_inventory: input.track_inventory,
              inventory_count: input.inventory_count,
              is_active: input.is_active,
              metadata: {
                ...(existing.metadata || {}),
                ...input.metadata,
                synced_at: new Date().toISOString(),
              },
            })
            .eq('id', existing.id)
            .eq('company_id', companyId)
          if (error) throw error
          updated += 1
          // refresh map keys after identity fields change
          const refreshed: ExistingProductRow = {
            id: existing.id,
            sku: input.sku ?? existing.sku,
            barcode: input.barcode ?? existing.barcode,
            metadata: {
              ...(existing.metadata || {}),
              ...input.metadata,
            },
          }
          for (const key of existingKeys(refreshed)) existingByKey.set(key, refreshed)
        } else {
          insertBatch.push(input)
          if (insertBatch.length >= insertBatchSize) {
            await flushInserts()
          }
        }

        processed += 1
        if (processed % 10 === 0 || processed === workItems.length) {
          setJob((prev) => ({
            ...prev,
            created,
            updated,
            processed,
          }))
        }
      }

      await flushInserts()

      setJob((prev) => ({
        ...prev,
        status: 'completed',
        created,
        updated,
        processed,
      }))
      await queryClient.invalidateQueries({ queryKey: ['products', companyId] })
      await queryClient.refetchQueries({ queryKey: ['products', companyId] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard-stats', companyId] })
      notifyCatalogUpdated()
      if (created === 0 && updated === 0) {
        toast.message('SKUMS sync finished with no changes applied')
      } else {
        toast.success(`Synced SKUMS catalog: ${created} new, ${updated} updated`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to sync from SKUMS'
      setJob((prev) => ({
        ...prev,
        status: 'failed',
        created,
        updated,
        processed,
        error: message,
      }))
      throw err
    }
  }, [company, prepareImport, queryClient])

  const resetImport = useCallback(() => {
    preparedRef.current = null
    setJob(initialJob)
  }, [])

  const value = useMemo(() => ({
    job,
    prepareImport,
    startImport,
    resetImport,
  }), [job, prepareImport, resetImport, startImport])

  return (
    <SkumsImportJobContext.Provider value={value}>
      {children}
    </SkumsImportJobContext.Provider>
  )
}

export function useSkumsImportJob() {
  const context = useContext(SkumsImportJobContext)
  if (!context) throw new Error('useSkumsImportJob must be used inside SkumsImportProvider')
  return context
}

function progressPercent(job: SkumsSyncJobState) {
  if (job.status === 'completed') return 100
  if (job.total <= 0) return job.status === 'estimating' || job.status === 'syncing' ? 8 : 0
  return Math.max(8, Math.min(99, Math.round((job.processed / job.total) * 100)))
}

export function SkumsImportProgressPanel() {
  const { job, resetImport } = useSkumsImportJob()
  const [expanded, setExpanded] = useState(true)

  if (job.status === 'idle') return null

  const percent = progressPercent(job)
  const label = job.status === 'estimating'
    ? 'Checking SKUMS catalog'
    : job.status === 'ready'
      ? 'SKUMS sync ready'
      : job.status === 'syncing'
        ? 'Syncing SKUMS catalog'
        : job.status === 'completed'
          ? 'SKUMS sync complete'
          : 'SKUMS sync failed'

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-medium shadow-lg"
      >
        <RefreshCw className="h-4 w-4" />
        <span>{label}</span>
        {(job.status === 'estimating' || job.status === 'syncing') && <span>{percent}%</span>}
        <ChevronUp className="h-4 w-4" />
      </button>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[min(360px,calc(100vw-2rem))] rounded-md border bg-background p-4 shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {job.status === 'completed' ? (
              <CheckCircle2 className="h-4 w-4 text-success" />
            ) : (
              <RefreshCw className={cn('h-4 w-4 text-primary', job.status === 'syncing' && 'animate-spin')} />
            )}
            <p className="truncate text-sm font-semibold">{label}</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {job.status === 'ready' && job.summary
              ? `${job.summary.toCreate.toLocaleString()} new, ${job.summary.toUpdate.toLocaleString()} to update`
              : job.status === 'completed'
                ? `${job.created.toLocaleString()} new, ${job.updated.toLocaleString()} updated`
                : job.error || `${job.processed.toLocaleString()} of ${job.total.toLocaleString()} processed`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => (job.status === 'completed' || job.status === 'failed' ? resetImport() : setExpanded(false))}
          className="rounded-sm p-1 text-muted-foreground hover:text-foreground"
          aria-label={job.status === 'completed' || job.status === 'failed' ? 'Dismiss sync status' : 'Collapse sync status'}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {(job.status === 'estimating' || job.status === 'syncing') && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
          <div className="h-full bg-primary transition-all" style={{ width: `${percent}%` }} />
        </div>
      )}

      {job.status === 'completed' && (
        <Link
          to="/products"
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-3 w-full')}
          onClick={() => resetImport()}
        >
          View Products
        </Link>
      )}
    </div>
  )
}
