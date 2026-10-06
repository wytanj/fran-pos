import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { BrandMark } from '@/components/brand-mark'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  MIRROR_NOT_PAIRED,
  clearMirrorFace,
  joinMirrorStation,
  loadMirrorFace,
  readMirrorSnapshot,
  saveMirrorFace,
  type MirrorFaceBinding,
  type MirrorJoinResult,
} from '@/pos/mirror/mirror-api'
import {
  enterMirrorImmersive,
  leaveMirrorImmersive,
  lockPortrait,
  postMirrorPath,
  postMirrorSession,
  releaseMirrorPath,
  unlockPortrait,
} from '@/pos/mirror/mirror-orientation'
import { renderFranMembershipQr } from '@/pos/mirror/fran-membership-qr'
import {
  MIRROR_DONE_IDLE_MS,
  MIRROR_IDLE_PROMOS,
  formatMirrorMoney,
  mirrorAfterDoneIdle,
  mirrorPayBanner,
  parseMirrorSnapshot,
  type MirrorBasket,
  type MirrorGiftCard,
  type MirrorPromo,
  type MirrorSnapshot,
  type MirrorStore,
  type MirrorTenderKind,
} from '@/pos/mirror/mirror-snapshot'

type FaceState =
  | { kind: 'pairing'; message: string | null }
  | { kind: 'joining' }
  | { kind: 'live'; binding: MirrorFaceBinding }

const POLL_MS = 1000
const RECONNECTING_AFTER_FAILURES = 3
const PROMO_ROTATE_MS = 8000

/** Membership join / scan URL for guest basket QR. Override via VITE_MEMBERSHIP_URL. */
const MEMBERSHIP_SCAN_URL =
  (import.meta.env.VITE_MEMBERSHIP_URL as string | undefined)?.trim() ||
  (import.meta.env.VITE_FRAN_MEMBERSHIP_URL as string | undefined)?.trim() ||
  'https://fran.sg/m' // placeholder until prod membership URL is wired

const MEMBERSHIP_QR_BOX = 'h-[min(3cm,7.5rem)] w-[min(3cm,7.5rem)] rounded-md'
const MEMBERSHIP_QR_ENLARGE_BOX = 'h-[62vmin] w-[62vmin]'

function usePresentedSnapshot(snapshot: MirrorSnapshot | null): MirrorSnapshot | null {
  const [releasedReceipt, setReleasedReceipt] = useState<string | null>(null)
  const receipt = snapshot?.phase === 'done' ? snapshot.receiptNo : null
  useEffect(() => {
    if (!receipt) return
    const timer = window.setTimeout(() => setReleasedReceipt(receipt), MIRROR_DONE_IDLE_MS)
    return () => window.clearTimeout(timer)
  }, [receipt])
  if (!snapshot || snapshot.phase !== 'done' || releasedReceipt !== snapshot.receiptNo) return snapshot
  return mirrorAfterDoneIdle(snapshot, MIRROR_DONE_IDLE_MS, MIRROR_IDLE_PROMOS)
}

function idleFallback(binding: MirrorFaceBinding): MirrorSnapshot {
  return {
    v: 1,
    phase: 'idle',
    store: { name: 'Fran', code: binding.store_code, currency: 'SGD' },
    promos: MIRROR_IDLE_PROMOS,
  }
}

function useScreenWakeLock(live: boolean) {
  useEffect(() => {
    if (!live) return
    let lock: { release: () => Promise<void> } | null = null
    let cancelled = false
    const request = async () => {
      try {
        const next = (await navigator.wakeLock?.request('screen')) ?? null
        if (cancelled) {
          void next?.release().catch(() => undefined)
          return
        }
        lock = next
      } catch {
        lock = null
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void request()
    }
    void request()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release().catch(() => undefined)
    }
  }, [live])
}

function useMirrorSession(live: boolean) {
  useEffect(() => {
    postMirrorSession(live)
    return () => postMirrorSession(false)
  }, [live])
}

function useMirrorPortraitLock() {
  useEffect(() => {
    let cancelled = false
    const sync = () => {
      postMirrorPath(window.location.href)
      void lockPortrait().then(() => {
        if (cancelled) unlockPortrait()
      })
      void enterMirrorImmersive().then(() => {
        if (cancelled) leaveMirrorImmersive()
      })
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') sync()
    }
    sync()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      unlockPortrait()
      leaveMirrorImmersive()
      releaseMirrorPath()
    }
  }, [])
}

