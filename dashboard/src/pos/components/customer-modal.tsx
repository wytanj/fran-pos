import { useDeferredValue, useState, type FormEvent } from 'react'
import { Gift, Loader2, QrCode, Search, Star, UserPlus, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'
import { useCreateCustomer, useResolvedCustomers } from '@/hooks/use-customers'
import { CUSTOMERS, STORE, type Customer } from '@/pos/data/mock'
import {
  createManualPosCustomer,
  splitCustomerFullName,
  toPosCustomer,
} from '@/pos/lib/customer-profile'
import type { Customer as DbCustomer, PosCustomerResolution } from '@pos/shared'

interface CustomerModalProps {
  open: boolean
  mode: 'demo' | 'live'
  onClose: () => void
  onSelect: (c: Customer) => void
}

const emptyAddForm = {
  mobile: '',
  fullName: '',
  birthday: '',
}

const emptyResolution: PosCustomerResolution = {
  status: 'none',
  source: 'local',
  customers: [],
  warnings: [],
}

function normalizedPhone(value: string) {
  return value.replace(/\D/g, '')
}

function looksLikeMobile(value: string) {
  return /^\+?\d[\d\s-]{5,}$/.test(value.trim())
}

function looksLikeBirthday(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim())
}

function prefillAddForm(query: string) {
  const trimmed = query.trim()
  const form = { ...emptyAddForm }
  if (looksLikeMobile(trimmed)) form.mobile = trimmed
  else if (looksLikeBirthday(trimmed)) form.birthday = trimmed
  else if (trimmed.length > 0 && !trimmed.includes('@')) form.fullName = trimmed
  return form
}

function matchesDemoCustomer(customer: Customer, query: string) {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return true
  const queryPhone = normalizedPhone(trimmed)
  return (
    customer.name.toLowerCase().includes(trimmed) ||
    customer.email.toLowerCase().includes(trimmed) ||
    customer.phone.toLowerCase().includes(trimmed) ||
    (queryPhone.length > 0 && normalizedPhone(customer.phone).includes(queryPhone)) ||
    Boolean(customer.birthday?.includes(trimmed))
  )
}

function customerMeta(customer: Customer) {
  return [customer.phone, customer.email, customer.birthday ? `Birthday ${customer.birthday}` : null]
    .filter(Boolean)
    .join(' - ')
}

function loyaltySummary(customer: Customer) {
  const items = []
  if (customer.points > 0) items.push(`${customer.points.toLocaleString()} pts`)
  if (customer.storeCredit > 0) items.push(`${formatCurrency(customer.storeCredit, STORE.currency)} credit`)
  if (customer.giftCardBalance > 0) items.push(`${formatCurrency(customer.giftCardBalance, STORE.currency)} gift`)
  return items
}

function resolutionSourceLabel(source: PosCustomerResolution['source']) {
  if (source === 'identity_link') return 'Identity link'
  if (source === 'external_link') return 'External link'
  if (source === 'fallback') return 'Local fallback'
  return 'Local'
}

