/**
 * Screen B — customer-facing display (Tab Active5).
 *
 * Thin display client per docs/SCREEN_A_B_PLAN.md: pair once with store code +
 * pair token (kiosk, no cashier login), then render whatever Screen A publishes.
 * Airport-gate-board fidelity: big type, high contrast, four states, no chrome.
 * The guest never touches this screen; the only inputs are the pair form and a
 * tucked-away "unpair" for staff.
 */

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BrandMark } from '@/components/brand-mark'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { STORE } from '@/pos/data/mock'
import { formatDisplayMoney } from '@/pos/lib/build-customer-display-payload'
import {
  loadPairSession,
  normalizePairToken,
  normalizeStoreCode,
  pairCustomerDisplay,
  savePairSession,
  subscribeCustomerDisplay,
  type CustomerDisplayTransport,
} from '@/pos/lib/customer-display-sync'
import type { CustomerDisplayPairSession, CustomerDisplayPayload } from '@/pos/lib/customer-display-types'

const DONE_FLASH_MS = 4000
const UNPAIR_CONFIRM_MS = 3000

export default function CustomerDisplayPage() {
  const [session, setSession] = useState<CustomerDisplayPairSession | null>(() => loadPairSession())

  useKeepScreenAwake()

  if (!session) {
    return <PairScreen onPaired={setSession} />
  }
  return <Face session={session} onUnpair={() => { savePairSession(null); setSession(null) }} />
}

// ---------------------------------------------------------------------------
// Pair form (staff, once per device)
// ---------------------------------------------------------------------------

