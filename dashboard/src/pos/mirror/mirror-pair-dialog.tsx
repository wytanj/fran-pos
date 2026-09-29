import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Capacitor } from '@capacitor/core'
import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { MirrorPairCode } from './mirror-api'
import { mirrorLinkSummary, type MirrorLink } from './use-mirror-publisher'

const WEB_ORIGIN =
  (import.meta.env.VITE_POS_API_ORIGIN as string | undefined)?.replace(/\/+$/, '') || 'https://fran-pos.vercel.app'

function joinUrl(code: string) {
  const origin = Capacitor.isNativePlatform() ? WEB_ORIGIN : window.location.origin
  return `${origin}/pos/mirror?code=${code}`
}

export function MirrorStatusDot({ link }: { link: MirrorLink }) {
  const { tone } = mirrorLinkSummary(link)
  return (
    <span
      className={cn(
        'h-2 w-2 shrink-0 rounded-full',
        tone === 'ok' && 'bg-success',
        tone === 'wait' && 'bg-yellow-deep',
        tone === 'bad' && 'bg-danger',
        tone === 'off' && 'bg-line-strong',
      )}
    />
  )
}

type PairState =
  | { kind: 'loading' }
  | { kind: 'ready'; pair: MirrorPairCode; qr: string }
  | { kind: 'failed'; error: string }

function secondsLeft(expiresAt: string, now: number) {
  return Math.max(0, Math.round((Date.parse(expiresAt) - now) / 1000))
}

export function MirrorPairDialog({
  open,
  onClose,
  link,
  openPair,
}: {
  open: boolean
  onClose: () => void
  link: MirrorLink
  openPair: () => Promise<MirrorPairCode>
}) {
  const [state, setState] = useState<PairState>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [now, setNow] = useState(() => Date.now())

  const unbound = link.status === 'unbound'
  useEffect(() => {
    if (!open || unbound) return
    let cancelled = false
    openPair()
      .then(async (pair) => ({ pair, qr: await QRCode.toDataURL(joinUrl(pair.pair_code), { margin: 1, width: 320 }) }))
      .then(
        ({ pair, qr }) => {
          if (!cancelled) setState({ kind: 'ready', pair, qr })
        },
        (err: unknown) => {
          if (!cancelled) {
            setState({ kind: 'failed', error: err instanceof Error ? err.message : 'Could not create a pair code' })
          }
        },
      )
    return () => {
      cancelled = true
    }
  }, [open, unbound, openPair, attempt])

  const mint = () => {
    setState({ kind: 'loading' })
    setAttempt((n) => n + 1)
  }

  const close = () => {
    setState({ kind: 'loading' })
    onClose()
  }

  useEffect(() => {
    if (!open) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [open])

  const summary = mirrorLinkSummary(link)
  const remaining = state.kind === 'ready' ? secondsLeft(state.pair.pair_expires_at, now) : 0

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-w-md" onClose={close}>
        <DialogHeader>
          <DialogTitle>Customer display</DialogTitle>
          <DialogDescription>
            On the customer tablet, open Fran POS and tap Use as customer display, then enter this code or scan
            the QR. Pairing again keeps the current sale.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 flex items-center gap-2 text-sm">
          <MirrorStatusDot link={link} />
          <span className="font-medium">{summary.label}</span>
        </div>

        {link.status === 'unbound' ? (
          <p className="mt-4 rounded-md bg-secondary px-3 py-3 text-sm text-muted-foreground">
            Bind this register in Live mode first. The customer display pairs to this register.
          </p>
        ) : state.kind === 'loading' ? (
          <div className="mt-6 flex h-64 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : state.kind === 'failed' ? (
          <div className="mt-4 space-y-3">
            <p className="rounded-md bg-danger-soft px-3 py-3 text-sm text-danger">{state.error}</p>
            <Button variant="outline" className="w-full" onClick={mint}>
              Try again
            </Button>
          </div>
        ) : (
          <div className="mt-4 flex flex-col items-center gap-3">
            <img
              src={state.qr}
              alt={`QR code for pair code ${state.pair.pair_code}`}
              className={cn('h-56 w-56 rounded-md border border-line', remaining === 0 && 'opacity-30')}
            />
            <p className="font-mono text-4xl font-bold tracking-[0.3em]" data-testid="mirror-pair-code">
              {state.pair.pair_code}
            </p>
            <p className="text-xs text-muted-foreground">
              {remaining > 0
                ? `Expires in ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`
                : 'Code expired'}
            </p>
            <Button variant="outline" className="w-full" onClick={mint}>
              <RefreshCw className="mr-2 h-4 w-4" />
              New code
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
