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
import { CheckCircle2, ChevronUp, CloudDownload, X } from 'lucide-react'
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

type ImportStatus = 'idle' | 'estimating' | 'ready' | 'importing' | 'completed' | 'failed'

export interface SkumsImportCategorySummary {
  name: string
  total: number
  importable: number
  skipped: number
}

export interface SkumsImportSummary {
  catalogTotal: number
  posEligible: number
  importable: number
  skippedExisting: number
  categories: SkumsImportCategorySummary[]
}

interface SkumsImportJobState {
  status: ImportStatus
  summary: SkumsImportSummary | null
  imported: number
  skipped: number
  processed: number
  total: number
  error: string | null
}

interface PreparedSkumsImport {
  connector: SkumsConnectorConfig
  items: SkumsPosCatalogItem[]
  existingKeys: Set<string>
  summary: SkumsImportSummary
}

interface SkumsImportJobContextValue {
  job: SkumsImportJobState
  prepareImport: () => Promise<SkumsImportSummary>
  startImport: () => Promise<void>
  resetImport: () => void
}

const initialJob: SkumsImportJobState = {
  status: 'idle',
  summary: null,
  imported: 0,
  skipped: 0,
  processed: 0,
  total: 0,
  error: null,
}

const SkumsImportJobContext = createContext<SkumsImportJobContextValue | null>(null)

function itemKeys(item: SkumsPosCatalogItem) {
  return [
    item.sku,
    item.identifiers.ean,
    item.identifiers.upc,
    item.identifiers.gtin,
  ].filter(Boolean) as string[]
}

function isImportableItem(item: SkumsPosCatalogItem) {
  return item.pos_enabled && item.status === 'active'
}

function categoryName(item: SkumsPosCatalogItem) {
  return item.category_name || 'Uncategorized'
}

async function loadExistingProductKeys(companyId: string) {
  const { data, error } = await supabase
    .from('products')
    .select('sku, barcode')
    .eq('company_id', companyId)

  if (error) throw error

  return new Set(
    (data || []).flatMap((product) => [product.sku, product.barcode].filter(Boolean) as string[])
  )
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
    onProgress(items.length, catalogTotal)

    const nextOffset = typeof response.next_offset === 'number' ? response.next_offset : offset + response.data.length
    hasMore = response.has_more ?? (nextOffset > offset && nextOffset < response.total)
    if (nextOffset <= offset) hasMore = false
    offset = nextOffset
  }

  return { items, catalogTotal }
}