/** POS-owned customer lookup and manual enrolment for tenant CRM/loyalty integrations. */
export function CustomerModal({ open, mode, onClose, onSelect }: CustomerModalProps) {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [scanning, setScanning] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addForm, setAddForm] = useState(emptyAddForm)
  const createCustomer = useCreateCustomer()
  const { data: resolution = emptyResolution, isFetching } = useResolvedCustomers(
    mode === 'live' ? deferredQuery : undefined,
    mode === 'live'
  )

  const results =
    mode === 'live'
      ? resolution.customers.map((customer) => toPosCustomer(customer))
      : CUSTOMERS.filter((customer) => matchesDemoCustomer(customer, deferredQuery))

  const openAddForm = () => {
    setAddForm(prefillAddForm(query))
    setAdding(true)
  }

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget as HTMLFormElement)
    const fullName = String(formData.get('fullName') ?? addForm.fullName).trim()
    const mobile = String(formData.get('mobile') ?? addForm.mobile).trim()
    const birthday = String(formData.get('birthday') ?? addForm.birthday).trim()
    if (!fullName || !mobile) return

    if (mode === 'demo') {
      onSelect(createManualPosCustomer({ fullName, phone: mobile, birthday: birthday || null }))
      setAdding(false)
      return
    }

    const { firstName, lastName } = splitCustomerFullName(fullName)
    try {
      const created = await createCustomer.mutateAsync({
        first_name: firstName || undefined,
        last_name: lastName || undefined,
        phone: mobile,
        birthday: birthday || undefined,
        source: 'manual',
      })
      toast.success('Customer added')
      onSelect(toPosCustomer(created as DbCustomer))
      setAdding(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add customer')
    }
  }

  const simulateScan = () => {
    setScanning(true)
    setTimeout(() => {
      setScanning(false)
      onSelect(CUSTOMERS[0])
    }, 900)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" onClose={onClose}>
        <DialogHeader>
          <DialogTitle>Find or Add Customer</DialogTitle>
        </DialogHeader>

        {mode === 'demo' && (
          <button
            onClick={simulateScan}
            disabled={scanning}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed py-4 text-sm font-medium transition-colors hover:bg-accent cursor-pointer"
          >
            {scanning ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" /> Scanning member QR...
              </>
            ) : (
              <>
                <QrCode className="h-5 w-5" /> Scan member QR code
              </>
            )}
          </button>
        )}

        <div className="mt-3 flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Search mobile, full name, email, birthday..."
              className="pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Button variant="outline" onClick={openAddForm}>
            <UserPlus className="h-4 w-4" /> Add
          </Button>
        </div>

        {adding && (
          <form onSubmit={handleCreate} className="mt-3 rounded-lg border bg-muted/30 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Mobile number</Label>
                <Input
                  name="mobile"
                  type="tel"
                  value={addForm.mobile}
                  onChange={(e) => {
                    const { value } = e.target
                    setAddForm((current) => ({ ...current, mobile: value }))
                  }}
                  placeholder="+65 9123 4567"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Birthday</Label>
                <Input
                  name="birthday"
                  type="date"
                  value={addForm.birthday}
                  onInput={(e) => {
                    const { value } = e.currentTarget
                    setAddForm((current) => ({ ...current, birthday: value }))
                  }}
                  onChange={(e) => {
                    const { value } = e.target
                    setAddForm((current) => ({ ...current, birthday: value }))
                  }}
                />
              </div>
            </div>
            <div className="mt-3 space-y-1.5">
              <Label>Full name</Label>
              <Input
                name="fullName"
                value={addForm.fullName}
                onChange={(e) => {
                  const { value } = e.target
                  setAddForm((current) => ({ ...current, fullName: value }))
                }}
                placeholder="Jane Doe"
              />
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setAdding(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!addForm.mobile.trim() || !addForm.fullName.trim() || createCustomer.isPending}>
                {createCustomer.isPending ? 'Adding...' : 'Add Customer'}
              </Button>
            </div>
          </form>
        )}

        <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
          {isFetching && mode === 'live' && (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching customers...
            </div>
          )}
          {!isFetching && mode === 'live' && results.length > 0 && (
            <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <span>{resolutionSourceLabel(resolution.source)}</span>
              <span>{resolution.status === 'exact' ? 'Exact match' : `${results.length} candidates`}</span>
            </div>
          )}
          {!isFetching && mode === 'live' && resolution.warnings.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {resolution.warnings[0]}
            </div>
          )}
          {!isFetching && results.map((customer) => {
            const loyaltyItems = loyaltySummary(customer)
            return (
              <button
                key={customer.id}
                onClick={() => onSelect(customer)}
                className="flex w-full items-start justify-between gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent cursor-pointer"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{customer.name}</span>
                    <Badge variant="secondary">{customer.tier}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{customerMeta(customer)}</p>
                  {loyaltyItems.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {customer.points > 0 && (
                        <span className="flex items-center gap-1">
                          <Star className="h-3 w-3 text-amber-500" /> {customer.points.toLocaleString()} pts
                        </span>
                      )}
                      {customer.storeCredit > 0 && (
                        <span className="flex items-center gap-1">
                          <Wallet className="h-3 w-3" /> {formatCurrency(customer.storeCredit, STORE.currency)} credit
                        </span>
                      )}
                      {customer.giftCardBalance > 0 && (
                        <span className="flex items-center gap-1">
                          <Gift className="h-3 w-3" /> {formatCurrency(customer.giftCardBalance, STORE.currency)} gift
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </button>
            )
          })}
          {!isFetching && results.length === 0 && (
            <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              <p>No customer found{query ? ` for "${query}"` : ''}.</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={openAddForm}>
                <UserPlus className="h-4 w-4" /> Add Customer
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
