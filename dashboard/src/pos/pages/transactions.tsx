import { useState } from 'react'
import { Receipt, Search, Printer, Eye } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { formatCurrency, cn } from '@/lib/utils'
import { PageHeader } from '@/pos/components/page-header'
import { PAST_TRANSACTIONS, STORE, type PastTransaction } from '@/pos/data/mock'
import { ReceiptPreview } from '@/pos/components/receipt-preview'
import type { CompletedSale } from '@/pos/lib/pos-context'
import { buildSkumsSaleIdempotencyKey, POS_REGISTER_CODE } from '@/pos/lib/skums-sale-adapter'

function transactionCompletedAtIso(value: string) {
  const parsed = new Date(`${value.replace(' ', 'T')}:00+08:00`)
  return Number.isNaN(parsed.getTime()) ? new Date(0).toISOString() : parsed.toISOString()
}

function toSale(t: PastTransaction): CompletedSale {
  const completedAtIso = transactionCompletedAtIso(t.date)
  const idempotencyKey = buildSkumsSaleIdempotencyKey({ receiptNo: t.receiptNo, completedAtIso })

  return {
    receiptNo: t.receiptNo,
    lines: t.items.map((it, i) => ({
      lineId: `${t.receiptNo}-${i}`,
      sku: it.sku,
      name: it.name,
      unitPrice: it.price,
      listPrice: it.price,
      qty: it.qty,
      returnable: t.returnable,
      isMarkdown: false,
      lineDiscount: 0,
    })),
    cartPriceOverride: null,
    customer: null,
    salesType: 'normal',
    payments: [{ id: 'p', mode: 'card', label: t.payment, amount: t.total }],
    subtotal: t.total,
    discountTotal: 0,
    tax: t.total - t.total / 1.09,
    total: t.total,
    pointsEarned: 0,
    cashier: t.cashier,
    timestamp: t.date,
    completedAtIso,
    storeCode: STORE.code,
    registerCode: POS_REGISTER_CODE,
    idempotencyKey,
    skumsSync: {
      status: 'not_required',
      idempotencyKey,
      updatedAt: completedAtIso,
    },
    isExchange: t.type === 'Exchange',
    fran: null,
  }
}

export default function TransactionsPage() {
  const [query, setQuery] = useState('')
  const [type, setType] = useState<'All' | PastTransaction['type']>('All')
  const [view, setView] = useState<{ sale: CompletedSale; duplicate: boolean } | null>(null)

  const rows = PAST_TRANSACTIONS.filter(
    (t) =>
      (type === 'All' || t.type === type) &&
      (query === '' ||
        t.receiptNo.toLowerCase().includes(query.toLowerCase()) ||
        t.cashier.toLowerCase().includes(query.toLowerCase()) ||
        (t.customer ?? '').toLowerCase().includes(query.toLowerCase()) ||
        t.items.some((i) => i.sku.toLowerCase().includes(query.toLowerCase())))
  )

  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={Receipt} title="Query Transactions" subtitle="Search, view and reprint past receipts" />

      <div className="flex flex-wrap items-center gap-2 p-4 pb-2">
        <div className="relative min-w-64 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search receipt no., cashier, member or SKU…"
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-1.5">
          {(['All', 'Sale', 'Refund', 'Exchange'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={cn(
                'rounded-full px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer',
                type === t ? 'bg-primary text-primary-foreground' : 'bg-secondary hover:bg-accent'
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <div className="overflow-hidden rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60">
              <tr className="text-left text-xs text-muted-foreground">
                <th className="p-3">Receipt</th>
                <th className="p-3">Date / time</th>
                <th className="p-3">Cashier</th>
                <th className="p-3">Member</th>
                <th className="p-3">Type</th>
                <th className="p-3">Payment</th>
                <th className="p-3 text-right">Total</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.receiptNo} className="border-t hover:bg-secondary/30">
                  <td className="p-3 font-medium">{t.receiptNo}</td>
                  <td className="p-3 text-muted-foreground">{t.date}</td>
                  <td className="p-3">{t.cashier}</td>
                  <td className="p-3 text-muted-foreground">{t.customer ?? '—'}</td>
                  <td className="p-3">
                    <Badge variant={t.type === 'Sale' ? 'secondary' : t.type === 'Refund' ? 'destructive' : 'default'}>
                      {t.type}
                    </Badge>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{t.payment}</td>
                  <td className={cn('p-3 text-right font-semibold tabular-nums', t.total < 0 && 'text-destructive')}>
                    {formatCurrency(t.total, STORE.currency)}
                  </td>
                  <td className="p-3">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setView({ sale: toSale(t), duplicate: false })}>
                        <Eye className="h-4 w-4" /> View
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setView({ sale: toSale(t), duplicate: true })}>
                        <Printer className="h-4 w-4" /> Reprint
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-sm text-muted-foreground">
                    No transactions match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={view !== null} onOpenChange={(o) => !o && setView(null)}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto" onClose={() => setView(null)}>
          <div className="mb-2 text-center">
            <h2 className="text-lg font-semibold">{view?.duplicate ? 'Reprint receipt' : 'Receipt'}</h2>
            <p className="text-sm text-muted-foreground">{view?.sale.receiptNo}</p>
          </div>
          {view && (
            <div className="rounded-lg bg-secondary p-3">
              <ReceiptPreview sale={view.sale} duplicate={view.duplicate} />
            </div>
          )}
          <Button className="mt-4 w-full" onClick={() => setView(null)}>
            <Printer className="h-4 w-4" /> Send to printer
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}
