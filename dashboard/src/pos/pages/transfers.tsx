import { useState } from 'react'
import {
  Truck,
  PackageCheck,
  PackagePlus,
  ClipboardList,
  Plus,
  Trash2,
  CheckCircle2,
  ArrowRight,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/pos/components/page-header'
import { TRANSFERS, PRODUCTS, STORE, type Transfer } from '@/pos/data/mock'
import { useSkumsConnector } from '@/hooks/use-skums-connector'
import { useAuth } from '@/providers/auth-provider'
import { createSkumsPosInventoryEvent } from '@/pos/lib/skums-client'
import { usePos } from '@/pos/lib/pos-context'
import type { SkumsPosInventoryEventInput, SkumsPosInventoryEventResponse } from '@pos/shared'

type Tab = 'receive' | 'out' | 'records'

const STATUS_VARIANT: Record<Transfer['status'], 'default' | 'secondary' | 'success' | 'warning' | 'outline'> = {
  'In Transit': 'warning',
  'Pending Receipt': 'warning',
  Received: 'success',
  Draft: 'secondary',
  Sent: 'default',
}

const TRANSFER_DESTINATIONS = [
  { code: 'WH01', name: 'Central Fulfilment' },
  { code: 'FRAN02', name: 'Fran Beauty Vivocity' },
  { code: 'SG03', name: 'Jewel Changi' },
] as const

function destinationLabel(code: string) {
  const destination = TRANSFER_DESTINATIONS.find((item) => item.code === code)
  return destination ? `${destination.name} (${destination.code})` : code
}

export default function TransfersPage() {
  const { mode } = usePos()
  const { company } = useAuth()
  const { connector: skumsConnector } = useSkumsConnector()
  const [tab, setTab] = useState<Tab>('receive')
  const [transfers, setTransfers] = useState<Transfer[]>(TRANSFERS)
  const [selected, setSelected] = useState<Transfer | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [receivingRef, setReceivingRef] = useState<string | null>(null)
  const [transferSyncStatus, setTransferSyncStatus] = useState<Record<string, 'queued' | 'sent' | 'synced' | 'pending_approval' | 'failed'>>({})

  // Only the current store's inbound transfers are visible (checklist item 17).
  const inbound = transfers.filter((t) => t.type === 'inbound' && t.toStoreCode === STORE.code)

  const createQueuedLocalTransferEvent = async (payload: SkumsPosInventoryEventInput) => {
    if (!company) return
    const { data, error: insertError } = await supabase
      .from('pos_inventory_events')
      .insert({
        company_id: company.id,
        event_type: payload.event_type,
        status: 'queued',
        idempotency_key: payload.idempotency_key ?? null,
        product_id: null,
        sku: null,
        quantity: payload.items?.reduce((sum, item) => sum + Number(item.quantity ?? item.qty ?? 0), 0) ?? null,
        store_code: STORE.code,
        storage_location_code: null,
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

    if (payload.reference) setTransferSyncStatus((prev) => ({ ...prev, [payload.reference!]: 'queued' }))
    return (data as { id: string } | null)?.id ?? null
  }

  const updateLocalTransferEvent = async (
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
        skums_status: response?.data?.status ?? null,
        response: response ?? {},
        error_message: err?.message ?? response?.data?.error_message ?? null,
        synced_at: response ? new Date().toISOString() : null,
      })
      .eq('id', eventId)
      .eq('company_id', company.id)

    if (updateError) {
      console.warn('Failed to update POS transfer inventory event', updateError)
    }

    if (payload.reference) setTransferSyncStatus((prev) => ({ ...prev, [payload.reference!]: status }))
  }

  const receive = async (t: Transfer) => {
    setError(null)
    setReceivingRef(t.ref)
    const units = t.lines.reduce((s, l) => s + l.qty, 0)
    const payload: SkumsPosInventoryEventInput = {
      event_type: 'inventory.transfer_receive.reported',
      source: 'vantage_pos',
      idempotency_key: `${STORE.code}-${t.ref}-receive`,
      pos_location_code: STORE.code,
      inventory_location_id: STORE.inventoryLocationId,
      store: {
        code: STORE.code,
        name: STORE.name,
        inventory_location_id: STORE.inventoryLocationId,
      },
      transfer_number: t.ref,
      reference: t.ref,
      reason_code: 'store_transfer_receipt',
      items: t.lines.map((line) => ({
        sku: line.sku,
        quantity: line.qty,
        product: {
          sku: line.sku,
          name: line.name,
        },
      })),
      occurred_at: new Date().toISOString(),
      metadata: {
        from: t.from,
        from_store_code: t.fromStoreCode,
        to: t.to,
        to_store_code: t.toStoreCode,
      },
    }

    let localEventId: string | null | undefined = null
    try {
      let response: SkumsPosInventoryEventResponse | null = null
      localEventId = mode === 'live' ? await createQueuedLocalTransferEvent(payload) : null
      if (mode === 'live' && skumsConnector) {
        await updateLocalTransferEvent(localEventId, payload, 'sent', null, null)
        response = await createSkumsPosInventoryEvent(payload, skumsConnector)
        await updateLocalTransferEvent(
          localEventId,
          payload,
          response.data.status === 'applied' ? 'synced' : 'pending_approval',
          response,
          null
        )
      }

      setTransfers((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: 'Received' } : x)))
      setSelected(null)
      flash(
        mode === 'live'
          ? `${t.ref} receipt sent to SKUMS - ${units} units for ${STORE.code}`
          : `${t.ref} received - ${units} units added to ${STORE.code} on-hand`
      )
    } catch (err) {
      const eventError = err instanceof Error ? err : new Error('Failed to receive transfer.')
      await updateLocalTransferEvent(localEventId, payload, 'failed', null, eventError)
      setError(eventError.message)
    } finally {
      setReceivingRef(null)
    }
  }

  const flash = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={Truck} title="Stock Transfers" subtitle={`Receive, send and track transfers for ${STORE.name}`} />

      <div className="border-b bg-card px-4">
        <div className="flex gap-1">
          {(
            [
              { id: 'receive', label: 'Receive', icon: PackageCheck },
              { id: 'out', label: 'Transfer Out', icon: PackagePlus },
              { id: 'records', label: 'Records', icon: ClipboardList },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer',
                tab === t.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === 'receive' && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <p className="text-sm font-medium">Incoming transfers ({inbound.filter((t) => t.status !== 'Received').length} pending)</p>
              {inbound.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelected(t)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary cursor-pointer',
                    selected?.id === t.id && 'border-primary ring-1 ring-primary'
                  )}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{t.ref}</span>
                      <Badge variant={STATUS_VARIANT[t.status]}>{t.status}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      From {t.from} · {t.created} · {t.lines.length} SKU(s)
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </div>

            <div>
              {selected ? (
                <div className="rounded-xl border bg-card p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{selected.ref}</p>
                      <p className="text-xs text-muted-foreground">Validate transfer notice against received goods</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {transferSyncStatus[selected.ref] && (
                        <Badge variant="outline">SKUMS {transferSyncStatus[selected.ref]}</Badge>
                      )}
                      <Badge variant={STATUS_VARIANT[selected.status]}>{selected.status}</Badge>
                    </div>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="pb-2">SKU</th>
                        <th className="pb-2">Item</th>
                        <th className="pb-2 text-right">Expected</th>
                        <th className="pb-2 text-right">Received</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.lines.map((l) => (
                        <tr key={l.sku} className="border-b last:border-0">
                          <td className="py-2 font-mono text-xs">{l.sku}</td>
                          <td className="py-2">{l.name}</td>
                          <td className="py-2 text-right">{l.qty}</td>
                          <td className="py-2 text-right">
                            <Input defaultValue={l.qty} className="ml-auto h-8 w-16 text-right" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {selected.status === 'Received' ? (
                    <p className="mt-4 flex items-center gap-2 text-sm text-green-600">
                      <CheckCircle2 className="h-4 w-4" /> Already received
                    </p>
                  ) : (
                    <Button className="mt-4 w-full" onClick={() => { void receive(selected) }} disabled={receivingRef === selected.ref}>
                      {receivingRef === selected.ref ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
                      Confirm receipt &amp; update on-hand
                    </Button>
                  )}
                  {error && <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
                </div>
              ) : (
                <div className="flex h-full min-h-48 flex-col items-center justify-center rounded-xl border border-dashed text-center text-muted-foreground">
                  <PackageCheck className="h-8 w-8 opacity-30" />
                  <p className="mt-2 text-sm">Select an incoming transfer to validate &amp; receive.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'out' && <TransferOut onCreate={(ref) => flash(`${ref} created · stock transfer drafted`)} />}

        {tab === 'records' && (
          <div className="rounded-xl border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="p-3">Reference</th>
                  <th className="p-3">Direction</th>
                  <th className="p-3">From → To</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((t) => (
                  <tr key={t.id} className="border-b last:border-0">
                    <td className="p-3 font-medium">{t.ref}</td>
                    <td className="p-3">
                      <Badge variant={t.type === 'inbound' ? 'secondary' : 'outline'}>
                        {t.type === 'inbound' ? 'Received' : 'Sent'}
                      </Badge>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {t.from} → {t.to}
                    </td>
                    <td className="p-3 text-muted-foreground">{t.created}</td>
                    <td className="p-3">
                      <Badge variant={STATUS_VARIANT[t.status]}>{t.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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

function TransferOut({ onCreate }: { onCreate: (ref: string) => void }) {
  const [destCode, setDestCode] = useState('WH01')
  const [lines, setLines] = useState<{ sku: string; name: string; qty: number }[]>([])
  const [pick, setPick] = useState('')

  const add = (sku: string) => {
    const p = PRODUCTS.find((x) => x.sku === sku)!
    if (lines.some((l) => l.sku === sku)) return
    setLines((prev) => [...prev, { sku: p.sku, name: p.name, qty: 1 }])
    setPick('')
  }

  const results = PRODUCTS.filter(
    (p) =>
      pick &&
      (p.name.toLowerCase().includes(pick.toLowerCase()) ||
        p.sku.toLowerCase().includes(pick.toLowerCase()) ||
        (p.storeLocationCode?.toLowerCase().includes(pick.toLowerCase()) ?? false))
  ).slice(0, 5)

  const submit = () => {
    const ref = `ITR-OUT-${Math.floor(30000 + Math.random() * 9999)}`
    onCreate(`${ref} to ${destCode}`)
    setLines([])
  }

  return (
    <div className="mx-auto max-w-2xl rounded-xl border bg-card p-4">
      <p className="font-semibold">Create transfer request</p>
      <p className="text-xs text-muted-foreground">Sender is locked to {STORE.name} ({STORE.code}). A transfer document is created on submit.</p>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <label className="text-xs font-medium text-muted-foreground">From (sender)</label>
          <div className="mt-1 flex h-9 items-center rounded-md border bg-muted/40 px-3 text-muted-foreground">
            {STORE.name} ({STORE.code})
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">To (destination)</label>
          <select
            className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3"
            value={destCode}
            onChange={(e) => setDestCode(e.target.value)}
          >
            {TRANSFER_DESTINATIONS.map((destination) => (
              <option key={destination.code} value={destination.code}>
                {destinationLabel(destination.code)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4">
        <label className="text-xs font-medium text-muted-foreground">Add items</label>
        <Input className="mt-1" placeholder="Search product / SKU…" value={pick} onChange={(e) => setPick(e.target.value)} />
        {results.length > 0 && (
          <div className="mt-1 space-y-1">
            {results.map((p) => (
              <button
                key={p.id}
                onClick={() => add(p.sku)}
                className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-accent cursor-pointer"
              >
                <span>{p.emoji} {p.name} · <span className="text-xs text-muted-foreground">{p.sku}</span></span>
                <Plus className="h-4 w-4" />
              </button>
            ))}
          </div>
        )}
      </div>

      {lines.length > 0 && (
        <div className="mt-4 divide-y rounded-lg border">
          {lines.map((l, i) => (
            <div key={l.sku} className="flex items-center justify-between p-2.5 text-sm">
              <span>{l.name} <span className="text-xs text-muted-foreground">· {l.sku}</span></span>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  className="h-8 w-16 text-right"
                  value={l.qty}
                  onChange={(e) =>
                    setLines((prev) => prev.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) } : x)))
                  }
                />
                <button onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))} className="text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Button className="mt-4 w-full" disabled={lines.length === 0} onClick={submit}>
        Submit transfer · create stock transfer
      </Button>
    </div>
  )
}
