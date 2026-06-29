import { useState, useDeferredValue } from 'react'
import { useCustomers, useCreateCustomer, useUpdateCustomer, useDeleteCustomer, useCustomerOrders } from '@/hooks/use-customers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Plus, Search, UserPlus, Mail, Phone, ExternalLink, ShoppingCart, ArrowLeft, Calendar } from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import { splitCustomerFullName } from '@/pos/lib/customer-profile'
import { ORDER_STATUSES } from '@pos/shared'
import type { Customer, Order, OrderStatus } from '@pos/shared'

const emptyForm = {
  full_name: '',
  email: '',
  phone: '',
  birthday: '',
  notes: '',
  tags: '',
}

function statusVariant(status: OrderStatus) {
  const map: Record<OrderStatus, 'default' | 'success' | 'warning' | 'destructive'> = {
    draft: 'default', completed: 'success', refunded: 'warning', voided: 'destructive',
  }
  return map[status]
}

function customerDisplayName(c: Customer) {
  if (c.first_name || c.last_name) return [c.first_name, c.last_name].filter(Boolean).join(' ')
  if (c.email) return c.email
  if (c.phone) return c.phone
  return 'Unnamed Customer'
}

function customerInitials(c: Customer) {
  if (c.first_name && c.last_name) return (c.first_name[0] + c.last_name[0]).toUpperCase()
  if (c.first_name) return c.first_name[0].toUpperCase()
  if (c.email) return c.email[0].toUpperCase()
  return '?'
}