function summarizeCatalog(
  items: SkumsPosCatalogItem[],
  existingKeys: Set<string>,
  catalogTotal: number
): SkumsImportSummary {
  const categories = new Map<string, SkumsImportCategorySummary>()
  let posEligible = 0
  let importable = 0
  let skippedExisting = 0

  for (const item of items.filter(isImportableItem)) {
    posEligible += 1
    const name = categoryName(item)
    const current = categories.get(name) || { name, total: 0, importable: 0, skipped: 0 }
    const exists = itemKeys(item).some((key) => existingKeys.has(key))

    current.total += 1
    if (exists) {
      current.skipped += 1
      skippedExisting += 1
    } else {
      current.importable += 1
      importable += 1
    }
    categories.set(name, current)
  }

  return {
    catalogTotal,
    posEligible,
    importable,
    skippedExisting,
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
  const [job, setJob] = useState<SkumsImportJobState>(initialJob)
  const preparedRef = useRef<PreparedSkumsImport | null>(null)

  const prepareImport = useCallback(async () => {
    if (!company) throw new Error('No company selected')
    if (job.status === 'importing') {
      if (job.summary) return job.summary
      throw new Error('SKUMS import already running')
    }

    preparedRef.current = null
    setJob({
      ...initialJob,
      status: 'estimating',
    })

    try {
      const connector = await loadSkumsConnectorForCompany(company.id)
      if (!connector) throw new Error(SKUMS_CONNECTOR_MISSING_MESSAGE)

      const existingKeys = await loadExistingProductKeys(company.id)
      const { items, catalogTotal } = await loadCatalog(connector, (processed, total) => {
        setJob((prev) => ({
          ...prev,
          status: 'estimating',
          processed,
          total,
        }))
      })
      const summary = summarizeCatalog(items, existingKeys, catalogTotal)

      preparedRef.current = {
        connector,
        items,
        existingKeys,
        summary,
      }
      setJob({
        ...initialJob,
        status: 'ready',
        summary,
        total: summary.importable,
      })
      return summary
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to prepare SKUMS import'
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
    if (!prepared) throw new Error('SKUMS import was not prepared')

    setJob((prev) => ({
      ...prev,
      status: 'importing',
      imported: 0,
      skipped: 0,
      processed: 0,
      total: prepared.summary.importable,
      error: null,
    }))

    const existingKeys = new Set(prepared.existingKeys)
    const insertBatchSize = 100
    const rows: ProductInput[] = []
    let imported = 0
    let skipped = 0
    let processed = 0

    async function insertRows(batch: ProductInput[]) {
      if (batch.length === 0) return
      const { error } = await supabase
        .from('products')
        .insert(batch.map((row) => ({ ...row, company_id: companyId })))
      if (error) throw error
      imported += batch.length
    }

    try {
      for (const item of prepared.items.filter(isImportableItem)) {
        const keys = itemKeys(item)
        if (keys.some((key) => existingKeys.has(key))) {
          skipped += 1
          continue
        }

        rows.push(skumsCatalogItemToProductInput(item))
        for (const key of keys) existingKeys.add(key)

        if (rows.length >= insertBatchSize) {
          await insertRows(rows.splice(0, rows.length))
          processed = imported
          setJob((prev) => ({ ...prev, imported, skipped, processed }))
        }
      }

      if (rows.length > 0) {
        await insertRows(rows)
      }

      processed = imported
      setJob((prev) => ({
        ...prev,
        status: 'completed',
        imported,
        skipped,
        processed,
      }))
      queryClient.invalidateQueries({ queryKey: ['products', companyId] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats', companyId] })
      notifyCatalogUpdated()
      toast.success(`Imported ${imported} SKUMS product${imported === 1 ? '' : 's'}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to import from SKUMS'
      setJob((prev) => ({
        ...prev,
        status: 'failed',
        imported,
        skipped,
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

function progressPercent(job: SkumsImportJobState) {
  if (job.status === 'completed') return 100
  if (job.total <= 0) return job.status === 'estimating' || job.status === 'importing' ? 8 : 0
  return Math.max(8, Math.min(99, Math.round((job.processed / job.total) * 100)))
}

export function SkumsImportProgressPanel() {
  const { job, resetImport } = useSkumsImportJob()
  const [expanded, setExpanded] = useState(true)

  if (job.status === 'idle') return null

  const percent = progressPercent(job)
  const label = job.status === 'estimating'
    ? 'Estimating SKUMS catalog'
    : job.status === 'ready'
      ? 'SKUMS import ready'
      : job.status === 'importing'
        ? 'Importing SKUMS catalog'
        : job.status === 'completed'
          ? 'SKUMS import complete'
          : 'SKUMS import failed'

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-medium shadow-lg"
      >
        <CloudDownload className="h-4 w-4" />
        <span>{label}</span>
        {(job.status === 'estimating' || job.status === 'importing') && <span>{percent}%</span>}
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
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : (
              <CloudDownload className="h-4 w-4 text-primary" />
            )}
            <p className="truncate text-sm font-semibold">{label}</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {job.status === 'ready' && job.summary
              ? `${job.summary.importable.toLocaleString()} ready, ${job.summary.skippedExisting.toLocaleString()} already in POS`
              : job.status === 'completed'
                ? `${job.imported.toLocaleString()} imported, ${job.skipped.toLocaleString()} skipped`
                : job.error || `${job.processed.toLocaleString()} of ${job.total.toLocaleString()} processed`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => (job.status === 'completed' || job.status === 'failed' ? resetImport() : setExpanded(false))}
          className="rounded-sm p-1 text-muted-foreground hover:text-foreground"
          aria-label={job.status === 'completed' || job.status === 'failed' ? 'Dismiss import status' : 'Collapse import status'}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {(job.status === 'estimating' || job.status === 'importing' || job.status === 'completed') && (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
        </div>
      )}

      <div className="mt-3 flex justify-end">
        <Link to="/products" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
          View Products
        </Link>
      </div>
    </div>
  )
}