export default function MirrorFacePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [state, setState] = useState<FaceState>(() => {
    if (searchParams.get('code')) return { kind: 'joining' }
    const stored = loadMirrorFace()
    return stored ? { kind: 'live', binding: stored } : { kind: 'pairing', message: null }
  })
  const [snapshot, setSnapshot] = useState<MirrorSnapshot | null>(null)
  const [failures, setFailures] = useState(0)
  const seqRef = useRef(0)

  const live = state.kind === 'live'
  const presented = usePresentedSnapshot(snapshot)
  useScreenWakeLock(live)
  useMirrorSession(live)
  useMirrorPortraitLock()

  const onJoined = useCallback((joined: MirrorJoinResult) => {
    const binding: MirrorFaceBinding = {
      station_id: joined.station_id,
      display_token: joined.display_token,
      store_code: joined.store_code,
      register_id: joined.register_id,
    }
    saveMirrorFace(binding)
    seqRef.current = joined.snapshot_seq
    setSnapshot(parseMirrorSnapshot(joined.snapshot))
    setFailures(0)
    setState({ kind: 'live', binding })
  }, [])

  const onJoinFailed = useCallback((err: unknown) => {
    setState({ kind: 'pairing', message: err instanceof Error ? err.message : 'Could not join' })
  }, [])

  const join = (code: string) => {
    setState({ kind: 'joining' })
    joinMirrorStation(code).then(onJoined, onJoinFailed)
  }

  const codeParam = searchParams.get('code')
  const consumedCode = useRef<string | null>(null)
  useEffect(() => {
    // Codes are single use, so a repeated effect run must not join twice.
    if (!codeParam || consumedCode.current === codeParam) return
    consumedCode.current = codeParam
    setSearchParams({}, { replace: true })
    joinMirrorStation(codeParam).then(onJoined, onJoinFailed)
  }, [codeParam, onJoined, onJoinFailed, setSearchParams])

  const displayToken = state.kind === 'live' ? state.binding.display_token : null
  useEffect(() => {
    if (!displayToken) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const tick = async () => {
      if (!document.hidden) {
        try {
          const result = await readMirrorSnapshot(displayToken, seqRef.current)
          if (cancelled) return
          if (result.snapshot !== null) {
            seqRef.current = result.snapshot_seq
            setSnapshot(parseMirrorSnapshot(result.snapshot))
          }
          setFailures(0)
        } catch (err) {
          if (cancelled) return
          if (err instanceof Error && err.message.includes(MIRROR_NOT_PAIRED)) {
            clearMirrorFace()
            seqRef.current = 0
            setSnapshot(null)
            setState({
              kind: 'pairing',
              message: 'This display was re-paired elsewhere. Enter a new code.',
            })
            return
          }
          setFailures((n) => n + 1)
        }
      }
      if (!cancelled) timer = setTimeout(() => void tick(), POLL_MS)
    }
    void tick()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [displayToken])

  if (state.kind !== 'live') {
    return <PairScreen joining={state.kind === 'joining'} message={state.kind === 'pairing' ? state.message : null} onJoin={join} />
  }

  const view = presented ?? idleFallback(state.binding)
  return (
    <div data-mirror-face className="flex h-dvh flex-col overflow-hidden bg-cream text-brown select-none">
      <header className="flex items-center justify-between px-6 pt-[max(1.25rem,env(safe-area-inset-top))] pb-3">
        <div className="flex items-center gap-3">
          <BrandMark size="sm" />
          <p className="font-display text-xl font-bold">{view.store.name}</p>
        </div>
        {failures >= RECONNECTING_AFTER_FAILURES && (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-yellow-deep" />
            Reconnecting
          </span>
        )}
      </header>
      <main className="flex min-h-0 flex-1 flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <FaceBody snapshot={view} />
      </main>
      <div id="fran-overlay-root" className="hidden" />
    </div>
  )
}

