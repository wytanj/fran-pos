/**
 * Store replenishment REQUEST (signal only).
 * TODO-LOFT B.5 — never calls Loft; HQ reviews Mon/Thu wave vs lift.
 */
import { useMemo, useState } from 'react'
import { ClipboardList, Plus, Send, Trash2 } from 'lucide-react'
import { usePos } from '@/pos/lib/pos-context'
import { canRequestReplenishment, getActiveStore } from '@/pos/lib/pos-store-config'
import { createSkumsStoreReplenishmentRequest } from '@/pos/lib/skums-client'
import { useSkumsConnector } from '@/hooks/use-skums-connector'
import { PRODUCTS } from '@/pos/data/mock'

type LineDraft = { sku: string; name: string; requested_qty: number; reason: string }

export default function RequestStockPage() {
  const { user, mode } = usePos()
  const { connector: skumsConnector } = useSkumsConnector()
  const store = getActiveStore()
  const allowed = canRequestReplenishment(user?.role)

  const [lines, setLines] = useState<LineDraft[]>([])
  const [skuInput, setSkuInput] = useState('')
  const [qtyInput, setQtyInput] = useState(6)
  const [priority, setPriority] = useState<'normal' | 'urgent' | 'critical'>('normal')
  const [reason, setReason] = useState('')
  const [neededBy, setNeededBy] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const catalog = useMemo(() => PRODUCTS.slice(0, 40), [])

  function addLine() {
    const sku = skuInput.trim().toUpperCase()
    if (!sku || qtyInput < 1) return
    const product = catalog.find(p => p.sku.toUpperCase() === sku)
    setLines(prev => {
      const existing = prev.find(l => l.sku === sku)
      if (existing) {
        return prev.map(l =>
          l.sku === sku
            ? { ...l, requested_qty: l.requested_qty + qtyInput }
            : l,
        )
      }
      return [
        ...prev,
        {
          sku,
          name: product?.name || sku,
          requested_qty: qtyInput,
          reason: '',
        },
      ]
    })
    setSkuInput('')
  }

  function removeLine(sku: string) {
    setLines(prev => prev.filter(l => l.sku !== sku))
  }

  async function submit() {
    setError(null)
    setMessage(null)
    if (!allowed) {
      setError('Only manager+ can request replenishment.')
      return
    }
    if (!lines.length) {
      setError('Add at least one SKU line.')
      return
    }

    if (mode === 'demo' || !skumsConnector) {
      setMessage(
        'Demo / offline: request would be sent to HQ for Mon/Thu wave review (not sent to Loft).',
      )
      setLines([])
      return
    }

    setSubmitting(true)
    try {
      const idempotency_key = `replenishment-request:${store.code}:${Date.now()}`
      const result = await createSkumsStoreReplenishmentRequest(
        {
          idempotency_key,
          priority,
          reason: reason || 'Store replenishment request',
          needed_by: neededBy || undefined,
          pos_location_code: store.code,
          inventory_location_id: store.inventoryLocationId,
          store_location_id: store.inventoryLocationId,
          lines: lines.map(l => ({
            sku: l.sku,
            requested_qty: l.requested_qty,
            reason: l.reason || reason || undefined,
          })),
        },
        skumsConnector,
      )
      setMessage(
        result.data.message
          || 'Request sent to HQ. Reviewed against Mon & Thu replenishment — not an order to Loft.',
      )
      setLines([])
      setReason('')
    } catch (e: any) {
      setError(e?.message || 'Failed to submit request')
    } finally {
      setSubmitting(false)
    }
  }

  if (!allowed) {
    return (
      <div className="p-6">
        <div className="rounded-lg border bg-card p-6">
          <h1 className="text-lg font-semibold">Request stock</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Cashier role can receive deliveries and report exceptions, but cannot request replenishment.
            Ask a manager.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <ClipboardList className="h-5 w-5" />
            Request stock
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Sends a signal to HQ only. HQ reviews baseline + lift (MCP) and either lifts now or
            defers to the regular <strong>Monday / Thursday</strong> wave. This does not order Loft.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Store: <span className="font-medium text-foreground">{store.code}</span> · {store.name}
          </p>
        </div>
      </div>

      {message && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-semibold">Add lines</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              className="min-w-[8rem] flex-1 rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="SKU"
              value={skuInput}
              onChange={e => setSkuInput(e.target.value)}
              list="request-sku-list"
            />
            <datalist id="request-sku-list">
              {catalog.map(p => (
                <option key={p.sku} value={p.sku}>{p.name}</option>
              ))}
            </datalist>
            <input
              type="number"
              min={1}
              className="w-24 rounded-md border bg-background px-3 py-2 text-sm"
              value={qtyInput}
              onChange={e => setQtyInput(Math.max(1, Number(e.target.value) || 1))}
            />
            <button
              type="button"
              onClick={addLine}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
            >
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>

          <ul className="mt-4 divide-y rounded-md border">
            {lines.length === 0 && (
              <li className="px-3 py-4 text-sm text-muted-foreground">No lines yet.</li>
            )}
            {lines.map(line => (
              <li key={line.sku} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{line.sku}</p>
                  <p className="text-xs text-muted-foreground">{line.name} · qty {line.requested_qty}</p>
                </div>
                <button type="button" onClick={() => removeLine(line.sku)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-semibold">Details</h2>
          <label className="mt-3 block text-xs font-medium text-muted-foreground">Priority</label>
          <select
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={priority}
            onChange={e => setPriority(e.target.value as typeof priority)}
          >
            <option value="normal">Normal (likely next Mon/Thu wave)</option>
            <option value="urgent">Urgent (ask HQ for lift)</option>
            <option value="critical">Critical</option>
          </select>

          <label className="mt-3 block text-xs font-medium text-muted-foreground">Needed by (optional)</label>
          <input
            type="date"
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={neededBy}
            onChange={e => setNeededBy(e.target.value)}
          />

          <label className="mt-3 block text-xs font-medium text-muted-foreground">Reason</label>
          <textarea
            className="mt-1 min-h-[80px] w-full rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="Shelf low after weekend / campaign…"
            value={reason}
            onChange={e => setReason(e.target.value)}
          />

          <button
            type="button"
            disabled={submitting || lines.length === 0}
            onClick={submit}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {submitting ? 'Sending…' : 'Send request to HQ'}
          </button>
        </section>
      </div>
    </div>
  )
}
