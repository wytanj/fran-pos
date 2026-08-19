import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, Loader2, QrCode, RefreshCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import type { StripeQrMethod } from '@/pos/lib/stripe-terminal-api'

export type QrPaymentPhase = 'creating' | 'waiting' | 'approved' | 'expired' | 'error'

const METHOD_COPY: Record<StripeQrMethod, { name: string; instruction: string }> = {
  paynow: { name: 'PayNow', instruction: 'Scan with any Singapore banking app' },
  wechat_pay: { name: 'WeChat Pay', instruction: 'Open WeChat and scan (扫一扫)' },
}

interface QrPaymentOverlayProps {
  method: StripeQrMethod
  amount: number
  currency: string
  qrPng: string
  phase: QrPaymentPhase
  error?: string
  startedAt: number
  expiresAt: number
  onExpired: () => void
  onNewQr: () => void
  onCancel: () => void
}

// Full-screen customer-facing takeover: the register is turned toward the
// customer, so the amount and QR lead and cashier controls stay small.
export function QrPaymentOverlay(props: QrPaymentOverlayProps) {
  const copy = METHOD_COPY[props.method]
  const [now, setNow] = useState(() => Date.now())
  const expiredNotified = useRef(false)

  useEffect(() => {
    expiredNotified.current = false
  }, [props.startedAt, props.phase])

  useEffect(() => {
    const timerId = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(timerId)
  }, [])

  const elapsed = Math.max(0, Math.floor((now - props.startedAt) / 1000))
  const remainMs = Math.max(0, props.expiresAt - now)
  const remainMin = Math.floor(remainMs / 60_000)
  const remainSec = Math.floor((remainMs % 60_000) / 1000)

  useEffect(() => {
    if (props.phase !== 'waiting' || remainMs > 0 || expiredNotified.current) return
    expiredNotified.current = true
    props.onExpired()
  }, [props, remainMs])

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background p-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      {props.phase === 'approved' ? (
        <div className="flex flex-col items-center text-center">
          <CheckCircle2 className="h-24 w-24 text-success" />
          <p className="mt-6 font-display text-3xl font-bold">Payment received</p>
          <p className="mt-2 text-4xl font-bold tabular-nums">{formatCurrency(props.amount, props.currency)}</p>
          <p className="mt-3 text-sm text-muted-foreground">{copy.name}</p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <QrCode className="h-4 w-4" /> {copy.name}
          </div>
          <p className="mt-2 font-display text-6xl font-bold tabular-nums">
            {formatCurrency(props.amount, props.currency)}
          </p>

          <div className="mt-6 rounded-2xl border bg-card p-6 shadow-sm">
            {props.phase === 'creating' || !props.qrPng ? (
              <div className="flex h-[min(60vw,320px)] w-[min(60vw,320px)] flex-col items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
                <p className="mt-4 text-sm text-muted-foreground">Creating the {copy.name} QR…</p>
              </div>
            ) : (
              <img
                src={props.qrPng}
                alt={`${copy.name} QR code`}
                className={
                  'h-[min(60vw,320px)] w-[min(60vw,320px)] object-contain' +
                  (props.phase === 'expired' || props.phase === 'error' ? ' opacity-20 grayscale' : '')
                }
              />
            )}
          </div>

          {props.phase === 'waiting' && (
            <>
              <p className="mt-5 text-lg font-medium">{copy.instruction}</p>
              <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Waiting for payment… {elapsed}s
              </p>
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                QR valid for {remainMin}:{String(remainSec).padStart(2, '0')}
              </p>
            </>
          )}

          {props.phase === 'expired' && (
            <>
              <p className="mt-5 text-lg font-medium">This QR has expired</p>
              <p className="mt-1 text-sm text-muted-foreground">No money moved. Generate a fresh QR to continue.</p>
              <Button className="mt-4 h-12 px-6 text-base" onClick={props.onNewQr}>
                <RefreshCcw className="h-5 w-5" /> New QR
              </Button>
            </>
          )}

          {props.phase === 'error' && (
            <>
              <p className="mt-5 max-w-md text-center text-sm font-medium text-destructive">
                {props.error || `${copy.name} payment failed`}
              </p>
              <Button className="mt-4 h-12 px-6 text-base" onClick={props.onNewQr}>
                <RefreshCcw className="h-5 w-5" /> New QR
              </Button>
            </>
          )}

          <button
            onClick={props.onCancel}
            className="absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-6 flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" /> Cancel
          </button>
        </>
      )}
    </div>,
    document.body,
  )
}