function FaceBody({ snapshot }: { snapshot: MirrorSnapshot }) {
  switch (snapshot.phase) {
    case 'idle':
      return <IdlePromos promos={snapshot.promos} store={snapshot.store} />
    case 'cart':
      return <BasketView basket={snapshot.basket} store={snapshot.store} amountDue={null} />
    case 'paying':
      return (
        <BasketView
          basket={snapshot.basket}
          store={snapshot.store}
          amountDue={snapshot.amountDue}
          changeDue={snapshot.changeDue ?? 0}
          tender={snapshot.tender ?? null}
          giftCard={snapshot.giftCard}
        />
      )
    case 'done':
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="font-display text-6xl font-bold">Thank you{snapshot.memberName ? `, ${snapshot.memberName}` : ''}</p>
          <p className="text-2xl text-muted-foreground">
            Paid {formatMirrorMoney(snapshot.nett, snapshot.store.currency)} {'\u00b7'} Receipt {snapshot.receiptNo}
          </p>
          {snapshot.changeDue != null && snapshot.changeDue > 0 && (
            <p className="font-display text-5xl font-bold">
              Change due {formatMirrorMoney(snapshot.changeDue, snapshot.store.currency)}
            </p>
          )}
          {snapshot.giftCard && (
            <p className="text-2xl">
              Gift card remaining {formatMirrorMoney(snapshot.giftCard.remaining, snapshot.store.currency)}
            </p>
          )}
          {snapshot.pointsEarned !== null && (
            <p className="rounded-full bg-yellow px-6 py-3 text-2xl font-semibold">+{snapshot.pointsEarned} points earned</p>
          )}
        </div>
      )
  }
}

function IdlePromos({ promos, store }: { promos: MirrorPromo[]; store: MirrorStore }) {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (promos.length < 2) return
    const timer = setInterval(() => setIndex((i) => (i + 1) % promos.length), PROMO_ROTATE_MS)
    return () => clearInterval(timer)
  }, [promos.length])

  const promo = promos[index % Math.max(1, promos.length)]
  return (
    <div className="flex flex-1 flex-col justify-center gap-8">
      <p className="text-center text-xl text-muted-foreground">Welcome to {store.name}</p>
      {promo && (
        <div key={promo.id} className="rounded-3xl bg-yellow-soft px-10 py-14 shadow-warm-md">
          <p className="eyebrow text-lg">{promo.eyebrow}</p>
          <p className="mt-3 font-display text-5xl font-bold leading-tight">{promo.title}</p>
          <p className="mt-5 text-2xl leading-snug text-brown-soft">{promo.body}</p>
        </div>
      )}
      {promos.length > 1 && (
        <div className="flex justify-center gap-2">
          {promos.map((p, i) => (
            <span key={p.id} className={cn('h-2.5 w-2.5 rounded-full', i === index ? 'bg-brown' : 'bg-line-strong')} />
          ))}
        </div>
      )}
    </div>
  )
}

