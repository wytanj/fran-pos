import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/providers/auth-provider'
import { listSkumsPosCatalog } from '@/pos/lib/skums-client'
import { SKUMS_CONNECTOR_MISSING_MESSAGE } from '@/pos/lib/skums-connector'
import { loadSkumsConnectorForCompany } from '@/hooks/use-skums-connector'
import type { Product, SkumsGraphRefs, SkumsPosCatalogItem } from '@pos/shared'

export function useProducts(categoryId?: string) {
  const { company } = useAuth()
  return useQuery({
    queryKey: ['products', company?.id, categoryId],
    queryFn: async () => {
      if (!company) return []
      let query = supabase
        .from('products')
        .select('*, category:categories(id, name)')
        .eq('company_id', company.id)
        .order('sort_order')
      if (categoryId) {
        query = query.eq('category_id', categoryId)
      }
      const { data, error } = await query
      if (error) throw error
      return data as Product[]
    },
    enabled: !!company,
  })
}

export interface ProductInput {
  name: string
  description?: string
  sku?: string
  barcode?: string
  price: number
  cost_price?: number
  category_id?: string | null
  track_inventory?: boolean
  inventory_count?: number
  is_active?: boolean
  metadata?: Record<string, unknown>
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

function notifyCatalogUpdated() {
  if (typeof window === 'undefined') return
  const timestamp = new Date().toISOString()
  localStorage.setItem('pos_catalog_updated', timestamp)
  window.dispatchEvent(new CustomEvent('pos-catalog-updated', { detail: { timestamp } }))
}

function skumsMetadata(item: SkumsPosCatalogItem) {
  const refs = Object.fromEntries(graphFields.map((field) => [field, item[field]]))
  return {
    source: 'skums',
    imported_at: new Date().toISOString(),
    skums: refs,
    identifiers: item.identifiers,
    currency: item.currency,
    storage_location_code: item.storage_location_code,
    store_location_code: item.storage_location_code,
    source_category: item.category_name,
    source_brand: item.brand_name,
  }
}

export function skumsCatalogItemToProductInput(item: SkumsPosCatalogItem): ProductInput {
  return {
    name: item.display_name || item.title,
    description: item.brand_name ? `Imported from SKUMS - ${item.brand_name}` : 'Imported from SKUMS',
    sku: item.sku || undefined,
    barcode: item.identifiers.ean || item.identifiers.upc || item.identifiers.gtin || undefined,
    price: item.unit_price || item.list_price || 0,
    category_id: null,
    track_inventory: item.track_inventory,
    inventory_count: item.track_inventory ? item.stock_quantity : 0,
    is_active: item.status === 'active' && item.pos_enabled,
    metadata: skumsMetadata(item),
  }
}

export function useCreateProduct() {
  const queryClient = useQueryClient()
  const { company } = useAuth()
  return useMutation({
    mutationFn: async (input: ProductInput) => {
      if (!company) throw new Error('No company selected')
      const { data, error } = await supabase
        .from('products')
        .insert({ ...input, company_id: company.id })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', company?.id] })
    },
  })
}

export function useImportSkumsCatalog() {
  const queryClient = useQueryClient()
  const { company } = useAuth()
  return useMutation({
    mutationFn: async () => {
      if (!company) throw new Error('No company selected')
      const companyId = company.id

      const connector = await loadSkumsConnectorForCompany(companyId)
      if (!connector) throw new Error(SKUMS_CONNECTOR_MISSING_MESSAGE)

      const { data: existing, error: existingError } = await supabase
        .from('products')
        .select('sku, barcode')
        .eq('company_id', companyId)

      if (existingError) throw existingError

      const existingKeys = new Set(
        (existing || []).flatMap((product) => [product.sku, product.barcode].filter(Boolean) as string[])
      )

      const pageSize = 250
      const insertBatchSize = 100
      let offset = 0
      let imported = 0
      let skipped = 0
      let total = 0
      let hasMore = true

      async function insertRows(rows: ProductInput[]) {
        if (rows.length === 0) return
        const { error } = await supabase.from('products').insert(rows.map((row) => ({ ...row, company_id: companyId })))
        if (error) throw error
      }

      while (hasMore) {
        const response = await listSkumsPosCatalog({ limit: pageSize, offset }, connector)
        const rows: ProductInput[] = []

        for (const item of response.data.filter((entry) => entry.pos_enabled && entry.status === 'active')) {
          total += 1
          const barcode = item.identifiers.ean || item.identifiers.upc || item.identifiers.gtin || null
          if (existingKeys.has(item.sku) || (barcode && existingKeys.has(barcode))) {
            skipped += 1
            continue
          }

          rows.push(skumsCatalogItemToProductInput(item))
          existingKeys.add(item.sku)
          if (barcode) existingKeys.add(barcode)

          if (rows.length >= insertBatchSize) {
            await insertRows(rows.splice(0, rows.length))
            imported += insertBatchSize
          }
        }

        if (rows.length > 0) {
          await insertRows(rows)
          imported += rows.length
        }

        const nextOffset = typeof response.next_offset === 'number' ? response.next_offset : offset + response.data.length
        hasMore = response.has_more ?? (nextOffset > offset && nextOffset < response.total)
        if (nextOffset <= offset) hasMore = false
        offset = nextOffset
      }

      return {
        imported,
        skipped,
        total,
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', company?.id] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats', company?.id] })
      notifyCatalogUpdated()
    },
  })
}

export function useUpdateProduct() {
  const queryClient = useQueryClient()
  const { company } = useAuth()
  return useMutation({
    mutationFn: async ({ id, ...input }: ProductInput & { id: string }) => {
      const { data, error } = await supabase
        .from('products')
        .update(input)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', company?.id] })
    },
  })
}

export function useDeleteProduct() {
  const queryClient = useQueryClient()
  const { company } = useAuth()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('products').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', company?.id] })
    },
  })
}
