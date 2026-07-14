/**
 * Receive delivery from Loft / HQ order.
 * TODO-LOFT C.3 — report short/damaged/over/wrong; HQ verifies.
 */
import { useCallback, useEffect, useState } from 'react'
import { PackageCheck, RefreshCw, AlertTriangle } from 'lucide-react'
import { usePos } from '@/pos/lib/pos-context'
import { getActiveStore } from '@/pos/lib/pos-store-config'
import {
  listSkumsExpectedDeliveries,
  submitSkumsStoreReceive,
} from '@/pos/lib/skums-client'
import { useSkumsConnector } from '@/hooks/use-skums-connector'

type Delivery = {
  id: string
  order_number: string
  status: string
  delivery_mode?: string | null
  lines: Array<{
    id: string
    sku: string
    expected_qty: number
    product_id?: string | null
  }>
}

type LineEdit = {
  lineId: string
  sku: string
  product_id?: string | null
  expected_qty: number
  received_qty: number
  damaged_qty: number
  exception_type: '' | 'short' | 'damaged' | 'over' | 'wrong_sku' | 'unexpected_item'
  note: string
}

export default function ReceiveDeliveryPage() {
  const { user, mode } = usePos()
  const { connector } = useSkumsConnector()
  const store = getActiveStore()

  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [selected, setSelected] = useState<Delivery | null>(null)
  const [edits, setEdits] = useState<LineEdit[]>([])
  const [collectorName, setCollectorName] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    if (mode === 'demo' || !connector) {
      setDeliveries([])
      return
    }
    setLoading(true)
    try {
      const res = await listSkumsExpectedDeliveries(
        {
          pos_location_code: store.code,
          location_id: store.inventoryLocationId,
        },
        connector,
      )
      setDeliveries(res.data || [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load expected deliveries')
    } finally {
      setLoading(false)
    }
  }, [connector, mode, store.code, store.inventoryLocationId])

  useEffect(() => {
    void load()
  }, [load])

  function openDelivery(d: Delivery) {
    setSelected(d)
    setMessage(null)
    setError(null)
    setEdits(
      d.lines.map(line => ({
        lineId: line.id,
        sku: line.sku,
        product_id: line.product_id,
        expected_qty: line.expected_qty,
        received_qty: line.expected_qty,
        damaged_qty: 0,
        exception_type: '',
        note: '',
      })),
    )
  }

  function updateEdit(sku: string, patch: Partial<LineEdit>) {
    setEdits(prev => prev.map(e => (e.sku === sku ? { ...e, ...patch } : e)))
  }

  async function submit() {
    if (!selected) return
    setError(null)
    setMessage(null)

    for (const e of edits) {
      if (e.exception_type && !e.note.trim()) {
        setError(`Note required for exception on ${e.sku}`)
        return
      }
      if (e.received_qty < e.expected_qty && !e.exception_type) {
        updateEdit(e.sku, { exception_type: 'short' })
      }
    }

    if (selected.delivery_mode === 'self_collect' && !collectorName.trim()) {
      setError('Collector name required for self-collect deliveries')
      return
    }

    if (mode === 'demo' || !connector) {
      setMessage('Demo: receive would be reported to HQ. Exceptions would show as “reported, not resolved”.')
      return
    }

    setSubmitting(true)
    try {
      const lines = edits.map(e => {
        let exception_type = e.exception_type || null
        if (!exception_type && e.damaged_qty > 0) exception_type = 'damaged'
        if (!exception_type && e.received_qty < e.expected_qty) exception_type = 'short'
        if (!exception_type && e.received_qty > e.expected_qty) exception_type = 'over'
        return {
          sku: e.sku,
          product_id: e.product_id,
          replenishment_order_line_id: e.lineId,
          expected_qty: e.expected_qty,
          received_qty: e.received_qty,
          damaged_qty: e.damaged_qty,
          exception_type,
          note: e.note || null,
        }
      })

      const result = await submitSkumsStoreReceive(
        {
          order_id: selected.id,
          idempotency_key: `receiving:${store.code}:${selected.order_number}:${Date.now()}`,
          pos_location_code: store.code,
          received_by_ref: user?.name || user?.id || undefined,
          collector_name: collectorName || undefined,
          lines,
        },
        connector,
      )

      const hasEx = (result.exceptions || []).length > 0
      setMessage(
        result.message
          || (hasEx
            ? 'Submitted. Exceptions reported to HQ for verification (not resolved on POS).'
            : 'Submitted. Good units applied to store stock.'),
      )
      setSelected(null)
      await load()
    } catch (e: any) {
      setError(e?.message || 'Submit failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <PackageCheck className="h-5 w-5" />
            Receive delivery
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Confirm quantities from HQ / Loft orders. Report short, damaged, over, or wrong SKU —
            HQ verifies. Exceptions are <strong>reported</strong>, not closed on POS.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Store: <span className="font-medium text-foreground">{store.code}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-sm"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {message && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {!selected && (
        <section className="rounded-lg border bg-card">
          <div className="border-b px-4 py-3 text-sm font-semibold">Expected deliveries</div>
          {loading && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
          {!loading && deliveries.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">
              No open deliveries for this store.
              {mode === 'demo' ? ' (Connect SKUMS in live mode.)' : ''}
            </p>
          )}
          <ul className="divide-y">
            {deliveries.map(d => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => openDelivery(d)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-accent"
                >
                  <div>
                    <p className="font-medium">{d.order_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.status}
                      {d.delivery_mode ? ` · ${d.delivery_mode}` : ''}
                      {' · '}
                      {d.lines.length} line(s)
                    </p>
                  </div>
                  <span className="text-xs text-primary">Receive →</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {selected && (
        <section className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold">{selected.order_number}</h2>
              <p className="text-xs text-muted-foreground">{selected.status}</p>
            </div>
            <button type="button" className="text-sm text-muted-foreground" onClick={() => setSelected(null)}>
              Back
            </button>
          </div>

          {selected.delivery_mode === 'self_collect' && (
            <div className="mt-3">
              <label className="text-xs font-medium text-muted-foreground">Collector name (required)</label>
              <input
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={collectorName}
                onChange={e => setCollectorName(e.target.value)}
                placeholder="Who collected from Loft?"
              />
            </div>
          )}

          <div className="mt-4 space-y-3">
            {edits.map(e => (
              <div key={e.sku} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{e.sku}</p>
                  <p className="text-xs text-muted-foreground">Expected {e.expected_qty}</p>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-4">
                  <label className="text-xs">
                    Received (good)
                    <input
                      type="number"
                      min={0}
                      className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                      value={e.received_qty}
                      onChange={ev => updateEdit(e.sku, { received_qty: Math.max(0, Number(ev.target.value) || 0) })}
                    />
                  </label>
                  <label className="text-xs">
                    Damaged
                    <input
                      type="number"
                      min={0}
                      className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                      value={e.damaged_qty}
                      onChange={ev => updateEdit(e.sku, { damaged_qty: Math.max(0, Number(ev.target.value) || 0) })}
                    />
                  </label>
                  <label className="text-xs sm:col-span-2">
                    Exception
                    <select
                      className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                      value={e.exception_type}
                      onChange={ev => updateEdit(e.sku, { exception_type: ev.target.value as LineEdit['exception_type'] })}
                    >
                      <option value="">None</option>
                      <option value="short">Short / missing</option>
                      <option value="damaged">Damaged</option>
                      <option value="over">Overage</option>
                      <option value="wrong_sku">Wrong SKU</option>
                      <option value="unexpected_item">Unexpected item</option>
                    </select>
                  </label>
                </div>
                {(e.exception_type || e.damaged_qty > 0 || e.received_qty !== e.expected_qty) && (
                  <label className="mt-2 block text-xs">
                    <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                      <AlertTriangle className="h-3 w-3" /> Note (required if exception)
                    </span>
                    <input
                      className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                      value={e.note}
                      onChange={ev => updateEdit(e.sku, { note: ev.target.value })}
                      placeholder="Describe the issue for HQ verification"
                    />
                  </label>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            disabled={submitting}
            onClick={() => void submit()}
            className="mt-4 w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {submitting ? 'Submitting…' : 'Submit receive to HQ'}
          </button>
        </section>
      )}
    </div>
  )
}
