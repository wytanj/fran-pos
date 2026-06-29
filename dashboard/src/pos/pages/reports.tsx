import { useState } from 'react'
import {
  BarChart3,
  FileText,
  Plug,
  DollarSign,
  ShoppingCart,
  Package,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Database,
  Printer,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency, cn } from '@/lib/utils'
import { PageHeader } from '@/pos/components/page-header'
import { STORE, TOP_SELLERS, INTEGRATIONS, PRODUCTS } from '@/pos/data/mock'

type Tab = 'reports' | 'closing' | 'integrations'

const PAYMENT_BREAKDOWN = [
  { mode: 'Visa / Mastercard', amount: 4820.5, count: 38 },
  { mode: 'Cash', amount: 1230.0, count: 22 },
  { mode: 'NETS', amount: 980.4, count: 14 },
  { mode: 'Gift Card', amount: 350.0, count: 5 },
  { mode: 'Store Credit', amount: 145.5, count: 4 },
]

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>('reports')
  const grossSales = PAYMENT_BREAKDOWN.reduce((s, p) => s + p.amount, 0)
  const txns = PAYMENT_BREAKDOWN.reduce((s, p) => s + p.count, 0)
  const maxPay = Math.max(...PAYMENT_BREAKDOWN.map((p) => p.amount))

  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={BarChart3} title="Reports & Closing" subtitle={`${STORE.name} · Business date 21 May 2026`} />

      <div className="border-b bg-card px-4">
        <div className="flex gap-1">
          {(
            [
              { id: 'reports', label: 'Reports', icon: BarChart3 },
              { id: 'closing', label: 'X / Z Closing', icon: FileText },
              { id: 'integrations', label: 'Integrations', icon: Plug },
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
        {tab === 'reports' && (
          <div className="space-y-4">
            {/* KPIs */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi icon={DollarSign} label="Gross sales" value={formatCurrency(grossSales, STORE.currency)} delta="+12.4%" />
              <Kpi icon={ShoppingCart} label="Transactions" value={String(txns)} delta="+6 vs avg" />
              <Kpi icon={Package} label="Units sold" value="129" delta="+8.1%" />
              <Kpi icon={TrendingUp} label="Avg basket" value={formatCurrency(grossSales / txns, STORE.currency)} delta="+4.0%" />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {/* Payment types (FO) */}
              <Panel title="Payment Types (FO)">
                <div className="space-y-3">
                  {PAYMENT_BREAKDOWN.map((p) => (
                    <div key={p.mode}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span>{p.mode} <span className="text-xs text-muted-foreground">· {p.count}</span></span>
                        <span className="font-medium tabular-nums">{formatCurrency(p.amount, STORE.currency)}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-secondary">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${(p.amount / maxPay) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>

              {/* Top sellers */}
              <Panel title="Top Sellers">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="pb-2">Item</th>
                      <th className="pb-2 text-right">Units</th>
                      <th className="pb-2 text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {TOP_SELLERS.map((s) => (
                      <tr key={s.sku} className="border-t">
                        <td className="py-2">
                          {s.name}
                          <span className="block text-xs text-muted-foreground">{s.sku}</span>
                        </td>
                        <td className="py-2 text-right tabular-nums">{s.units}</td>
                        <td className="py-2 text-right tabular-nums">{formatCurrency(s.revenue, STORE.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>

              {/* Inventory movement */}
              <Panel title="Inventory Movement (today)">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <Movement label="Received" value="+10" tone="green" />
                  <Movement label="Sold" value="-129" tone="red" />
                  <Movement label="Transferred out" value="-3" tone="red" />
                  <Movement label="Returned" value="+2" tone="green" />
                  <Movement label="VM write-off" value="-1" tone="red" />
                  <Movement label="Net change" value="-121" />
                </div>
              </Panel>

              {/* Qty on hand */}
              <Panel title="Qty on Hand (summary)">
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-3xl font-bold tabular-nums">
                      {PRODUCTS.reduce((s, p) => s + p.qtyOnHand, 0)}
                    </p>
                    <p className="text-sm text-muted-foreground">total units across {PRODUCTS.length} SKUs</p>
                  </div>
                  <Button variant="outline" size="sm">
                    <Printer className="h-4 w-4" /> Export
                  </Button>
                </div>
                <p className="mt-3 rounded-md bg-secondary p-2 text-xs text-muted-foreground">
                  Reconciled against beginning inventory import — variance 0 units.
                </p>
              </Panel>
            </div>
          </div>
        )}

        {tab === 'closing' && <Closing grossSales={grossSales} txns={txns} />}

        {tab === 'integrations' && <Integrations />}
      </div>
    </div>
  )
}

function Closing({ grossSales, txns }: { grossSales: number; txns: number }) {
  const [report, setReport] = useState<'X' | 'Z' | null>(null)
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="space-y-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="font-semibold">End-of-day closing</p>
          <p className="text-sm text-muted-foreground">
            Run an <strong>X Report</strong> any time for a mid-shift read (no reset), or a <strong>Z Read</strong> to
            close the business day and reset totals.
          </p>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" onClick={() => setReport('X')}>
              <FileText className="h-4 w-4" /> Run X Report
            </Button>
            <Button onClick={() => setReport('Z')}>
              <FileText className="h-4 w-4" /> Run Z Read (close day)
            </Button>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <p className="mb-2 text-sm font-medium">Cash declaration</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Declare label="Opening float" value={formatCurrency(300, STORE.currency)} />
            <Declare label="Cash sales" value={formatCurrency(1230, STORE.currency)} />
            <Declare label="Cash refunds" value={`-${formatCurrency(89, STORE.currency)}`} />
            <Declare label="Expected drawer" value={formatCurrency(1441, STORE.currency)} strong />
          </div>
        </div>
      </div>

      {/* Report preview */}
      <div>
        {report ? (
          <div className="mx-auto w-[320px] bg-white p-5 font-mono text-[11px] leading-relaxed text-zinc-800 shadow">
            <p className="text-center text-sm font-bold">
              {report === 'X' ? 'X REPORT (READ)' : 'Z READ — DAY CLOSE'}
            </p>
            <p className="text-center">{STORE.name}</p>
            <p className="text-center">Register 01 · 21 May 2026</p>
            <Hr />
            <Line l="Gross sales" r={formatCurrency(grossSales, STORE.currency)} />
            <Line l="Transactions" r={String(txns)} />
            <Line l="Refunds" r={`-${formatCurrency(89, STORE.currency)}`} />
            <Line l="Discounts" r={`-${formatCurrency(212.5, STORE.currency)}`} />
            <Line l="GST 9% (incl.)" r={formatCurrency(grossSales * 0.0826, STORE.currency)} />
            <Hr />
            <p className="font-bold">TENDERS</p>
            {PAYMENT_BREAKDOWN.map((p) => (
              <Line key={p.mode} l={p.mode} r={formatCurrency(p.amount, STORE.currency)} />
            ))}
            <Hr />
            <Line l="Cash drawer (expected)" r={formatCurrency(1441, STORE.currency)} />
            {report === 'Z' && (
              <>
                <Hr />
                <p className="text-center font-bold">*** TOTALS RESET ***</p>
                <p className="text-center">Business day closed</p>
              </>
            )}
            <Hr />
            <Button size="sm" className="mt-2 w-full" onClick={() => setReport(null)}>
              <Printer className="h-4 w-4" /> Print &amp; close
            </Button>
          </div>
        ) : (
          <div className="flex h-full min-h-48 flex-col items-center justify-center rounded-xl border border-dashed text-center text-muted-foreground">
            <FileText className="h-8 w-8 opacity-30" />
            <p className="mt-2 text-sm">Run a report to preview the printout.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function Integrations() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card">
        <div className="border-b p-4">
          <p className="font-semibold">Future integrations</p>
          <p className="text-sm text-muted-foreground">Printer · scanner · cash drawer · payment terminal</p>
        </div>
        <div className="divide-y">
          {INTEGRATIONS.map((it, i) => (
            <div key={i} className="flex items-center justify-between p-3 text-sm">
              <div className="flex items-center gap-3">
                {it.status === 'Ready' ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                )}
                <span className="flex items-center gap-1.5 font-medium">
                  {it.from} <ArrowRight className="h-3 w-3 text-muted-foreground" /> {it.to}
                </span>
                <span className="text-muted-foreground">· {it.flow}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">{it.lastSync}</span>
                <Badge variant={it.status === 'Ready' ? 'success' : 'warning'}>{it.status}</Badge>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          <p className="font-semibold">Data migration</p>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <MigrationRow label="Item master" status="Imported" detail="1,284 SKUs · last run 06:02" />
          <MigrationRow label="Price list" status="Imported" detail="1,284 prices · last run 06:02" />
          <MigrationRow label="Beginning inventory" status="Reconciled" detail="Variance 0 units" />
          <MigrationRow label="Customer list" status="Imported" detail="demo file · 9,640 members" />
        </div>
      </div>
    </div>
  )
}

function Kpi({ icon: Icon, label, value, delta }: { icon: typeof DollarSign; label: string; value: string; delta: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-4 w-4" /> {label}
      </div>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-green-600">{delta}</p>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="mb-3 font-semibold">{title}</p>
      {children}
    </div>
  )
}

function Movement({ label, value, tone }: { label: string; value: string; tone?: 'green' | 'red' }) {
  return (
    <div className="rounded-lg bg-secondary p-3">
      <p className={cn('text-xl font-bold tabular-nums', tone === 'green' && 'text-green-600', tone === 'red' && 'text-destructive')}>
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

function Declare({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn('rounded-lg border p-3', strong && 'bg-secondary')}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('tabular-nums', strong ? 'text-lg font-bold' : 'font-medium')}>{value}</p>
    </div>
  )
}

function MigrationRow({ label, status, detail }: { label: string; status: string; detail: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
      <Badge variant="success">{status}</Badge>
    </div>
  )
}

function Hr() {
  return <div className="my-1.5 border-t border-dashed border-zinc-400" />
}
function Line({ l, r }: { l: string; r: string }) {
  return (
    <div className="flex justify-between">
      <span>{l}</span>
      <span>{r}</span>
    </div>
  )
}
