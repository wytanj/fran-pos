import { useState } from 'react'
import {
  Search,
  RefreshCcw,
  Plus,
  Minus,
  Trash2,
  Banknote,
  Wallet,
  CreditCard,
  Shuffle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ShieldCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { formatCurrency, cn } from '@/lib/utils'
import {
  PAST_TRANSACTIONS,
  PRODUCTS,
  RETURN_REASONS,
  STORE,
  type PastTransaction,
} from '@/pos/data/mock'
import { ReceiptPreview } from '@/pos/components/receipt-preview'
import { ManagerAuthModal } from '@/pos/components/manager-auth-modal'
import type { CartLine, CompletedSale } from '@/pos/lib/pos-context'
import { buildSkumsSaleIdempotencyKey, POS_REGISTER_CODE } from '@/pos/lib/skums-sale-adapter'
import {
  buildPosOutboxEventsForCompletedSale,
  persistPosOutboxEvents,
} from '@/pos/lib/pos-outbox'
import {
  checkReturnEligibility,
  decisionAllowsReturn,
  returnDecisionLabel,
} from '@/pos/lib/return-eligibility'
import { useAuth } from '@/providers/auth-provider'
import type {
  PosReturnAllowedAction,
  PosReturnEligibilityDecision,
  PosReturnEligibilityResponse,
  PosReturnLineMatchType,
  PosReturnRequestedAction,
} from '@pos/shared'

interface WorkLine extends CartLine {
  reason?: string
  sourceReceiptNo?: string
  originalQty?: number
  originalLineRef?: string | null
  skumsOriginalLineId?: string | null
  crmosDecisionId?: string | null
  crmosAuthorizationId?: string | null
  crmosDecision?: PosReturnEligibilityDecision | null
  crmosOrderLineId?: string | null
  crmosAllowedActions?: PosReturnAllowedAction[]
  crmosManagerRequired?: boolean
  eligibilityReasonCodes?: string[]
  sourceSystem?: string | null
  sourceOrderRef?: string | null
  matchType?: PosReturnLineMatchType
  disposition?: string | null
  authorizedReturnQty?: number
  managerOverrideBy?: string | null
  managerOverrideReason?: string | null
}

let seq = 0
const lid = () => `r-${++seq}`

export default function ReturnsPage() {
  const { company } = useAuth()
  const [tab, setTab] = useState<'receipt' | 'noreceipt'>('receipt')
  const [query, setQuery] = useState('')
  const [txn, setTxn] = useState<PastTransaction | null>(null)
  const [lines, setLines] = useState<WorkLine[]>([])
  const [refundMethod, setRefundMethod] = useState('cash')
  const [done, setDone] = useState<CompletedSale | null>(null)
  const [exchangeSearch, setExchangeSearch] = useState('')
  const [checkProductQuery, setCheckProductQuery] = useState('')
  const [checkProductSku, setCheckProductSku] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [orderDateHint, setOrderDateHint] = useState('')
  const [receiptOrOrderHint, setReceiptOrOrderHint] = useState('')
  const [requestedQty, setRequestedQty] = useState(1)
  const [requestedAction, setRequestedAction] = useState<PosReturnRequestedAction>('either')
  const [eligibility, setEligibility] = useState<
    (PosReturnEligibilityResponse & { localReturnCheckId: string; storage: 'supabase' | 'local' }) | null
  >(null)
  const [eligibilityError, setEligibilityError] = useState('')
  const [checkingEligibility, setCheckingEligibility] = useState(false)
  const [adminOverrideOpen, setAdminOverrideOpen] = useState(false)
  const [adminOverrideReason, setAdminOverrideReason] = useState('crmOS manager review')
  const [adminOverrideApprover, setAdminOverrideApprover] = useState<string | null>(null)

  const matches = PAST_TRANSACTIONS.filter(
    (t) => t.type !== 'Refund' && t.receiptNo.toLowerCase().includes(query.toLowerCase())
  )
  const selectedCheckProduct = PRODUCTS.find((product) => product.sku === checkProductSku) ?? null
  const checkProductResults = PRODUCTS.filter(
    (product) =>
      checkProductQuery.trim() !== '' &&
      (product.name.toLowerCase().includes(checkProductQuery.toLowerCase()) ||
        product.sku.toLowerCase().includes(checkProductQuery.toLowerCase()))
  ).slice(0, 6)

  const loadTxn = (t: PastTransaction) => {
    setTxn(t)
    setLines([])
  }

  const addReturnFromReceipt = (item: PastTransaction['items'][number]) => {
    if (!txn) return
    const prod = PRODUCTS.find((p) => p.sku === item.sku)
    setLines((prev) => {
      const existing = prev.find((line) => line.qty < 0 && line.sourceReceiptNo === txn.receiptNo && line.sku === item.sku)
      if (existing) {
        return prev.map((line) => {
          if (line.lineId !== existing.lineId) return line
          const maxReturnQty = line.originalQty ?? item.qty
          return { ...line, qty: Math.max(-maxReturnQty, line.qty - 1) }
        })
      }
      return [
        ...prev,
        {
          lineId: lid(),
          sku: item.sku,
          name: item.name,
          unitPrice: item.price,
          listPrice: item.price,
          qty: -1,
          returnable: prod?.returnable ?? txn.returnable,
          storeLocationCode: prod?.storeLocationCode,
          isMarkdown: prod?.mdPrice != null,
          lineDiscount: 0,
          reason: RETURN_REASONS[0],
          sourceReceiptNo: txn.receiptNo,
          originalQty: item.qty,
          originalLineRef: `${txn.receiptNo}:${item.sku}`,
          skumsOriginalLineId: null,
          ...prod?.skums,
        },
      ]
    })
  }

  const addExchange = (sku: string) => {
    const p = PRODUCTS.find((x) => x.sku === sku)
    if (!p) return
    setLines((prev) => [
      ...prev,
      {
        lineId: lid(),
        sku: p.sku,
        name: p.name,
        unitPrice: p.mdPrice ?? p.price,
        listPrice: p.price,
        qty: 1,
        returnable: p.returnable,
        storeLocationCode: p.storeLocationCode,
        isMarkdown: p.mdPrice != null,
        lineDiscount: 0,
        ...p.skums,
      },
    ])
  }

  const setReason = (id: string, reason: string) =>
    setLines((prev) => prev.map((l) => (l.lineId === id ? { ...l, reason } : l)))
  const bump = (id: string, delta: number) =>
    setLines((prev) =>
      prev
        .map((l) => {
          if (l.lineId !== id) return l
          const nextQty = l.qty + delta
          if (l.qty < 0) {
            const maxReturnQty = l.authorizedReturnQty ?? l.originalQty ?? 99
            return { ...l, qty: Math.max(-maxReturnQty, Math.min(-1, nextQty)) }
          }
          return { ...l, qty: Math.max(1, nextQty) }
        })
        .filter((l) => l.qty !== 0)
    )
  const remove = (id: string) => setLines((prev) => prev.filter((l) => l.lineId !== id))

  const returnLines = lines.filter((l) => l.qty < 0)
  const exchangeLines = lines.filter((l) => l.qty > 0)
  const net = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0)
  const refundDue = net < 0 ? -net : 0
  const collectDue = net > 0 ? net : 0
  const isExchange = returnLines.length > 0 && exchangeLines.length > 0
  const blocked = returnLines.some((l) => !l.returnable)
  const managerRequired = blocked || returnLines.some((l) => l.crmosManagerRequired)
  const eligibilityNeedsOverride = Boolean(eligibility?.managerRequired)
  const canAddEligibilityReturn = Boolean(
    eligibility &&
      decisionAllowsReturn(eligibility.decision) &&
      (!eligibility.managerRequired || adminOverrideApprover)
  )
  const canComplete = lines.length > 0 && (!managerRequired || adminOverrideApprover)

  const reset = () => {
    setTxn(null)
    setLines([])
    setQuery('')
    setRefundMethod('cash')
    setExchangeSearch('')
    setEligibility(null)
    setEligibilityError('')
    setAdminOverrideOpen(false)
    setAdminOverrideReason('crmOS manager review')
    setAdminOverrideApprover(null)
  }

  const runReturnCheck = async () => {
    if (!selectedCheckProduct) {
      setEligibilityError('Select a product before checking return eligibility.')
      return
    }
    if (!customerEmail.trim()) {
      setEligibilityError('Enter the customer email used for the purchase.')
      return
    }

    setCheckingEligibility(true)
    setEligibilityError('')
    setAdminOverrideApprover(null)
    try {
      const result = await checkReturnEligibility({
        companyId: company?.id,
        staffId: null,
        customerEmail,
        product: selectedCheckProduct,
        orderDateHint: orderDateHint || null,
        receiptOrOrderHint: receiptOrOrderHint || null,
        quantity: requestedQty,
        requestedAction,
      })
      setEligibility(result)
      if (result.decision === 'store_credit_only') setRefundMethod('store-credit')
    } catch (err) {
      setEligibilityError(err instanceof Error ? err.message : 'Failed to check return eligibility.')
    } finally {
      setCheckingEligibility(false)
    }
  }

  const addReturnFromEligibility = () => {
    if (!eligibility || !selectedCheckProduct || !canAddEligibilityReturn) return
    const matched = eligibility.matchedPurchase
    const approvedQty = eligibility.managerRequired
      ? Math.max(1, requestedQty)
      : Math.max(1, Math.min(requestedQty, matched?.quantityReturnable ?? requestedQty))
    setLines((prev) => [
      ...prev,
      {
        lineId: lid(),
        sku: selectedCheckProduct.sku,
        name: matched?.productName ?? selectedCheckProduct.name,
        unitPrice: matched?.unitPrice ?? selectedCheckProduct.mdPrice ?? selectedCheckProduct.price,
        listPrice: selectedCheckProduct.price,
        qty: -approvedQty,
        returnable: eligibility.decision !== 'ineligible',
        storeLocationCode: selectedCheckProduct.storeLocationCode,
        isMarkdown: selectedCheckProduct.mdPrice != null,
        lineDiscount: 0,
        reason: RETURN_REASONS[0],
        sourceReceiptNo: (matched?.orderRef ?? receiptOrOrderHint) || undefined,
        originalQty: matched?.quantityPurchased ?? approvedQty,
        originalLineRef: matched?.orderLineRef ?? null,
        skumsOriginalLineId: null,
        crmosDecisionId: eligibility.decisionId,
        crmosAuthorizationId: eligibility.authorizationId,
        crmosDecision: eligibility.decision,
        crmosOrderLineId: matched?.orderLineRef ?? null,
        crmosAllowedActions: eligibility.allowedActions,
        crmosManagerRequired: eligibility.managerRequired,
        eligibilityReasonCodes: eligibility.reasonCodes,
        sourceSystem: matched?.sourceSystem ?? null,
        sourceOrderRef: matched?.orderRef ?? null,
        matchType: matched ? 'exact_order_line' : eligibility.managerRequired ? 'manager_override' : 'no_matched_sale',
        disposition: 'resell',
        authorizedReturnQty: approvedQty,
        managerOverrideBy: eligibility.managerRequired ? adminOverrideApprover : null,
        managerOverrideReason: eligibility.managerRequired ? adminOverrideReason : null,
        overridden: eligibility.managerRequired,
        overrideReason: eligibility.managerRequired ? adminOverrideReason : undefined,
        ...selectedCheckProduct.skums,
      },
    ])
    if (!eligibility.allowedActions.includes('refund')) setRefundMethod('store-credit')
  }

  const applyAdminOverride = (managerName: string) => {
    setAdminOverrideApprover(managerName)
    setAdminOverrideOpen(false)
    setLines((prev) =>
      prev.map((line) => {
        if (line.qty >= 0 || (!line.crmosManagerRequired && line.returnable)) return line
        return {
          ...line,
          matchType: line.crmosManagerRequired ? 'manager_override' : line.matchType,
          managerOverrideBy: managerName,
          managerOverrideReason: adminOverrideReason,
          overridden: true,
          overrideReason: adminOverrideReason,
        }
      })
    )
  }

  const updateAdminOverrideReason = (reason: string) => {
    setAdminOverrideReason(reason)
    setLines((prev) =>
      prev.map((line) =>
        line.managerOverrideBy
          ? {
              ...line,
              managerOverrideReason: reason,
              overrideReason: reason,
            }
          : line
      )
    )
  }

  const complete = () => {
    const receiptNo = `${STORE.code}-R${String(900 + seq).padStart(5, '0')}`
    const completedAt = new Date()
    const completedAtIso = completedAt.toISOString()
    const idempotencyKey = buildSkumsSaleIdempotencyKey({ receiptNo, completedAtIso })
    const sale: CompletedSale = {
      receiptNo,
      saleStatus: 'completed',
      lines,
      cartPriceOverride: null,
      customer: null,
      salesType: 'normal',
      payments:
        refundDue > 0
          ? [{ id: 'r1', mode: refundMethod, label: refundLabel(refundMethod), amount: -refundDue }]
          : collectDue > 0
            ? [{ id: 'c1', mode: 'card', label: 'Card', amount: collectDue, detail: '****1234' }]
            : [{ id: 'e1', mode: 'misc', label: 'Even Exchange', amount: 0 }],
      subtotal: net,
      discountTotal: 0,
      tax: net - net / 1.09,
      total: net,
      pointsEarned: 0,
      cashier: 'Aisyah Rahman',
      timestamp: completedAt.toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' }),
      completedAtIso,
      voidedAtIso: null,
      voidReason: null,
      storeCode: STORE.code,
      registerCode: POS_REGISTER_CODE,
      idempotencyKey,
      skumsSync: {
        status: 'not_required',
        idempotencyKey,
        updatedAt: completedAtIso,
      },
      isExchange: true,
      fran: null,
    }
    const outboxEvents = buildPosOutboxEventsForCompletedSale(sale, {
      workspaceId: company?.id ?? 'demo',
      actorId: null,
    })
    void persistPosOutboxEvents(company?.id, outboxEvents)
    setDone(sale)
    reset()
  }

  const exchangeResults = PRODUCTS.filter(
    (p) =>
      p.qtyOnHand > 0 &&
      (exchangeSearch === '' ||
        p.name.toLowerCase().includes(exchangeSearch.toLowerCase()) ||
        p.sku.toLowerCase().includes(exchangeSearch.toLowerCase()))
  ).slice(0, 6)

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={RefreshCcw}
        title="Returns & Exchanges"
        subtitle="Process refunds, in-store exchanges and returns — with or without the original receipt."
      />

      <div className="border-b bg-background p-4">
        <div className="rounded-xl border bg-card p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-medium">Check return</p>
              <p className="text-xs text-muted-foreground">
                Floor staff only need product, email, and optional order date. POS asks crmOS for the allowed action.
              </p>
            </div>
            {eligibility && (
              <Badge variant={decisionBadgeVariant(eligibility.decision)}>
                crmOS: {returnDecisionLabel(eligibility.decision)}
              </Badge>
            )}
          </div>

          <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_150px_170px_120px_150px]">
            <div>
              <LabelText>Product</LabelText>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Scan or search SKU"
                  className="pl-9"
                  value={checkProductQuery}
                  onChange={(e) => {
                    setCheckProductQuery(e.target.value)
                    setCheckProductSku('')
                    setEligibility(null)
                  }}
                />
              </div>
              {selectedCheckProduct && (
                <p className="mt-1 text-xs text-primary">
                  Selected {selectedCheckProduct.name} - {selectedCheckProduct.sku}
                </p>
              )}
              {checkProductResults.length > 0 && !selectedCheckProduct && (
                <div className="mt-2 space-y-1">
                  {checkProductResults.map((product) => (
                    <button
                      key={product.id}
                      onClick={() => {
                        setCheckProductSku(product.sku)
                        setCheckProductQuery(`${product.sku} - ${product.name}`)
                        setEligibility(null)
                      }}
                      className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-accent cursor-pointer"
                    >
                      <span>
                        {product.name} <span className="text-xs text-muted-foreground">{product.sku}</span>
                      </span>
                      <span className="font-medium">{formatCurrency(product.mdPrice ?? product.price, STORE.currency)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <LabelText>Customer email</LabelText>
              <Input
                type="email"
                placeholder="customer@example.com"
                value={customerEmail}
                onChange={(e) => {
                  setCustomerEmail(e.target.value)
                  setEligibility(null)
                }}
              />
            </div>

            <div>
              <LabelText>Order date</LabelText>
              <Input type="date" value={orderDateHint} onChange={(e) => setOrderDateHint(e.target.value)} />
            </div>

            <div>
              <LabelText>Receipt/order</LabelText>
              <Input
                placeholder="Optional"
                value={receiptOrOrderHint}
                onChange={(e) => setReceiptOrOrderHint(e.target.value)}
              />
            </div>

            <div>
              <LabelText>Qty</LabelText>
              <Input
                type="number"
                min={1}
                value={requestedQty}
                onChange={(e) => setRequestedQty(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>

            <div>
              <LabelText>Action</LabelText>
              <select
                className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={requestedAction}
                onChange={(e) => setRequestedAction(e.target.value as PosReturnRequestedAction)}
              >
                <option value="either">Either</option>
                <option value="refund">Refund</option>
                <option value="exchange">Exchange</option>
                <option value="store_credit">Store credit</option>
              </select>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="min-h-5 text-xs">
              {eligibilityError && <span className="text-destructive">{eligibilityError}</span>}
              {eligibility && (
                <span className="text-muted-foreground">
                  {eligibility.message} Decision stored in {eligibility.storage === 'supabase' ? 'POS database' : 'local queue'}.
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={runReturnCheck} disabled={checkingEligibility}>
                {checkingEligibility ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {checkingEligibility ? 'Checking...' : 'Check return'}
              </Button>
              <Button
                onClick={addReturnFromEligibility}
                disabled={!canAddEligibilityReturn}
              >
                {eligibilityNeedsOverride ? 'Add override return' : 'Add approved return'}
              </Button>
            </div>
          </div>

          {eligibility && (
            <div className="mt-3 grid gap-3 rounded-lg border bg-secondary/40 p-3 text-sm md:grid-cols-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Allowed actions</p>
                <p>{eligibility.allowedActions.length > 0 ? eligibility.allowedActions.join(', ') : 'None'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Matched purchase</p>
                <p>
                  {eligibility.matchedPurchase
                    ? `${eligibility.matchedPurchase.orderRef} on ${eligibility.matchedPurchase.orderDate}`
                    : 'No exact sale found'}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Reason codes</p>
                <p>{eligibility.reasonCodes.join(', ')}</p>
              </div>
            </div>
          )}

          {eligibilityNeedsOverride && (
            <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium text-amber-900">
                    <ShieldCheck className="h-4 w-4" /> Admin override required
                  </p>
                  <p className="mt-1 text-xs text-amber-800">
                    crmOS returned manager review. Authorise before adding this return to the working lines.
                  </p>
                </div>
                {adminOverrideApprover && (
                  <Badge variant="warning">Approved by {adminOverrideApprover}</Badge>
                )}
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
                <select
                  className="h-10 rounded-md border border-amber-300 bg-white px-3 text-sm"
                  value={adminOverrideReason}
                  onChange={(e) => updateAdminOverrideReason(e.target.value)}
                >
                  <option value="crmOS manager review">crmOS manager review</option>
                  <option value="Goodwill return">Goodwill return</option>
                  <option value="Store policy exception">Store policy exception</option>
                  <option value="Quantity exception">Quantity exception</option>
                  <option value="Non-returnable item exception">Non-returnable item exception</option>
                </select>
                <Button variant="outline" onClick={() => setAdminOverrideOpen(true)}>
                  <ShieldCheck className="h-4 w-4" />
                  {adminOverrideApprover ? 'Re-authorise' : 'Authorise override'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[1fr_400px]">
        {/* Left: source + items */}
        <div className="space-y-4">
          {/* Tabs */}
          <div className="inline-flex rounded-lg border bg-card p-1">
            {(
              [
                { id: 'receipt', label: 'With receipt ref' },
                { id: 'noreceipt', label: 'Without receipt' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setTab(t.id)
                  reset()
                }}
                className={cn(
                  'rounded-md px-4 py-1.5 text-sm font-medium transition-colors cursor-pointer',
                  tab === t.id ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'receipt' && !txn && (
            <div className="rounded-xl border bg-card p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={`Search receipt no. (e.g. ${STORE.code}-000482)`}
                  className="pl-9"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Tip: Sabre / legacy receipts can be looked up by their reference too.
              </p>
              <div className="mt-3 space-y-2">
                {matches.map((t) => (
                  <button
                    key={t.receiptNo}
                    onClick={() => loadTxn(t)}
                    className="flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors hover:bg-accent cursor-pointer"
                  >
                    <div>
                      <p className="font-medium">{t.receiptNo}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.date} · {t.cashier} · {t.items.length} item(s)
                      </p>
                    </div>
                    <span className="font-semibold tabular-nums">{formatCurrency(t.total, STORE.currency)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {tab === 'noreceipt' && lines.length === 0 && (
            <div className="rounded-xl border bg-card p-4">
              <p className="mb-2 text-sm font-medium">Add returned items manually</p>
              <p className="mb-3 text-xs text-muted-foreground">
                No receipt reference — refunds default to store credit per policy.
              </p>
              <ExchangePicker
                value={exchangeSearch}
                onChange={setExchangeSearch}
                results={exchangeResults}
                label="returned"
                onPick={(sku) => {
                  const p = PRODUCTS.find((x) => x.sku === sku)!
                  setLines((prev) => [
                    ...prev,
                    {
                      lineId: lid(),
                      sku: p.sku,
                      name: p.name,
                      unitPrice: p.mdPrice ?? p.price,
                      listPrice: p.price,
                      qty: -1,
                      returnable: p.returnable,
                      storeLocationCode: p.storeLocationCode,
                      isMarkdown: p.mdPrice != null,
                      lineDiscount: 0,
                      reason: RETURN_REASONS[0],
                      ...p.skums,
                    },
                  ])
                  setRefundMethod('store-credit')
                }}
              />
            </div>
          )}

          {txn && (
            <div className="rounded-xl border bg-card">
              <div className="flex items-center justify-between border-b p-3">
                <div>
                  <p className="text-sm font-medium">Original receipt lines</p>
                  <p className="text-xs text-muted-foreground">Choose only the wrong item and quantity being returned.</p>
                </div>
                <Badge variant="secondary">{txn.receiptNo}</Badge>
              </div>
              <div className="divide-y">
                {txn.items.map((item) => {
                  const selectedQty = Math.abs(lines.find((line) => line.qty < 0 && line.sourceReceiptNo === txn.receiptNo && line.sku === item.sku)?.qty ?? 0)
                  const remainingQty = Math.max(0, item.qty - selectedQty)
                  return (
                    <div key={item.sku} className="flex items-center justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.sku} - sold qty {item.qty} - {formatCurrency(item.price, STORE.currency)}
                        </p>
                        {selectedQty > 0 && (
                          <p className="mt-0.5 text-xs text-primary">{selectedQty} selected for return</p>
                        )}
                      </div>
                      <Button
                        variant={selectedQty > 0 ? 'secondary' : 'outline'}
                        size="sm"
                        onClick={() => addReturnFromReceipt(item)}
                        disabled={remainingQty === 0}
                      >
                        {remainingQty === 0 ? 'Max selected' : selectedQty > 0 ? 'Add another' : 'Return item'}
                      </Button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Working lines */}
          {lines.length > 0 && (
            <div className="rounded-xl border bg-card">
              <div className="flex items-center justify-between border-b p-3">
                <p className="text-sm font-medium">
                  {txn ? `From ${txn.receiptNo}` : 'Manual return'} · {lines.length} line(s)
                </p>
                <Button variant="ghost" size="sm" onClick={reset}>
                  Start over
                </Button>
              </div>
              <div className="divide-y">
                {lines.map((l) => (
                  <div key={l.lineId} className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{l.name}</span>
                          {l.qty < 0 ? (
                            <Badge variant="destructive">Return</Badge>
                          ) : (
                            <Badge variant="success">Exchange in</Badge>
                          )}
                          {l.isMarkdown && <Badge variant="warning">MD</Badge>}
                          {l.qty < 0 && !l.returnable && (
                            <Badge variant="outline" className="text-destructive">Non-returnable</Badge>
                          )}
                          {l.crmosDecision && (
                            <Badge variant={decisionBadgeVariant(l.crmosDecision)}>
                              crmOS {returnDecisionLabel(l.crmosDecision)}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {l.sku} · {formatCurrency(l.unitPrice, STORE.currency)}
                        </p>
                        {l.qty < 0 && l.eligibilityReasonCodes && l.eligibilityReasonCodes.length > 0 && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {l.matchType ?? 'return_check'} - {l.eligibilityReasonCodes.join(', ')}
                          </p>
                        )}
                        {l.qty < 0 && l.authorizedReturnQty && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Authorized return qty {l.authorizedReturnQty}
                            {l.originalQty ? ` of original qty ${l.originalQty}` : ''}
                            {l.managerOverrideBy ? ` - override by ${l.managerOverrideBy}` : ''}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={cn('font-semibold tabular-nums', l.qty < 0 && 'text-destructive')}>
                          {formatCurrency(l.unitPrice * l.qty, STORE.currency)}
                        </span>
                        <div className="flex items-center gap-1">
                          <button onClick={() => bump(l.lineId, l.qty < 0 ? 1 : -1)} className="flex h-7 w-7 items-center justify-center rounded-md border hover:bg-accent cursor-pointer">
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="w-7 text-center text-sm tabular-nums">{l.qty}</span>
                          <button onClick={() => bump(l.lineId, l.qty < 0 ? -1 : 1)} className="flex h-7 w-7 items-center justify-center rounded-md border hover:bg-accent cursor-pointer">
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => remove(l.lineId)} className="flex h-7 w-7 items-center justify-center rounded-md border text-destructive hover:bg-destructive/10 cursor-pointer">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                    {l.qty < 0 && (
                      <select
                        className="mt-2 h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs"
                        value={l.reason}
                        onChange={(e) => setReason(l.lineId, e.target.value)}
                      >
                        {RETURN_REASONS.map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </select>
                    )}
                  </div>
                ))}
              </div>

              {/* Add exchange item */}
              <div className="border-t p-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Add exchange (replacement) item</p>
                <ExchangePicker
                  value={exchangeSearch}
                  onChange={setExchangeSearch}
                  results={exchangeResults}
                  label="exchange"
                  onPick={addExchange}
                />
              </div>
            </div>
          )}
        </div>

        {/* Right: settlement */}
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-4">
            <p className="mb-3 font-medium">Settlement</p>
            <div className="space-y-1 text-sm">
              <Row label="Returned value" value={formatCurrency(returnLines.reduce((s, l) => s + l.unitPrice * l.qty, 0), STORE.currency)} />
              <Row label="Exchange value" value={formatCurrency(exchangeLines.reduce((s, l) => s + l.unitPrice * l.qty, 0), STORE.currency)} />
              <div className="border-t pt-2" />
              {refundDue > 0 && (
                <div className="flex justify-between text-lg font-bold text-destructive">
                  <span>Refund due</span>
                  <span className="tabular-nums">{formatCurrency(refundDue, STORE.currency)}</span>
                </div>
              )}
              {collectDue > 0 && (
                <div className="flex justify-between text-lg font-bold">
                  <span>Collect from customer</span>
                  <span className="tabular-nums">{formatCurrency(collectDue, STORE.currency)}</span>
                </div>
              )}
              {net === 0 && lines.length > 0 && (
                <div className="flex justify-between text-lg font-bold">
                  <span>Even exchange</span>
                  <span>$0.00</span>
                </div>
              )}
            </div>

            {/* Refund method */}
            {refundDue > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-sm font-medium">Refund method</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'cash', label: 'Cash', icon: Banknote },
                    { id: 'card', label: 'Original card', icon: CreditCard },
                    { id: 'store-credit', label: 'Store credit', icon: Wallet },
                    { id: 'misc', label: 'Misc tender', icon: Shuffle },
                  ].map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setRefundMethod(m.id)}
                      className={cn(
                        'flex items-center gap-2 rounded-lg border p-2.5 text-sm transition-colors cursor-pointer',
                        refundMethod === m.id ? 'border-primary bg-accent' : 'hover:bg-accent'
                      )}
                    >
                      <m.icon className="h-4 w-4" /> {m.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {collectDue > 0 && (
              <p className="mt-3 rounded-md bg-secondary p-2 text-xs text-muted-foreground">
                Higher-value exchange — collect the difference. Store credit / gift card can be applied at payment.
              </p>
            )}
            {net < 0 && exchangeLines.length > 0 && (
              <p className="mt-3 rounded-md bg-secondary p-2 text-xs text-muted-foreground">
                Lower-value exchange — difference settled via Misc / refund tender.
              </p>
            )}

            {blocked && (
              <div className="mt-3 flex items-start gap-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                One or more items are markdown / non-returnable. Manager override required to proceed.
              </div>
            )}

            {managerRequired && (
              <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-amber-900">Admin override required</p>
                    <p className="mt-1 text-amber-800">
                      Required for crmOS manager-review decisions or non-returnable item exceptions.
                    </p>
                    {adminOverrideApprover && (
                      <p className="mt-1 text-amber-900">
                        Approved by {adminOverrideApprover}: {adminOverrideReason}
                      </p>
                    )}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setAdminOverrideOpen(true)}>
                    <ShieldCheck className="h-4 w-4" />
                    {adminOverrideApprover ? 'Re-authorise' : 'Authorise'}
                  </Button>
                </div>
              </div>
            )}

            <Button className="mt-4 h-12 w-full text-base" disabled={!canComplete} onClick={complete}>
              {isExchange ? 'Complete exchange' : refundDue > 0 ? `Refund ${formatCurrency(refundDue, STORE.currency)}` : 'Complete'}
            </Button>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Receipt prints with reason &amp; customer signature fields.
            </p>
          </div>

          <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
            <p className="mb-1 font-medium text-foreground">Supported flows</p>
            <ul className="list-inside list-disc space-y-0.5 text-xs">
              <li>Same / different SKU exchange with discount</li>
              <li>Online order returns &amp; Sabre receipt lookups</li>
              <li>Negative qty reflected on receipt</li>
              <li>Cash refund &amp; store-credit refund</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Completion */}
      <Dialog open={done !== null} onOpenChange={(o) => !o && setDone(null)}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto" onClose={() => setDone(null)}>
          <div className="mb-3 flex flex-col items-center text-center">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
            <h2 className="mt-2 text-lg font-semibold">Processed</h2>
            <p className="text-sm text-muted-foreground">{done?.receiptNo} · negative lines synced to cloud</p>
          </div>
          {done && (
            <div className="rounded-lg bg-secondary p-3">
              <ReceiptPreview sale={done} />
            </div>
          )}
          <Button className="mt-4 w-full" onClick={() => setDone(null)}>
            Done
          </Button>
        </DialogContent>
      </Dialog>

      <ManagerAuthModal
        open={adminOverrideOpen}
        action={`Admin override return: ${adminOverrideReason}`}
        onCancel={() => setAdminOverrideOpen(false)}
        onAuthorized={applyAdminOverride}
      />
    </div>
  )
}

function refundLabel(method: string) {
  return (
    { cash: 'Cash refund', card: 'Card refund', 'store-credit': 'Store credit', misc: 'Misc refund' }[method] ??
    'Refund'
  )
}

function decisionBadgeVariant(decision: PosReturnEligibilityDecision): 'success' | 'warning' | 'destructive' | 'secondary' {
  if (decision === 'eligible') return 'success'
  if (decision === 'manager_review') return 'warning'
  if (decision === 'ineligible' || decision === 'not_found') return 'destructive'
  return 'secondary'
}

function LabelText({ children }: { children: string }) {
  return <p className="mb-1 text-xs font-medium text-muted-foreground">{children}</p>
}

function ExchangePicker({
  value,
  onChange,
  results,
  onPick,
  label,
}: {
  value: string
  onChange: (v: string) => void
  results: typeof PRODUCTS
  onPick: (sku: string) => void
  label: string
}) {
  return (
    <div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder={`Search ${label} item…`} className="pl-9" value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
      {value && (
        <div className="mt-2 space-y-1">
          {results.map((p) => (
            <button
              key={p.id}
              onClick={() => onPick(p.sku)}
              className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-accent cursor-pointer"
            >
              <span>
                {p.emoji} {p.name} <span className="text-xs text-muted-foreground">· {p.sku}</span>
              </span>
              <span className="font-medium">{formatCurrency(p.mdPrice ?? p.price, STORE.currency)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}

function PageHeader({ icon: Icon, title, subtitle }: { icon: typeof RefreshCcw; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3 border-b bg-card px-4 py-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <h1 className="font-semibold">{title}</h1>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  )
}