export default function CustomersPage() {
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const { data: customers = [], isLoading } = useCustomers(deferredSearch)
  const createCustomer = useCreateCustomer()
  const updateCustomer = useUpdateCustomer()
  const deleteCustomer = useDeleteCustomer()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [form, setForm] = useState(emptyForm)

  // Detail view
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)

  const openCreate = () => {
    setEditing(null)
    // Pre-fill phone/email if user typed something that looks like one
    const prefill = { ...emptyForm }
    if (search.includes('@')) prefill.email = search
    else if (/^\+?\d[\d\s-]{5,}$/.test(search)) prefill.phone = search
    else if (/^\d{4}-\d{2}-\d{2}$/.test(search.trim())) prefill.birthday = search.trim()
    else if (search.length > 0) {
      prefill.full_name = search.trim()
    }
    setForm(prefill)
    setDialogOpen(true)
  }

  const openEdit = (customer: Customer) => {
    setEditing(customer)
    setForm({
      full_name: [customer.first_name, customer.last_name].filter(Boolean).join(' '),
      email: customer.email || '',
      phone: customer.phone || '',
      birthday: customer.birthday || '',
      notes: customer.notes || '',
      tags: customer.tags?.join(', ') || '',
    })
    setDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const { firstName, lastName } = splitCustomerFullName(form.full_name)
    const input = {
      first_name: firstName || undefined,
      last_name: lastName || undefined,
      email: form.email || undefined,
      phone: form.phone || undefined,
      birthday: form.birthday || undefined,
      notes: form.notes || undefined,
      tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
    }
    try {
      if (editing) {
        await updateCustomer.mutateAsync({ id: editing.id, ...input })
        toast.success('Customer updated')
      } else {
        const created = await createCustomer.mutateAsync(input)
        toast.success('Customer created')
        setSelectedCustomer(created as Customer)
      }
      setDialogOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save customer')
    }
  }

  const handleDelete = async (customer: Customer) => {
    const name = customerDisplayName(customer)
    if (!confirm(`Remove ${name}? Their order history will be preserved.`)) return
    try {
      await deleteCustomer.mutateAsync(customer.id)
      toast.success('Customer removed')
      if (selectedCustomer?.id === customer.id) setSelectedCustomer(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove')
    }
  }

  // Detail view
  if (selectedCustomer) {
    return (
      <CustomerDetail
        customer={selectedCustomer}
        onBack={() => setSelectedCustomer(null)}
        onEdit={() => openEdit(selectedCustomer)}
        onDelete={() => handleDelete(selectedCustomer)}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Customers</h1>
        <Button onClick={openCreate}>
          <UserPlus className="h-4 w-4" /> New Customer
        </Button>
      </div>

      {/* Search - the primary action */}
      <div className="relative max-w-lg">
        <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by mobile, full name, email, or birthday..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 h-11 text-base"
          autoFocus
        />
      </div>

      {/* Results */}
      {isLoading ? (
        <p className="text-muted-foreground py-8 text-center">Searching...</p>
      ) : customers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            {search.length >= 2 ? (
              <div className="space-y-3">
                <p className="text-muted-foreground">No customers match "{search}"</p>
                <Button onClick={openCreate} variant="outline">
                  <Plus className="h-4 w-4" /> Create "{search}" as new customer
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-muted-foreground">No customers yet. Add your first one or search to find synced customers.</p>
                <Button onClick={openCreate}>
                  <UserPlus className="h-4 w-4" /> Add Customer
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2">
          {customers.map((customer) => (
            <Card
              key={customer.id}
              className="cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => setSelectedCustomer(customer)}
            >
              <CardContent className="flex items-center gap-4 py-4 px-5">
                {/* Avatar */}
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                  {customerInitials(customer)}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{customerDisplayName(customer)}</p>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    {customer.email && (
                      <span className="flex items-center gap-1 truncate">
                        <Mail className="h-3 w-3 shrink-0" /> {customer.email}
                      </span>
                    )}
                    {customer.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3 shrink-0" /> {customer.phone}
                      </span>
                    )}
                    {customer.birthday && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3 shrink-0" /> {formatDate(customer.birthday)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Source badge + tags */}
                <div className="flex items-center gap-2 shrink-0">
                  {customer.tags?.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                  ))}
                  {customer.source !== 'manual' && (
                    <Badge variant="outline" className="text-xs flex items-center gap-1">
                      <ExternalLink className="h-3 w-3" /> {customer.source}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent onClose={() => setDialogOpen(false)}>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Customer' : 'New Customer'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Update customer information'
                : 'Add a customer manually. Synced customers appear automatically.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                placeholder="Jane Doe"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="jane@example.com"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Mobile Number</Label>
                <Input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+1 555 123 4567"
                />
              </div>
              <div className="space-y-2">
                <Label>Birthday</Label>
                <Input
                  type="date"
                  value={form.birthday}
                  onChange={(e) => setForm({ ...form, birthday: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Tags</Label>
              <Input
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                placeholder="VIP, wholesale, etc. (comma separated)"
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Internal notes about this customer..."
                rows={2}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createCustomer.isPending || updateCustomer.isPending}>
                {editing ? 'Update' : 'Add Customer'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ===== Customer Detail View =====

function CustomerDetail({
  customer,
  onBack,
  onEdit,
  onDelete,
}: {
  customer: Customer
  onBack: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const { data: orders = [] } = useCustomerOrders(customer.id)

  const totalSpent = orders
    .filter((o: Order) => o.status === 'completed')
    .reduce((sum: number, o: Order) => sum + Number(o.total), 0)
  const orderCount = orders.filter((o: Order) => o.status === 'completed').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{customerDisplayName(customer)}</h1>
          <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
            {customer.source !== 'manual' && (
              <Badge variant="outline" className="text-xs flex items-center gap-1">
                <ExternalLink className="h-3 w-3" /> Synced from {customer.source}
                {customer.external_id && <span>({customer.external_id})</span>}
              </Badge>
            )}
            <span>Added {formatDate(customer.created_at)}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onEdit}>Edit</Button>
          <Button variant="outline" className="text-destructive" onClick={onDelete}>Remove</Button>
        </div>
      </div>

      {/* Info + Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Contact Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {customer.email && (
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <a href={`mailto:${customer.email}`} className="hover:underline">{customer.email}</a>
              </div>
            )}
            {customer.phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <a href={`tel:${customer.phone}`} className="hover:underline">{customer.phone}</a>
              </div>
            )}
            {customer.birthday && (
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>{formatDate(customer.birthday)}</span>
              </div>
            )}
            {!customer.email && !customer.phone && !customer.birthday && (
              <p className="text-muted-foreground">No contact info</p>
            )}
            {customer.tags && customer.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-2">
                {customer.tags.map((tag) => (
                  <Badge key={tag} variant="secondary">{tag}</Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stats */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Lifetime Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatCurrency(totalSpent)}</div>
            <p className="text-sm text-muted-foreground mt-1">
              {orderCount} completed {orderCount === 1 ? 'order' : 'orders'}
            </p>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {customer.notes || 'No notes'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Purchase History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" /> Purchase History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No orders yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order: Order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">{order.order_number}</TableCell>
                    <TableCell>{formatDateTime(order.created_at)}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(order.status)}>
                        {ORDER_STATUSES[order.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell>{order.payment_method?.name || '-'}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(order.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
