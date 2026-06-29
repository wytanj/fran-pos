import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct } from '@/hooks/use-products'
import { useCategories } from '@/hooks/use-categories'
import { useSkumsImportJob } from '@/hooks/use-skums-import-job'
import { useSaveSkumsConnector, useSkumsConnector } from '@/hooks/use-skums-connector'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, ChevronLeft, ChevronRight, CloudDownload, KeyRound, PackagePlus, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import { SKUMS_CONNECTOR_MISSING_MESSAGE } from '@/pos/lib/skums-connector'
import type { Product } from '@pos/shared'

const emptyForm = {
  name: '',
  description: '',
  sku: '',
  barcode: '',
  price: '',
  cost_price: '',
  category_id: '',
  track_inventory: false,
  inventory_count: '0',
  is_active: true,
}

type ProductStatusFilter = 'all' | 'active' | 'inactive'
type ProductSourceFilter = 'all' | 'manual' | 'skums'
type ProductStockFilter = 'all' | 'tracked' | 'in_stock' | 'out_of_stock' | 'untracked'

function productSource(product: Product): 'manual' | 'skums' {
  return product.metadata?.source === 'skums' ? 'skums' : 'manual'
}

function matchesStockFilter(product: Product, filter: ProductStockFilter) {
  if (filter === 'all') return true
  if (filter === 'tracked') return product.track_inventory
  if (filter === 'untracked') return !product.track_inventory
  if (filter === 'in_stock') return product.track_inventory && product.inventory_count > 0
  return product.track_inventory && product.inventory_count <= 0
}