function PairScreen({ onPaired }: { onPaired: (session: CustomerDisplayPairSession) => void }) {
  const [params] = useSearchParams()
  const [storeCode, setStoreCode] = useState(() => normalizeStoreCode(params.get('store') || STORE.code))
  const [pairToken, setPairToken] = useState(() => normalizePairToken(params.get('token') || ''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const snapshot = await pairCustomerDisplay(storeCode, pairToken)
      requestFullscreenBestEffort()
      onPaired({
        laneId: snapshot.laneId,
        storeCode: snapshot.storeCode,
        laneCode: snapshot.laneCode,
        pairToken: normalizePairToken(pairToken),
        pairedAt: new Date().toISOString(),
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not pair this display')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-brown p-6 text-cream">
      <form onSubmit={submit} className="w-full max-w-md rounded-xl bg-cream p-6 text-ink shadow-warm-md">
        <div className="mb-5 flex flex-col items-center text-center">
          <BrandMark size="lg" className="mb-2" />
          <p className="eyebrow">Customer display</p>
          <h1 className="h1-display leading-tight">Pair with register</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            On the register, open <span className="font-semibold">Customer display</span> and copy the code shown there.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="cd-store">Store code</Label>
            <Input
              id="cd-store"
              className="mt-1 h-12 font-mono text-lg uppercase"
              autoCapitalize="characters"
              autoCorrect="off"
              value={storeCode}
              onChange={(e) => setStoreCode(normalizeStoreCode(e.target.value))}
              required
            />
          </div>
          <div>
            <Label htmlFor="cd-token">Pair code</Label>
            <Input
              id="cd-token"
              className="mt-1 h-14 text-center font-mono text-3xl tracking-[0.35em] uppercase"
              autoCapitalize="characters"
              autoCorrect="off"
              inputMode="text"
              maxLength={6}
              placeholder="ABC123"
              value={pairToken}
              onChange={(e) => setPairToken(normalizePairToken(e.target.value).slice(0, 6))}
              required
            />
          </div>
          {error && (
            <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>
          )}
          <Button type="submit" className="h-12 w-full text-base" disabled={busy || pairToken.length < 6 || !storeCode}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {busy ? 'Connecting…' : 'Connect display'}
          </Button>
        </div>
      </form>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The face
// ---------------------------------------------------------------------------

function Face({ session, onUnpair }: { session: CustomerDisplayPairSession; onUnpair: () => void }) {
  const [payload, setPayload] = useState<CustomerDisplayPayload | null>(null)
  const [transport, setTransport] = useState<CustomerDisplayTransport>('polling')
  const [lastError, setLastError] = useState<string | null>(null)
  const [doneSeen, setDoneSeen] = useState<string | null>(null)

  useEffect(() => {
    return subscribeCustomerDisplay({
      laneId: session.laneId,
      pairToken: session.pairToken,
      onSnapshot: (snapshot) => {
        setLastError(null)
        if (snapshot.payload) setPayload(snapshot.payload)
      },
      onTransport: setTransport,
      onError: setLastError,
    })
  }, [session.laneId, session.pairToken])

  // Thank-you flashes for a few seconds, then the face returns to idle on its
  // own even if the register stays on its "sale complete" screen.
  const doneKey = payload?.state === 'done' ? `${payload.receiptNo || ''}:${payload.publishedAt}` : null
  useEffect(() => {
    if (!doneKey) return
    const timer = setTimeout(() => setDoneSeen(doneKey), DONE_FLASH_MS)
    return () => clearTimeout(timer)
  }, [doneKey])

  const view = useMemo<CustomerDisplayPayload['state']>(() => {
    if (!payload) return 'idle'
    if (payload.state === 'done' && doneKey && doneSeen === doneKey) return 'idle'
    return payload.state
  }, [payload, doneKey, doneSeen])

  const storeName = payload?.storeName || STORE.name
  const currency = payload?.currency || STORE.currency

  return (
    <div className="relative flex min-h-dvh flex-col bg-brown text-cream">
      {/* Top strip — store only, no cashier chrome. */}
      <div className="flex items-center justify-between px-8 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-3">
          <BrandMark size="md" />
          <span className="font-display text-2xl font-semibold tracking-wide text-cream/80">{storeName}</span>
        </div>
        <span
          aria-label={lastError ? 'Display disconnected' : transport === 'realtime' ? 'Live' : 'Polling'}
          title={lastError || undefined}
          className={cn(
            'h-2.5 w-2.5 rounded-full',
            lastError ? 'bg-danger' : transport === 'realtime' ? 'bg-success' : 'bg-yellow/60',
          )}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {view === 'idle' && <IdleView storeName={storeName} />}
        {view === 'cart' && payload && <CartView payload={payload} currency={currency} />}
        {view === 'paying' && payload && <PayingView payload={payload} currency={currency} />}
        {view === 'done' && payload && <DoneView payload={payload} currency={currency} />}
      </div>

      {view === 'idle' && <UnpairCorner onUnpair={onUnpair} session={session} />}
    </div>
  )
}

function IdleView({ storeName }: { storeName: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 pb-16 text-center">
      <BrandMark size="lg" className="h-24 w-24 rounded-[22px] text-[34px]" />
      <p className="eyebrow mt-8 text-yellow">Welcome to</p>
      <h1 className="font-display text-[clamp(3rem,9vw,7rem)] font-bold leading-none tracking-tight text-cream">
        {storeName}
      </h1>
    </div>
  )
}

function MemberStrip({ payload }: { payload: CustomerDisplayPayload }) {
  if (!payload.member) return null
  return (
    <p className="font-display text-2xl text-cream/85">
      <span className="font-semibold text-yellow">{payload.member.name}</span>
      {payload.member.tierLabel ? <span className="ml-3 rounded-full bg-cream/10 px-3 py-0.5 text-lg uppercase tracking-wider">{payload.member.tierLabel}</span> : null}
    </p>
  )
}

/** The ONE promo strip allowed under the total. */
function TiesToHitStrip({ payload }: { payload: CustomerDisplayPayload }) {
  if (!payload.tiesToHit) return null
  return (
    <p className="mt-3 inline-block rounded-full bg-yellow px-5 py-2 font-display text-2xl font-semibold text-brown">
      {payload.tiesToHit}
    </p>
  )
}

function CartView({ payload, currency }: { payload: CustomerDisplayPayload; currency: string }) {
  const listRef = useRef<HTMLDivElement | null>(null)
  // Keep the newest line in view as the cashier scans.
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [payload.lines.length])

  return (
    <div className="flex min-h-0 flex-1 flex-col px-8 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6">
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
        <table className="w-full border-collapse">
          <tbody>
            {payload.lines.map((line) => (
              <tr key={line.id} className={cn('border-b border-cream/10', line.kind === 'adjustment' && 'text-cream/60')}>
                <td className="py-3 pr-4 font-display text-[clamp(1.5rem,3.2vw,2.5rem)] leading-tight">
                  {line.name}
                </td>
                <td className="w-24 py-3 text-right font-display text-[clamp(1.5rem,3.2vw,2.5rem)] tabular-nums text-cream/70">
                  {line.kind === 'product' ? `×${line.qty}` : ''}
                </td>
                <td className="w-48 py-3 pl-4 text-right font-display text-[clamp(1.5rem,3.2vw,2.5rem)] tabular-nums">
                  {formatDisplayMoney(line.lineTotal, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 border-t-2 border-yellow pt-4">
        <div className="flex items-end justify-between gap-6">
          <div className="min-w-0">
            <p className="eyebrow text-cream/60">
              {Math.abs(payload.itemCount)} item{Math.abs(payload.itemCount) === 1 ? '' : 's'}
            </p>
            <MemberStrip payload={payload} />
          </div>
          <div className="text-right">
            <p className="eyebrow text-cream/60">Total</p>
            <p className="font-display text-[clamp(3.5rem,9vw,7rem)] font-bold leading-none tabular-nums text-cream">
              {formatDisplayMoney(payload.runningTotal, currency)}
            </p>
          </div>
        </div>
        <div className="text-right">
          <TiesToHitStrip payload={payload} />
        </div>
      </div>
    </div>
  )
}

function PayingView({ payload, currency }: { payload: CustomerDisplayPayload; currency: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 pb-16 text-center">
      <p className="eyebrow text-yellow">Amount due</p>
      <p className="mt-2 font-display text-[clamp(5rem,16vw,12rem)] font-bold leading-none tabular-nums text-cream">
        {formatDisplayMoney(payload.amountDue ?? payload.runningTotal, currency)}
      </p>
      <p className="mt-8 font-display text-3xl text-cream/75">Please follow the card reader</p>
      <div className="mt-6">
        <MemberStrip payload={payload} />
        <TiesToHitStrip payload={payload} />
      </div>
    </div>
  )
}

function DoneView({ payload, currency }: { payload: CustomerDisplayPayload; currency: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-yellow px-8 pb-16 text-center text-brown">
      <h1 className="font-display text-[clamp(4rem,14vw,10rem)] font-bold leading-none tracking-tight">
        {payload.thankYouMessage || 'Thank you'}
        {payload.member ? `, ${payload.member.name.split(' ')[0]}` : ''}
      </h1>
      <p className="mt-6 font-display text-4xl tabular-nums text-brown/80">
        Paid {formatDisplayMoney(payload.amountDue ?? payload.runningTotal, currency)}
      </p>
    </div>
  )
}

/** Staff-only escape hatch: tap twice within 3s. Low contrast, idle only. */
function UnpairCorner({ session, onUnpair }: { session: CustomerDisplayPairSession; onUnpair: () => void }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(false), UNPAIR_CONFIRM_MS)
    return () => clearTimeout(timer)
  }, [armed])
  return (
    <button
      type="button"
      onClick={() => (armed ? onUnpair() : setArmed(true))}
      className={cn(
        'absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-4 rounded-full px-3 py-1 font-mono text-xs transition-colors',
        armed ? 'bg-danger text-cream' : 'text-cream/25 hover:text-cream/60',
      )}
    >
      {armed ? 'Tap again to unpair' : `${session.storeCode} · ${session.laneCode}`}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Kiosk niceties (best-effort, never required)
// ---------------------------------------------------------------------------

function requestFullscreenBestEffort() {
  try {
    const el = document.documentElement
    if (el.requestFullscreen && !document.fullscreenElement) void el.requestFullscreen().catch(() => undefined)
  } catch {
    // ignore
  }
}

function useKeepScreenAwake() {
  useEffect(() => {
    type WakeLockSentinelLike = { release: () => Promise<void> }
    type WakeLockNavigator = Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> } }
    const nav = navigator as WakeLockNavigator
    if (!nav.wakeLock) return
    let sentinel: WakeLockSentinelLike | null = null
    let disposed = false
    const acquire = async () => {
      try {
        if (document.visibilityState !== 'visible') return
        sentinel = await nav.wakeLock!.request('screen')
        if (disposed) await sentinel.release()
      } catch {
        sentinel = null
      }
    }
    void acquire()
    const onVisible = () => void acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', onVisible)
      if (sentinel) void sentinel.release().catch(() => undefined)
    }
  }, [])
}
