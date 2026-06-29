import { useState } from 'react'
import {
  Banknote,
  CreditCard,
  Wallet,
  Gift,
  Shuffle,
  ArrowLeft,
  QrCode,
  Loader2,
  CheckCircle2,
  Trash2,
} from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { formatCurrency, cn } from '@/lib/utils'
import { Numpad } from '@/pos/components/numpad'
import { CARD_TYPES, PAYMENT_MODES, STORE, type PaymentModeId } from '@/pos/data/mock'
import { usePos } from '@/pos/lib/pos-context'

const ICONS: Record<string, typeof Banknote> = {
  cash: Banknote,
  card: CreditCard,
  square_pos: CreditCard,
  paynow: QrCode,
  'store-credit': Wallet,
  'gift-card': Gift,
  misc: Shuffle,
}

const MAX_TENDERS_PER_PAYMENT = 2

interface PaymentModalProps {
  open: boolean
  onClose: () => void
  onComplete: () => void
}

export function PaymentModal({ open, onClose, onComplete }: PaymentModalProps) {
  const { totals, payments, addPayment, removePayment, customer } = usePos()
  const [mode, setMode] = useState<PaymentModeId | null>(null)
  const [amount, setAmount] = useState('')
  const [cardType, setCardType] = useState<string>(CARD_TYPES[0])
  const [terminalState, setTerminalState] = useState<'idle' | 'waiting' | 'approved'>('idle')

  const remaining = totals.balance
  const amountNum = parseFloat(amount) || 0
  const fullyPaid = remaining <= 0.001
  const paymentLimitReached = payments.length >= MAX_TENDERS_PER_PAYMENT
  const storeCreditAvail = customer?.storeCredit ?? 0
  const giftAvail = customer?.giftCardBalance ?? 0

  const reset = () => {
    setMode(null)
    setAmount('')
    setTerminalState('idle')
  }

  const closeAndReset = () => {
    reset()
    onClose()
  }

  const getTenderLimit = (paymentMode: PaymentModeId | null) => {
    if (!paymentMode) return Math.max(remaining, 0)
    if (paymentMode === 'store-credit') return Math.min(storeCreditAvail, Math.max(remaining, 0))
    if (paymentMode === 'gift-card') return Math.min(giftAvail, Math.max(remaining, 0))
    return Math.max(remaining, 0)
  }

  const tenderLimit = getTenderLimit(mode)
  const amountTooHigh = mode !== null && mode !== 'cash' && amountNum > tenderLimit + 0.001

  const buildQuickAmounts = () => {
    if (!mode) return []
    if (mode === 'cash') {
      return [remaining, Math.ceil(remaining / 10) * 10, Math.ceil(remaining / 50) * 50, 100]
        .filter((v, i, a) => v > 0 && a.indexOf(v) === i)
        .slice(0, 4)
    }

    const half = Math.round((tenderLimit / 2) * 100) / 100
    return [tenderLimit, half, 100, 50]
      .filter((v, i, a) => v > 0 && v <= tenderLimit && a.indexOf(v) === i)
      .slice(0, 4)
  }

  const quickAmounts = buildQuickAmounts()

  const chooseMode = (paymentMode: PaymentModeId) => {
    setMode(paymentMode)
    setAmount(getTenderLimit(paymentMode).toFixed(2))
  }

  const commit = (
    label: string,
    value: number,
    detail?: string,
    metadata: {
      provider?: string | null
      providerRef?: string | null
      providerMetadata?: Record<string, unknown>
      status?: 'pending' | 'captured' | 'failed' | 'refunded' | 'voided'
    } = {}
  ) => {
    addPayment({ mode: mode!, label, amount: value, detail, ...metadata })
    reset()
  }

  const handleConfirm = () => {
    if (!mode) return
    const modeMeta = PAYMENT_MODES.find((m) => m.id === mode)!

    if (mode === 'cash') {
      // Cash can be tendered above the balance — change is computed on the summary.
      commit('Cash', amountNum)
      return
    }
    if (mode === 'card') {
      setTerminalState('waiting')
      setTimeout(() => {
        setTerminalState('approved')
        setTimeout(() => {
          const last4 = String(Math.floor(1000 + Math.random() * 8999))
          commit(cardType, amountNum || remaining, `****${last4}`)
        }, 700)
      }, 1200)
      return
    }
    if (mode === 'square_pos') {
      setTerminalState('waiting')
      setTimeout(() => {
        setTerminalState('approved')
        setTimeout(() => {
          const transactionId = `sq-${Date.now()}`
          commit('Square POS', amountNum || remaining, transactionId, {
            provider: 'square',
            providerRef: transactionId,
            providerMetadata: {
              adapter: 'square_pos',
              handoff: 'planned',
              transaction_id: transactionId,
            },
          })
        }, 700)
      }, 1200)
      return
    }
    if (mode === 'store-credit') {
      const max = Math.min(customer?.storeCredit ?? 0, remaining)
      commit('Store Credit', Math.min(amountNum || max, max))
      return
    }
    if (mode === 'gift-card') {
      const max = Math.min(customer?.giftCardBalance ?? 0, remaining)
      commit(`Gift Card ${customer?.giftCardNo ?? ''}`.trim(), Math.min(amountNum || max, max))
      return
    }
    if (mode === 'paynow') {
      commit('PayNow QR', Math.min(amountNum || remaining, remaining))
      return
    }
    // misc / exchange tender
    commit(modeMeta.label, amountNum || remaining)
  }

  const cashTendered = payments.filter((p) => p.mode === 'cash').reduce((s, p) => s + p.amount, 0)
  const change = totals.paid - totals.total

  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeAndReset()}>
      <DialogContent className="max-w-2xl p-0" onClose={closeAndReset}>
        <div className="grid grid-cols-1 md:grid-cols-2">
          {/* Left: balance + applied payments */}
          <div className="rounded-l-lg bg-primary p-6 text-primary-foreground">
            <p className="text-sm opacity-80">Balance Due</p>
            <p className="text-4xl font-bold tabular-nums">
              {formatCurrency(Math.max(remaining, 0), STORE.currency)}
            </p>
            <div className="mt-1 text-sm opacity-80">
              Total {formatCurrency(totals.total, STORE.currency)} · Paid{' '}
              {formatCurrency(totals.paid, STORE.currency)}
            </div>

            <div className="mt-5 space-y-2">
              {payments.length === 0 && (
                <p className="text-sm opacity-70">No payments yet. Add one or more tenders.</p>
              )}
              {payments.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-md bg-white/10 px-3 py-2 text-sm"
                >
                  <span>
                    {p.label} {p.detail}
                  </span>
                  <span className="flex items-center gap-2 tabular-nums">
                    {formatCurrency(p.amount, STORE.currency)}
                    <button onClick={() => removePayment(p.id)} className="opacity-70 hover:opacity-100">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </div>
              ))}
            </div>

            {fullyPaid && (
              <div className="mt-5 rounded-lg bg-white/15 p-3">
                {change > 0.001 && (
                  <div className="flex justify-between text-sm">
                    <span>Change due</span>
                    <span className="font-bold tabular-nums">{formatCurrency(change, STORE.currency)}</span>
                  </div>
                )}
                {cashTendered > 0 && (
                  <p className="mt-1 text-xs opacity-80">Cash tendered {formatCurrency(cashTendered, STORE.currency)}</p>
                )}
                <Button
                  variant="secondary"
                  className="mt-3 h-11 w-full text-base"
                  onClick={() => {
                    onComplete()
                    reset()
                  }}
                >
                  <CheckCircle2 className="h-5 w-5" /> Complete & Print
                </Button>
              </div>
            )}
          </div>

          {/* Right: tender entry */}
          <div className="p-6">
            {fullyPaid ? (
              <div className="flex h-full min-h-64 flex-col items-center justify-center rounded-lg border bg-muted/30 p-6 text-center">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
                <p className="mt-3 text-sm font-medium">Payment complete</p>
                <p className="mt-1 text-xs text-muted-foreground">Review the tender summary, then print the receipt.</p>
              </div>
            ) : mode === null ? (
              <>
                <p className="mb-3 text-sm font-medium text-muted-foreground">Select payment mode</p>
                {paymentLimitReached && (
                  <div className="mb-3 rounded-lg border bg-muted/40 p-4 text-center">
                    <p className="text-sm font-medium">Two tenders added</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Remove one tender to change the split or clear the remaining balance.
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {PAYMENT_MODES.map((m) => {
                    const Icon = ICONS[m.id]
                    return (
                      <button
                        key={m.id}
                        onClick={() => chooseMode(m.id)}
                        disabled={paymentLimitReached}
                        className="flex flex-col items-center gap-2 rounded-lg border p-4 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                      >
                        <Icon className="h-6 w-6" />
                        {m.label}
                      </button>
                    )
                  })}
                </div>
                <p className="mt-4 text-center text-xs text-muted-foreground">
                  Supports split payment with up to two tenders per sale.
                </p>
              </>
            ) : (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-medium">{PAYMENT_MODES.find((m) => m.id === mode)!.label}</p>
                  <button
                    onClick={reset}
                    className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Change method
                  </button>
                </div>

                {/* Mode-specific context */}
                {mode === 'store-credit' && (
                  <p className="mb-2 text-xs text-muted-foreground">
                    Available credit: {formatCurrency(storeCreditAvail, STORE.currency)}
                    {!customer && ' — tag a member first'}
                  </p>
                )}
                {mode === 'gift-card' && (
                  <p className="mb-2 text-xs text-muted-foreground">
                    Gift card {customer?.giftCardNo ?? '—'}: {formatCurrency(giftAvail, STORE.currency)}
                  </p>
                )}
                {mode === 'paynow' && (
                  <p className="mb-2 text-xs text-muted-foreground">
                    Generate a PayNow QR for {formatCurrency(tenderLimit, STORE.currency)} or enter a lower split amount.
                  </p>
                )}
                {mode === 'card' && (
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {CARD_TYPES.map((c) => (
                      <button
                        key={c}
                        onClick={() => setCardType(c)}
                        className={cn(
                          'rounded-md border px-2.5 py-1 text-xs transition-colors cursor-pointer',
                          cardType === c ? 'border-primary bg-accent font-medium' : 'hover:bg-accent'
                        )}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}

                {(mode === 'card' || mode === 'square_pos') && terminalState !== 'idle' ? (
                  <div className="flex flex-col items-center justify-center rounded-lg border bg-muted/40 py-10 text-center">
                    {terminalState === 'waiting' ? (
                      <>
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        <p className="mt-3 text-sm font-medium">Connecting to terminal…</p>
                        <p className="text-xs text-muted-foreground">
                          {mode === 'square_pos' ? 'Opening Square POS handoff' : `Tap, insert or swipe ${cardType}`}
                        </p>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-8 w-8 text-green-600" />
                        <p className="mt-3 text-sm font-medium">
                          {mode === 'square_pos' ? 'Square POS reference captured' : `${cardType} approved`}
                        </p>
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="mb-3 rounded-lg border bg-muted/40 p-3 text-right text-3xl font-bold tabular-nums">
                      {formatCurrency(amountNum, STORE.currency)}
                    </div>
                    {amountTooHigh && (
                      <p className="mb-2 text-xs font-medium text-destructive">
                        Maximum for this tender is {formatCurrency(tenderLimit, STORE.currency)}.
                      </p>
                    )}
                    <div className="mb-3 grid grid-cols-4 gap-1.5">
                      {quickAmounts.map((q) => (
                        <button
                          key={q}
                          onClick={() => setAmount(q.toFixed(2))}
                          className="rounded-md border py-1.5 text-xs font-medium transition-colors hover:bg-accent cursor-pointer"
                        >
                          {formatCurrency(q, STORE.currency)}
                        </button>
                      ))}
                    </div>
                    <Numpad
                      decimal
                      onPress={(k) => {
                        if (k === '.' && amount.includes('.')) return
                        setAmount((a) => a + k)
                      }}
                      onBackspace={() => setAmount((a) => a.slice(0, -1))}
                    />
                  </>
                )}

                {!((mode === 'card' || mode === 'square_pos') && terminalState !== 'idle') && (
                  <Button
                    className="mt-3 h-11 w-full text-base"
                    onClick={handleConfirm}
                    disabled={
                      (mode === 'store-credit' && storeCreditAvail <= 0) ||
                      (mode === 'gift-card' && giftAvail <= 0) ||
                      amountTooHigh ||
                      (mode === 'cash' ? amountNum <= 0 : amountNum < 0)
                    }
                  >
                    {mode === 'card' ? `Charge ${cardType}` : mode === 'square_pos' ? 'Open Square POS' : 'Add tender'}{' '}
                    {amountNum > 0 && `· ${formatCurrency(amountNum, STORE.currency)}`}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