export default function ProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const handledQueryAction = useRef(false)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [statusFilter, setStatusFilter] = useState<ProductStatusFilter>('all')
  const [sourceFilter, setSourceFilter] = useState<ProductSourceFilter>('all')
  const [stockFilter, setStockFilter] = useState<ProductStockFilter>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const { data: products = [], isLoading } = useProducts()
  const { data: categories = [] } = useCategories()
  const createProduct = useCreateProduct()
  const updateProduct = useUpdateProduct()
  const deleteProduct = useDeleteProduct()
  const skumsImport = useSkumsImportJob()
  const skumsConnector = useSkumsConnector()
  const saveSkumsConnector = useSaveSkumsConnector()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [connectorDialogOpen, setConnectorDialogOpen] = useState(false)
  const [importWizardOpen, setImportWizardOpen] = useState(false)
  const [pendingImportAfterSave, setPendingImportAfterSave] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [connectorForm, setConnectorForm] = useState({
    api_url: 'https://skums.vercel.app',
    api_key: '',
  })

  const normalizedSearch = search.trim().toLowerCase()
  const hasActiveFilters = Boolean(
    normalizedSearch ||
      filterCategory ||
      statusFilter !== 'all' ||
      sourceFilter !== 'all' ||
      stockFilter !== 'all'
  )
  const filtered = products.filter((p) => {
    const matchesSearch =
      !normalizedSearch ||
      p.name.toLowerCase().includes(normalizedSearch) ||
      (p.sku?.toLowerCase().includes(normalizedSearch) ?? false) ||
      (p.barcode?.toLowerCase().includes(normalizedSearch) ?? false)
    const matchesCategory = !filterCategory || p.category_id === filterCategory
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && p.is_active) ||
      (statusFilter === 'inactive' && !p.is_active)
    const matchesSource = sourceFilter === 'all' || productSource(p) === sourceFilter

    return matchesSearch && matchesCategory && matchesStatus && matchesSource && matchesStockFilter(p, stockFilter)
  })
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pageStart = (safePage - 1) * pageSize
  const pageItems = filtered.slice(pageStart, pageStart + pageSize)
  const firstItem = filtered.length === 0 ? 0 : pageStart + 1
  const lastItem = Math.min(pageStart + pageSize, filtered.length)

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  const openSkumsImportWizard = async () => {
    setImportWizardOpen(true)
    try {
      if (!['ready', 'importing', 'completed'].includes(skumsImport.job.status)) {
        await skumsImport.prepareImport()
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to import from SKUMS'
      if (message === SKUMS_CONNECTOR_MISSING_MESSAGE) {
        setImportWizardOpen(false)
        setPendingImportAfterSave(true)
        setConnectorDialogOpen(true)
      } else {
        toast.error(message)
      }
    }
  }

  const handleImportSkums = async () => {
    await openSkumsImportWizard()
  }

  const handleStartSkumsImport = async () => {
    try {
      await skumsImport.startImport()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to import from SKUMS'
      if (message === SKUMS_CONNECTOR_MISSING_MESSAGE) {
        setImportWizardOpen(false)
        setPendingImportAfterSave(true)
        setConnectorDialogOpen(true)
      } else {
        toast.error(message)
      }
    }
  }

  const handleSaveConnector = async (event: React.FormEvent) => {
    event.preventDefault()
    try {
      await saveSkumsConnector.mutateAsync({
        api_url: connectorForm.api_url,
        api_key: connectorForm.api_key,
        enabled: true,
      })
      toast.success('SKUMS connector saved')
      setConnectorDialogOpen(false)
      if (pendingImportAfterSave) {
        setPendingImportAfterSave(false)
        await openSkumsImportWizard()
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save SKUMS connector')
    }
  }

  const openEdit = (product: Product) => {
    setEditing(product)
    setForm({
      name: product.name,
      description: product.description || '',
      sku: product.sku || '',
      barcode: product.barcode || '',
      price: String(product.price),
      cost_price: product.cost_price ? String(product.cost_price) : '',
      category_id: product.category_id || '',
      track_inventory: product.track_inventory,
      inventory_count: String(product.inventory_count),
      is_active: product.is_active,
    })
    setDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const input = {
      name: form.name,
      description: form.description || undefined,
      sku: form.sku || undefined,
      barcode: form.barcode || undefined,
      price: parseFloat(form.price),
      cost_price: form.cost_price ? parseFloat(form.cost_price) : undefined,
      category_id: form.category_id || null,
      track_inventory: form.track_inventory,
      inventory_count: parseInt(form.inventory_count) || 0,
      is_active: form.is_active,
    }
    try {
      if (editing) {
        await updateProduct.mutateAsync({ id: editing.id, ...input })
        toast.success('Product updated')
      } else {
        await createProduct.mutateAsync(input)
        toast.success('Product created')
      }
      setDialogOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save product')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this product?')) return
    try {
      await deleteProduct.mutateAsync(id)
      toast.success('Product deleted')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  useEffect(() => {
    if (handledQueryAction.current) return
    const action = searchParams.get('new') === '1' ? 'new' : searchParams.get('import') === 'skums' ? 'import' : null
    if (!action) return
    handledQueryAction.current = true
    setSearchParams({}, { replace: true })
    if (action === 'new') {
      openCreate()
    } else {
      void handleImportSkums()
    }
  }, [searchParams, setSearchParams])

  useEffect(() => {
    setPage(1)
  }, [filterCategory, normalizedSearch, pageSize, sourceFilter, statusFilter, stockFilter])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  useEffect(() => {
    const connector = skumsConnector.data?.pos_config?.skums_connector
    if (!connector) return
    setConnectorForm({
      api_url: connector.api_url || 'https://skums.vercel.app',
      api_key: connector.api_key || '',
    })
  }, [skumsConnector.data])

  const showSetupChoices = !isLoading && products.length === 0 && !hasActiveFilters

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Products</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setConnectorDialogOpen(true)}>
            <KeyRound className="h-4 w-4" /> SKUMS Connector
          </Button>
          <Button
            variant="outline"
            onClick={handleImportSkums}
            disabled={skumsImport.job.status === 'estimating'}
          >
            <CloudDownload className="h-4 w-4" /> {skumsImport.job.status === 'estimating' ? 'Checking...' : 'Import from SKUMS'}
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Add Product
          </Button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(16rem,1fr)_repeat(5,minmax(8rem,auto))]">
        <div className="relative min-w-0">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, SKU, or barcode..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ProductStatusFilter)}>
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </Select>
        <Select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as ProductSourceFilter)}>
          <option value="all">All Sources</option>
          <option value="manual">Manual</option>
          <option value="skums">SKUMS</option>
        </Select>
        <Select value={stockFilter} onChange={(e) => setStockFilter(e.target.value as ProductStockFilter)}>
          <option value="all">All Stock</option>
          <option value="tracked">Tracked</option>
          <option value="in_stock">In Stock</option>
          <option value="out_of_stock">Out of Stock</option>
          <option value="untracked">Untracked</option>
        </Select>
        <Select value={String(pageSize)} onChange={(e) => setPageSize(Number(e.target.value))}>
          <option value="10">10 / page</option>
          <option value="25">25 / page</option>
          <option value="50">50 / page</option>
          <option value="100">100 / page</option>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>All Products ({filtered.length})</CardTitle>
            {products.length > 0 && (
              <p className="text-sm text-muted-foreground">
                Showing {firstItem.toLocaleString()}-{lastItem.toLocaleString()} of {filtered.length.toLocaleString()}
              </p>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : filtered.length === 0 ? (
            showSetupChoices ? (
              <div className="grid gap-4 py-4 md:grid-cols-2">
                <button
                  type="button"
                  onClick={openCreate}
                  className="rounded-lg border p-5 text-left transition-colors hover:bg-accent"
                >
                  <PackagePlus className="mb-3 h-6 w-6 text-primary" />
                  <h3 className="font-semibold">Create product manually</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Add a product directly into the live POS company catalog.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={handleImportSkums}
                  disabled={skumsImport.job.status === 'estimating'}
                  className="rounded-lg border p-5 text-left transition-colors hover:bg-accent disabled:opacity-60"
                >
                  <CloudDownload className="mb-3 h-6 w-6 text-primary" />
                  <h3 className="font-semibold">Import from SKUMS</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Pull POS-enabled SKUMS catalog items into the live POS product table.
                  </p>
                </button>
              </div>
            ) : (
              <p className="text-muted-foreground py-8 text-center">No products found.</p>
            )
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell className="text-muted-foreground">{product.sku || '-'}</TableCell>
                    <TableCell>{product.category?.name || '-'}</TableCell>
                    <TableCell className="text-right">{formatCurrency(product.price)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant={product.is_active ? 'success' : 'secondary'}>
                          {product.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                        {productSource(product) === 'skums' && <Badge variant="outline">SKUMS</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(product)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(product.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {filtered.length > 0 && (
            <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Page {safePage.toLocaleString()} of {totalPages.toLocaleString()}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  disabled={safePage <= 1}
                >
                  <ChevronLeft className="h-4 w-4" /> Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                  disabled={safePage >= totalPages}
                >
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Product Form Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent onClose={() => setDialogOpen(false)} className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Product' : 'New Product'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                  <option value="">No Category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>SKU</Label>
                <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Barcode</Label>
                <Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Price</Label>
                <Input type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Cost Price</Label>
                <Input type="number" step="0.01" min="0" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} />
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch checked={form.track_inventory} onCheckedChange={(v) => setForm({ ...form, track_inventory: v })} />
                <Label>Track Inventory</Label>
              </div>
              {form.track_inventory && (
                <div className="space-y-2">
                  <Label>Stock Count</Label>
                  <Input type="number" min="0" value={form.inventory_count} onChange={(e) => setForm({ ...form, inventory_count: e.target.value })} className="w-24" />
                </div>
              )}
              <div className="flex items-center gap-2">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                <Label>Active</Label>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createProduct.isPending || updateProduct.isPending}>
                {editing ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={connectorDialogOpen} onOpenChange={setConnectorDialogOpen}>
        <DialogContent onClose={() => setConnectorDialogOpen(false)} className="max-w-lg">
          <DialogHeader>
            <DialogTitle>SKUMS Connector</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveConnector} className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label>SKUMS API URL</Label>
              <Input
                value={connectorForm.api_url}
                onChange={(e) => setConnectorForm({ ...connectorForm, api_url: e.target.value })}
                placeholder="https://skums.vercel.app"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>SKUMS Account Key</Label>
              <Input
                type="password"
                value={connectorForm.api_key}
                onChange={(e) => setConnectorForm({ ...connectorForm, api_key: e.target.value })}
                placeholder="sk_live_..."
                required
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Create this key in SKUMS Settings, then paste the API URL and key here for this POS company.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setConnectorDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveSkumsConnector.isPending}>
                {saveSkumsConnector.isPending ? 'Saving...' : pendingImportAfterSave ? 'Save and Import' : 'Save Connector'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={importWizardOpen} onOpenChange={setImportWizardOpen}>
        <DialogContent onClose={() => setImportWizardOpen(false)} className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import from SKUMS</DialogTitle>
          </DialogHeader>
          <SkumsImportWizardContent
            job={skumsImport.job}
            onStart={handleStartSkumsImport}
            onClose={() => setImportWizardOpen(false)}
            onReset={skumsImport.resetImport}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SkumsImportWizardContent({
  job,
  onStart,
  onClose,
  onReset,
}: {
  job: ReturnType<typeof useSkumsImportJob>['job']
  onStart: () => void
  onClose: () => void
  onReset: () => void
}) {
  const percent = job.total > 0 ? Math.min(100, Math.round((job.processed / job.total) * 100)) : 8
  const topCategories = job.summary?.categories.slice(0, 6) || []

  if (job.status === 'estimating') {
    return (
      <div className="mt-5 space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Catalog checked" value={job.processed.toLocaleString()} />
          <Metric label="Catalog total" value={job.total ? job.total.toLocaleString() : 'Checking'} />
          <Metric label="Status" value="Preparing" />
        </div>
        <ProgressBar value={percent} />
        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={onClose}>Run in background</Button>
        </div>
      </div>
    )
  }

  if (job.status === 'failed') {
    return (
      <div className="mt-5 space-y-4">
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {job.error || 'SKUMS import failed'}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onReset}>Reset</Button>
          <Button type="button" onClick={onClose}>Close</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-5 space-y-5">
      {job.status === 'completed' ? (
        <div className="flex items-center gap-2 rounded-md border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4" />
          <span>{job.imported.toLocaleString()} imported, {job.skipped.toLocaleString()} skipped.</span>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-4">
        <Metric label="SKUMS catalog" value={(job.summary?.catalogTotal || 0).toLocaleString()} />
        <Metric label="POS-enabled" value={(job.summary?.posEligible || 0).toLocaleString()} />
        <Metric label="Ready" value={(job.summary?.importable || 0).toLocaleString()} />
        <Metric label="Already in POS" value={(job.summary?.skippedExisting || 0).toLocaleString()} />
      </div>

      {job.status === 'importing' && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>{job.imported.toLocaleString()} imported</span>
            <span>{percent}%</span>
          </div>
          <ProgressBar value={percent} />
        </div>
      )}

      <div className="overflow-hidden rounded-md border">
        <div className="grid grid-cols-[1fr_6rem_6rem_6rem] bg-secondary px-3 py-2 text-xs font-medium text-muted-foreground">
          <span>Category</span>
          <span className="text-right">Total</span>
          <span className="text-right">Ready</span>
          <span className="text-right">In POS</span>
        </div>
        {topCategories.length > 0 ? topCategories.map((category) => (
          <div key={category.name} className="grid grid-cols-[1fr_6rem_6rem_6rem] border-t px-3 py-2 text-sm">
            <span className="truncate">{category.name}</span>
            <span className="text-right">{category.total.toLocaleString()}</span>
            <span className="text-right">{category.importable.toLocaleString()}</span>
            <span className="text-right">{category.skipped.toLocaleString()}</span>
          </div>
        )) : (
          <div className="px-3 py-5 text-center text-sm text-muted-foreground">No POS-enabled SKUMS products found.</div>
        )}
      </div>

      <div className="flex justify-end gap-2">
        {job.status === 'ready' && (
          <>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="button" onClick={onStart} disabled={!job.summary?.importable}>
              <CloudDownload className="h-4 w-4" /> Start Import
            </Button>
          </>
        )}
        {job.status === 'importing' && (
          <Button type="button" variant="outline" onClick={onClose}>Run in background</Button>
        )}
        {job.status === 'completed' && (
          <>
            <Button type="button" variant="outline" onClick={onReset}>Clear</Button>
            <Button type="button" onClick={onClose}>Done</Button>
          </>
        )}
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  )
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-secondary">
      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  )
}