function BasketView({
  basket,
  store,
  amountDue,
  changeDue = 0,
  tender = null,
  giftCard,
}: {
  basket: MirrorBasket
  store: MirrorStore
  amountDue: number | null
  changeDue?: number
  tender?: MirrorTenderKind | null
  giftCard?: MirrorGiftCard
}) {
  const [qrEnlarged, setQrEnlarged] = useState(false)
  const money = (n: number) => formatMirrorMoney(n, store.currency)
  const showJoinQr = !basket.member
  const joinQr = showJoinQr ? renderFranMembershipQr(MEMBERSHIP_SCAN_URL) : null
  if (!joinQr && qrEnlarged) setQrEnlarged(false)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto rounded-2xl bg-white px-5 shadow-warm-xs" data-testid="mirror-lines">
        {basket.lines.map((line) => (
          <li key={line.id} className="flex items-baseline justify-between gap-4 py-8 text-2xl">
            <span className="min-w-0 flex-1 whitespace-normal break-words">{line.name}</span>
            <span className="shrink-0 text-muted-foreground">{'\u00d7'}{line.qty}</span>
            <span className="shrink-0 text-right tabular-nums">
              {line.discount != null && line.discount !== 0 && line.list != null && (
                <>
                  <span className="block text-xl text-muted-foreground line-through">{money(line.list)}</span>
                  <span className="block text-xl text-success">
                    {line.discountLabel ? `${line.discountLabel} ` : ''}
                    {money(-line.discount)}
                  </span>
                </>
              )}
              <span className="block font-semibold">{money(line.net)}</span>
            </span>
          </li>
        ))}
      </ul>

      <section className="shrink-0 space-y-3 rounded-2xl bg-white p-5 shadow-warm-md">
        {basket.member && (
          <div className="flex items-baseline justify-between gap-3 rounded-xl bg-secondary px-4 py-3 text-xl">
            <span className="font-semibold">
              {basket.member.name}
              {basket.member.tierLabel && (
                <span className="font-normal text-muted-foreground"> {'\u00b7'} {basket.member.tierLabel}</span>
              )}
            </span>
            {basket.member.pointsToEarn !== null && basket.member.pointsToEarn > 0 && (
              <span className="text-success">+{basket.member.pointsToEarn} pts</span>
            )}
          </div>
        )}
        {basket.tierNudge && (
          <p className="rounded-xl bg-yellow px-4 py-3 text-center text-xl font-semibold">{basket.tierNudge}</p>
        )}
        {basket.rewards.map((reward) => (
          <div key={reward.id} className="flex justify-between text-xl text-success" data-testid="mirror-reward">
            <span className="min-w-0 truncate">{reward.label}</span>
            <span className="tabular-nums">{money(reward.amount)}</span>
          </div>
        ))}
        <div
          className={cn('flex items-center gap-4', showJoinQr ? 'justify-between' : 'justify-end')}
          data-testid="mirror-totals-row"
        >
          {showJoinQr && (
            <div className="flex shrink-0 flex-col items-center gap-1" data-testid="mirror-membership-qr">
              {joinQr ? (
                <button
                  type="button"
                  className={`${MEMBERSHIP_QR_BOX} bg-white border-0 p-0 [&>svg]:block`}
                  aria-label="Scan to join membership"
                  onClick={() => setQrEnlarged(true)}
                  dangerouslySetInnerHTML={{ __html: joinQr }}
                />
              ) : (
                <div className={`${MEMBERSHIP_QR_BOX} bg-surface-sunken`} aria-hidden />
              )}
              <span className="text-xs font-medium text-muted-foreground">Scan to join</span>
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex justify-between text-xl text-muted-foreground">
              <span>
                Subtotal {'\u00b7'} {basket.itemCount} {basket.itemCount === 1 ? 'item' : 'items'}
              </span>
              <span className="tabular-nums">{money(basket.subtotal)}</span>
            </div>
            <div className="flex items-end justify-between border-t border-line pt-2">
              <span className="text-2xl font-semibold">Nett</span>
              <span className="font-display text-6xl font-bold tabular-nums" data-testid="mirror-nett">
                {money(basket.nett)}
              </span>
            </div>
          </div>
        </div>
        {amountDue !== null && <PayBanner amountDue={amountDue} changeDue={changeDue} tender={tender} money={money} />}
        {giftCard && (
          <p className="text-center text-xl">Gift card remaining {money(giftCard.remaining)}</p>
        )}
      </section>
      {joinQr != null && (
        <Dialog open={qrEnlarged} onOpenChange={setQrEnlarged}>
          <DialogContent
            aria-label="Membership QR"
            data-testid="mirror-membership-qr-modal"
            onClose={() => setQrEnlarged(false)}
            className="w-auto max-w-none border-0 bg-transparent p-16 shadow-none"
          >
            <div
              className={`${MEMBERSHIP_QR_ENLARGE_BOX} bg-white`}
              data-testid="mirror-membership-qr-enlarged"
              dangerouslySetInnerHTML={{ __html: joinQr }}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

function PayBanner({
  amountDue,
  changeDue,
  tender,
  money,
}: {
  amountDue: number
  changeDue: number
  tender: MirrorTenderKind | null
  money: (amount: number) => string
}) {
  const banner = mirrorPayBanner({ amountDue, changeDue, tender })
  if (banner.kind === 'hidden') return null
  return (
    <div className="rounded-xl bg-brown px-4 py-4 text-center text-cream">
      <p className="text-lg">{banner.label}</p>
      <p className="font-display text-5xl font-bold tabular-nums">{money(banner.amount)}</p>
    </div>
  )
}

function PairScreen({
  joining,
  message,
  onJoin,
}: {
  joining: boolean
  message: string | null
  onJoin: (code: string) => void
}) {
  const [code, setCode] = useState('')
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (clean.length === 6) onJoin(clean)
  }
  return (
    <div data-mirror-face className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-cream p-6 text-brown">
      <BrandMark size="sm" />
      <div className="text-center">
        <h1 className="font-display text-3xl font-bold">Customer display</h1>
        <p className="mt-2 text-muted-foreground">
          On the cashier tablet, tap Customer display on the sale screen and enter the code shown.
        </p>
      </div>
      <form onSubmit={submit} className="flex w-full max-w-md flex-col gap-4">
        <input
          value={clean}
          onChange={(e) => setCode(e.target.value)}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          autoFocus
          aria-label="Pair code"
          placeholder="ABC123"
          className="w-full rounded-2xl border border-line bg-white px-4 py-6 text-center font-mono text-5xl uppercase tracking-[0.28em] sm:text-6xl"
        />
        {message && <p className="rounded-md bg-danger-soft px-3 py-2 text-center text-sm text-danger">{message}</p>}
        <Button type="submit" className="h-16 text-xl" disabled={joining || clean.length !== 6}>
          {joining ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Pair display'}
        </Button>
      </form>
    </div>
  )
}
