import { useEffect, useMemo, useRef, useState } from 'react'
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
  AlertTriangle,
  Nfc,
  SmartphoneNfc,
} from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { formatCurrency, cn } from '@/lib/utils'
import { Numpad } from '@/pos/components/numpad'
import { CARD_TYPES, PAYMENT_MODES, STORE, type PaymentModeId } from '@/pos/data/mock'
import { usePos } from '@/pos/lib/pos-context'
import { useStripeConnector } from '@/hooks/use-stripe-connector'
import { preferredStoreChargeMode, stripeS700Ready, visiblePaymentModes } from '@/pos/lib/stripe-connector'
import { cancelStripeCollection, collectStripeInPerson } from '@/pos/lib/stripe-collect'
import { resolveTapToPayConfig, tapToPaySupported } from '@/pos/lib/stripe-tap-to-pay'
import { logTapToPayTrace } from '@/pos/lib/stripe-terminal-api'

const ICONS: Record<string, typeof Banknote> = {
  cash: Banknote,
  stripe_s700: Nfc,
  stripe_tap: SmartphoneNfc,
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
  onPaymentFailed?: (reason: string) => void
}

export function PaymentModal({ open, onClose, onComplete, onPaymentFailed }: PaymentModalProps) {
  const { totals, payments, addPayment, removePayment, customer } = usePos()
  const { connector: stripe } = useStripeConnector()
  const [mode, setMode] = useState<PaymentModeId | null>(null)
  const [amount, setAmount] = useState('')
  const [cardType, setCardType] = useState<string>(CARD_TYPES[0])
  const [terminalState, setTerminalState] = useState<'idle' | 'waiting' | 'approved'>('idle')
  const [terminalMessage, setTerminalMessage] = useState('')
  const [terminalError, setTerminalError] = useState('')
  const [waitElapsed, setWaitElapsed] = useState(0)
  const terminalTimers = useRef<number[]>([])
  const stripeBusy = useRef(false)
  const chargeGen = useRef(0)
  const terminalMessageRef = useRef('')

  const tapReady = tapToPaySupported()
  const visibleModes = useMemo(() => {
    const allowed = new Set(
      visiblePaymentModes({
        stripeEnabled: Boolean(stripe?.enabled),
        s700Ready: stripeS700Ready(stripe),
        tapReady,
      }),
    )
    const modes = PAYMENT_MODES.filter((item) => allowed.has(item.id))
    const preferS700 = preferredStoreChargeMode(stripe, tapReady) !== 'stripe_tap'
    return [...modes].sort((a, b) => {
      if (a.id === 'stripe_s700' && preferS700) return -1
      if (b.id === 'stripe_s700' && preferS700) return 1
      return 0
    })
  }, [stripe, tapReady])

  const remaining = totals.balance
  const amountNum = parseFloat(amount) || 0

  useEffect(() => {
    if (!open) return
    if (mode || payments.length > 0) return
    const preferred = preferredStoreChargeMode(stripe, tapToPaySupported())
    if (preferred) {
      setMode(preferred)
      setAmount(Math.max(remaining, 0).toFixed(2))
    }
  }, [open, mode, payments.length, remaining, stripe])
  const fullyPaid = remaining <= 0.001
  const paymentLimitReached = payments.length >= MAX_TENDERS_PER_PAYMENT
  const storeCreditAvail = customer?.storeCredit ?? 0
  const giftAvail = customer?.giftCardBalance ?? 0

  const reset = () => {
    chargeGen.current += 1
    terminalTimers.current.forEach((timerId) => window.clearTimeout(timerId))
    terminalTimers.current = []
    setMode(null)
    setAmount('')
    setTerminalState('idle')
    setTerminalMessage('')
    setTerminalError('')
    setWaitElapsed(0)
    stripeBusy.current = false
  }

  useEffect(() => {
    terminalMessageRef.current = terminalMessage
  }, [terminalMessage])

  useEffect(() => {
    if (terminalState !== 'waiting' || (mode !== 'stripe_tap' && mode !== 'stripe_s700')) {
      setWaitElapsed(0)
      return
    }
    const started = Date.now()
    const gen = chargeGen.current
    const timerId = window.setInterval(() => {
      if (gen !== chargeGen.current) return
      const elapsed = Math.floor((Date.now() - started) / 1000)
      setWaitElapsed(elapsed)
      // Setup limit must exceed the summed per-step timeouts in stripe-tap-to-pay.ts,
      // or this generic message replaces the step's real error text.
      const collecting = /hold the|authorizing/i.test(terminalMessageRef.current)
      const limit = collecting ? 90 : 60
      if (elapsed < limit) return
      chargeGen.current += 1
      logTapToPayTrace(`watchdog fired after ${elapsed}s, last status: ${terminalMessageRef.current}`)
      void cancelStripeCollection(stripe)
      setTerminalState('idle')
      setTerminalError(
        collecting
          ? 'No tap received. Hold the iPhone or card to the back of the Oppo, then Charge again.'
          : 'Tap to Pay did not finish opening. Force-close Fran POS completely, open it again, tap Allow if ColorOS asks for Location, then Charge again.',
      )
      stripeBusy.current = false
    }, 400)
    return () => window.clearInterval(timerId)
  }, [terminalState, mode, stripe])

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

  const scheduleTerminalStep = (run: () => void, delayMs: number) => {
    const timerId = window.setTimeout(() => {
      terminalTimers.current = terminalTimers.current.filter((id) => id !== timerId)
      run()
    }, delayMs)
    terminalTimers.current.push(timerId)
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

  const handleConfirm = async () => {
    if (!mode) return
    const modeMeta = PAYMENT_MODES.find((m) => m.id === mode)!

    if (mode === 'stripe_s700' || mode === 'stripe_tap') {
      if (stripeBusy.current) return
      if (mode === 'stripe_s700' && !stripe) return
      stripeBusy.current = true
      const gen = ++chargeGen.current
      setTerminalError('')
      setWaitElapsed(0)
      setTerminalState('waiting')
      setTerminalMessage(
        mode === 'stripe_s700'
          ? 'Preparing the S700…'
          : 'Preparing Stripe Tap to Pay (test mode)…',
      )
      try {
        const config = mode === 'stripe_tap' ? await resolveTapToPayConfig(stripe) : stripe
        if (!config) throw new Error('Stripe Terminal is not configured')
        const result = await collectStripeInPerson({
          kind: mode === 'stripe_s700' ? 's700' : 'tap_to_pay',
          config,
          amount: amountNum || remaining,
          currency: STORE.currency,
          description: `Fran POS ${STORE.code}`,
          metadata: {
            store_code: STORE.code,
            register: '01',
          },
          onStatus: setTerminalMessage,
        })
        if (gen !== chargeGen.current) return
        setTerminalState('approved')
        setTerminalMessage('Payment approved')
        commit(mode === 'stripe_s700' ? 'Stripe S700' : 'Tap to Pay', result.amount, result.paymentIntent.id, {
          provider: 'stripe',
          providerRef: result.paymentIntent.id,
          status: 'captured',
          providerMetadata: {
            adapter: mode,
            payment_intent_id: result.paymentIntent.id,
            charge_id: result.paymentIntent.latest_charge || null,
            simulated: config.simulated,
          },
        })
      } catch (error) {
        logTapToPayTrace(`charge error${gen !== chargeGen.current ? ' (late, discarded)' : ''}: ${
          error instanceof Error ? error.message : String(error)
        }`)
        if (gen !== chargeGen.current) return
        const message =
          error instanceof Error && error.message.trim()
            ? error.message
            : typeof error === 'string' && error.trim()
              ? error
              : 'Stripe payment failed'
        setTerminalState('idle')
        setTerminalError(message)
        stripeBusy.current = false
        onPaymentFailed?.(`${mode} payment_failed: ${message}`)
      }
      return
    }

    if (mode === 'cash') {
      // Cash can be tendered above the balance — change is computed on the summary.
      commit('Cash', amountNum)
      return
    }
    if (mode === 'card') {
      setTerminalState('waiting')
      scheduleTerminalStep(() => {
        setTerminalState('approved')
        scheduleTerminalStep(() => {
          const last4 = String(Math.floor(1000 + Math.random() * 8999))
          commit(cardType, amountNum || remaining, `****${last4}`)
        }, 700)
      }, 1200)
      return
    }
    if (mode === 'square_pos') {
      setTerminalState('waiting')
      scheduleTerminalStep(() => {
        setTerminalState('approved')
        scheduleTerminalStep(() => {
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

  const failPayment = () => {
    if (!mode) return
    void cancelStripeCollection(stripe)
    const modeMeta = PAYMENT_MODES.find((m) => m.id === mode)
    const label = mode === 'card' ? cardType : modeMeta?.label ?? 'Payment'
    onPaymentFailed?.(`${label} payment_failed`)
    closeAndReset()
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
            <p className="font-display text-4xl font-bold tabular-nums">
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
                <CheckCircle2 className="h-8 w-8 text-success" />
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
                  {visibleModes.map((m) => {
                    const Icon = ICONS[m.id]
                    return (
                      <button
                        key={m.id}
                        onClick={() => chooseMode(m.id)}
                        disabled={paymentLimitReached}
                        className="flex flex-col items-center gap-2 rounded-lg border p-4 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                      >
                        <Icon className="h-6 w-6" />
                        {m.id === 'stripe_tap' && tapReady ? 'Credit / Debit' : m.label}
                        {m.id === 'stripe_s700' && (
                          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Customer reader</span>
                        )}
                        {m.id === 'stripe_tap' && (
                          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Stripe Tap to Pay</span>
                        )}
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
                  <p className="text-sm font-medium">
                    {mode === 'stripe_tap' && tapReady ? 'Credit / Debit' : PAYMENT_MODES.find((m) => m.id === mode)!.label}
                  </p>
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

                {(mode === 'card' || mode === 'square_pos' || mode === 'stripe_s700' || mode === 'stripe_tap') && terminalState !== 'idle' ? (
                  <div className="flex flex-col items-center justify-center rounded-lg border bg-muted/40 py-10 text-center">
                    {terminalState === 'waiting' ? (
                      <>
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        <p className="mt-3 text-sm font-medium">
                          {mode === 'stripe_s700'
                            ? 'S700 collecting'
                            : mode === 'stripe_tap'
                              ? terminalMessage || 'Getting ready to take a tap'
                              : 'Connecting to terminal…'}
                        </p>
                        <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                          {mode === 'square_pos'
                            ? 'Opening Square POS handoff'
                            : mode === 'stripe_tap'
                              ? `Stripe test mode · ${waitElapsed}s. Real tap needs the release APK and Developer options off.`
                              : mode === 'stripe_s700'
                                ? terminalMessage
                              : `Tap, insert or swipe ${cardType}`}
                        </p>
                        <Button variant="outline" className="mt-4" onClick={failPayment}>
                          <AlertTriangle className="h-4 w-4" /> Cancel / mark failed
                        </Button>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-8 w-8 text-success" />
                        <p className="mt-3 text-sm font-medium">
                          {mode === 'square_pos'
                            ? 'Square POS reference captured'
                            : mode === 'stripe_s700'
                              ? 'S700 approved'
                              : mode === 'stripe_tap'
                                ? 'Tap to Pay approved'
                                : `${cardType} approved`}
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

                {!((mode === 'card' || mode === 'square_pos' || mode === 'stripe_s700' || mode === 'stripe_tap') && terminalState !== 'idle') && (
                  <>
                    {terminalError && (
                      <p className="mb-2 rounded-sm border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                        {terminalError}
                      </p>
                    )}
                    {(mode === 'stripe_s700' || mode === 'stripe_tap') && stripe?.simulated && (
                      <p className="mb-2 text-xs text-muted-foreground">
                        Simulated Stripe reader is on. Use this path for Stripe acceptance test cards.
                      </p>
                    )}
                    <Button
                      className="mt-3 h-11 w-full text-base"
                      onClick={() => void handleConfirm()}
                      disabled={
                        (mode === 'store-credit' && storeCreditAvail <= 0) ||
                        (mode === 'gift-card' && giftAvail <= 0) ||
                        amountTooHigh ||
                        (mode === 'cash' ? amountNum <= 0 : amountNum < 0)
                      }
                    >
                      {mode === 'card'
                        ? `Charge ${cardType}`
                        : mode === 'square_pos'
                          ? 'Open Square POS'
                          : mode === 'stripe_s700'
                            ? 'Charge on S700'
                            : mode === 'stripe_tap'
                              ? 'Charge with Tap to Pay'
                              : 'Add tender'}{' '}
                      {amountNum > 0 && `· ${formatCurrency(amountNum, STORE.currency)}`}
                    </Button>
                    {(mode === 'card' || mode === 'square_pos' || mode === 'stripe_s700' || mode === 'stripe_tap') && (
                      <Button variant="outline" className="mt-2 w-full" onClick={failPayment}>
                        <AlertTriangle className="h-4 w-4" /> Mark payment failed
                      </Button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
