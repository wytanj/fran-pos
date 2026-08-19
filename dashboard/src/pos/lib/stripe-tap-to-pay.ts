import { Capacitor } from '@capacitor/core'
// Static import on purpose: a runtime import() of this package hangs in the
// Android WebView (chunk fetch never settles), which stalled Tap to Pay at 3/5.
import { StripeTerminal } from '@capgo/capacitor-stripe-terminal'
import { TapToPayDarkMode } from '@capgo/capacitor-stripe-terminal/dist/esm/definitions'
import { TerminalEventsEnum } from '@capgo/capacitor-stripe-terminal/dist/esm/events.enum'
import { TerminalConnectTypes } from '@capgo/capacitor-stripe-terminal/dist/esm/stripe.enum'
import type { StripeTerminalConfig } from './stripe-connector'
import { supabase } from '@/lib/supabase'
import { createStripeConnectionToken, createStripeLocation, listStripeLocations, logTapToPayTrace } from './stripe-terminal-api'

export function isAndroidNative() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

export function tapToPaySupported() {
  return isAndroidNative()
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s. If ColorOS asked for Location, tap Allow and try Charge again.`))
    }, ms)
    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        window.clearTimeout(timer)
        reject(error)
      },
    )
  })
}

export async function requestLocationForTapToPay() {
  return Promise.resolve()
}

function describeError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message
  if (typeof error === 'string' && error.trim()) return error
  if (error && typeof error === 'object') {
    const record = error as { message?: unknown; error?: unknown }
    if (typeof record.message === 'string' && record.message.trim()) return record.message
    if (typeof record.error === 'string' && record.error.trim()) return record.error
  }
  return fallback
}

const LOCATION_CACHE_KEY = 'fran-pos.stripe.location_id'

function readCachedLocationId() {
  try {
    return localStorage.getItem(LOCATION_CACHE_KEY) || ''
  } catch {
    return ''
  }
}

function writeCachedLocationId(locationId: string) {
  if (!locationId) return
  try {
    localStorage.setItem(LOCATION_CACHE_KEY, locationId)
  } catch {
    // Capacitor WebView storage can throw.
  }
}

function clearCachedLocationId() {
  try {
    localStorage.removeItem(LOCATION_CACHE_KEY)
  } catch {
    // Capacitor WebView storage can throw.
  }
}

export async function resolveTapToPayConfig(config: StripeTerminalConfig | null): Promise<StripeTerminalConfig> {
  const session = await Promise.race([
    supabase.auth.getSession(),
    new Promise<null>((resolve) => {
      window.setTimeout(() => resolve(null), 4000)
    }),
  ])
  if (!session?.data?.session?.access_token) {
    throw new Error('Google is signed in to the app, but Stripe did not get a session token. Live mode → Use another Google account, then Continue with Google.')
  }

  if (config?.enabled && config.location_id) {
    writeCachedLocationId(config.location_id)
    return { ...config, simulated: false }
  }

  let locationId = config?.location_id || ''
  if (!locationId) {
    locationId = readCachedLocationId()
  }
  if (!locationId) {
    const listed = await listStripeLocations()
    const locations = Array.isArray(listed?.locations) ? listed.locations : []
    locationId = locations[0]?.id || ''
  }
  if (!locationId) {
    const created = await createStripeLocation({ display_name: 'Fran POS' })
    locationId = created?.location?.id || ''
  }
  if (!locationId) {
    throw new Error('Could not find or create a Stripe Terminal location. Open Settings → Integrations and save a Location ID.')
  }

  writeCachedLocationId(locationId)

  return {
    enabled: true,
    simulated: false,
    location_id: locationId,
    s700_reader_id: config?.s700_reader_id || '',
    merchant_display_name: config?.merchant_display_name || 'Fran POS',
    default_reader: 'tap_to_pay',
    updated_at: config?.updated_at,
  }
}

let tokenListenerAttached = false
let ensureInFlight: Promise<void> | null = null

// NEVER await this or return its result from an async function. The Capacitor
// plugin proxy fabricates a method for every property — including `then` — so
// resolving a promise with it calls StripeTerminal.then(resolve, reject) as a
// native method that never invokes either callback: the await hangs forever.
function terminalApi() {
  let available = false
  try {
    available = Capacitor.isPluginAvailable('StripeTerminal')
  } catch (error) {
    logTapToPayTrace(`plugin availability check threw: ${describeError(error, 'unknown')}`)
  }
  if (!tapToPaySupported() || !available || !StripeTerminal) {
    throw new Error('Stripe Tap to Pay plugin is missing from this app install. Reinstall the Fran POS APK.')
  }
  return StripeTerminal
}

let prefetchedConnectionToken = ''

async function provideConnectionToken(locationId?: string) {
  const terminal = terminalApi()
  try {
    const ready = prefetchedConnectionToken
    prefetchedConnectionToken = ''
    const token = ready || (await createStripeConnectionToken(locationId))?.secret || ''
    await terminal.setConnectionToken({ token })
  } catch (error) {
    await terminal.setConnectionToken({ token: '' }).catch(() => {})
    console.error(error)
  }
}

export async function initTapToPay(config: StripeTerminalConfig, onStatus?: (message: string) => void) {
  const status = (message: string) => {
    onStatus?.(message)
    logTapToPayTrace(message)
  }

  if (tokenListenerAttached) {
    status('2/5 Stripe is already running on this phone.')
    return
  }

  status('2/5 Requesting a Stripe connection token…')
  prefetchedConnectionToken = (await createStripeConnectionToken(config.location_id))?.secret || ''
  if (!prefetchedConnectionToken) {
    throw new Error('Stripe did not return a connection token. Sign in again from Live mode and retry Charge.')
  }

  status('3/5 Checking the Tap to Pay plugin…')
  const terminal = terminalApi()

  if (!tokenListenerAttached) {
    status('3/5 Attaching the Stripe token listener…')
    await withTimeout(
      terminal.addListener(TerminalEventsEnum.RequestedConnectionToken, async () => {
        await provideConnectionToken(config.location_id)
      }),
      5000,
      'Stripe token listener',
    )
    tokenListenerAttached = true
  }

  status('3/5 Starting Stripe on this phone (initialize)…')
  try {
    await withTimeout(
      terminal.initialize({ isTest: false }),
      10_000,
      'Opening Stripe Tap to Pay',
    )
  } catch (error) {
    const message = describeError(error, '')
    if (!/already initialized/i.test(message)) throw error
  }
  status('3/5 Stripe is running. Configuring the tap screen…')

  await withTimeout(
    terminal.setTapToPayUxConfiguration({
      colors: {
        primary: '#FFE14D',
        success: '#2D8A5E',
        error: '#C43A3A',
      },
      darkMode: TapToPayDarkMode.Light,
      tapZone: { type: 'default' },
    }).catch(() => {}),
    4000,
    'Tap to Pay screen setup',
  ).catch(() => {})
  // Deliberately returns nothing: returning the plugin proxy from an async
  // function trips the thenable trap described on terminalApi.
}

async function discoverTapToPayReader(terminal: ReturnType<typeof terminalApi>, locationId: string) {
  type Reader = { serialNumber?: string }
  await withTimeout(terminal.cancelDiscoverReaders().catch(() => {}), 3000, 'Cancel previous reader scan').catch(() => {})

  return new Promise<Reader>((resolve, reject) => {
    let settled = false
    let handle: { remove: () => Promise<void> } | null = null
    const finish = (error: Error | null, reader?: Reader) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      void handle?.remove().catch(() => {})
      void terminal.cancelDiscoverReaders().catch(() => {})
      if (error || !reader) reject(error || new Error('No Tap to Pay reader on this phone.'))
      else resolve(reader)
    }

    const timer = window.setTimeout(() => {
      finish(new Error('Stripe did not find Tap to Pay on this phone. This release must be signed with the Fran POS keystore, Developer options must stay off, and NFC must stay on.'))
    }, 15_000)

    void terminal.addListener(TerminalEventsEnum.DiscoveredReaders, (event: { readers?: Reader[] }) => {
      const readers = Array.isArray(event?.readers) ? event.readers : []
      if (readers[0]) finish(null, readers[0])
    }).then((listener) => {
      handle = listener
    }).catch((error) => finish(error instanceof Error ? error : new Error(describeError(error, 'Reader listener failed'))))

    void terminal.discoverReaders({
      type: TerminalConnectTypes.TapToPay,
      locationId,
    }).then((result) => {
      const readers = Array.isArray(result?.readers) ? result.readers : []
      if (readers[0]) finish(null, readers[0])
    }).catch((error) => finish(error instanceof Error ? error : new Error(describeError(error, 'Reader scan failed'))))
  })
}

export async function ensureTapToPayReady(input: {
  config: StripeTerminalConfig
  onStatus?: (message: string) => void
}) {
  if (!input.config.location_id) throw new Error('Set a Stripe Terminal location before using Tap to Pay')
  if (ensureInFlight) return ensureInFlight

  ensureInFlight = (async () => {
    const terminal = terminalApi()
    if (tokenListenerAttached) {
      const already = await withTimeout(
        terminal.getConnectedReader().catch(() => ({ reader: null })),
        4000,
        'Checking the connected reader',
      ).catch(() => ({ reader: null }))
      if (already?.reader) {
        input.onStatus?.('Reader already connected — ready.')
        logTapToPayTrace('tap reuse connected reader')
        return
      }
    }

    try {
      await initTapToPay(input.config, input.onStatus)
      const readyTerminal = terminalApi()

      input.onStatus?.('4/5 Finding the NFC reader on this phone…')
      logTapToPayTrace('4/5 discover readers')
      const reader = await discoverTapToPayReader(readyTerminal, input.config.location_id)

      input.onStatus?.('5/5 Connecting this phone as the Stripe reader…')
      logTapToPayTrace('5/5 connect reader')
      await withTimeout(
        readyTerminal.connectReader({
          reader: reader as never,
          autoReconnectOnUnexpectedDisconnect: true,
          merchantDisplayName: input.config.merchant_display_name,
        }),
        15_000,
        'Connecting Tap to Pay',
      )
    } catch (error) {
      clearCachedLocationId()
      throw error
    }
    // Deliberately returns nothing — see the thenable trap note on terminalApi.
  })()

  try {
    await ensureInFlight
  } finally {
    ensureInFlight = null
  }
}

export async function collectTapToPay(input: {
  config: StripeTerminalConfig
  clientSecret: string
  onStatus?: (message: string) => void
}) {
  if (!input.clientSecret) throw new Error('Stripe did not return a client secret for Tap to Pay')

  try {
    // The caller (collectStripeInPerson) has already run ensureTapToPayReady;
    // re-running it here would disconnect and re-pair the reader for ~10s.
    const terminal = terminalApi()
    input.onStatus?.('Hold the iPhone or card to the back of the Oppo (camera side), not the inner screen.')
    await withTimeout(
      terminal.collectPaymentMethod({ paymentIntent: input.clientSecret }),
      90_000,
      'Waiting for the iPhone or card tap',
    )
    input.onStatus?.('Authorizing…')
    await withTimeout(terminal.confirmPaymentIntent(), 20_000, 'Authorizing the tap')
    logTapToPayTrace('tap confirmed')
  } catch (error) {
    const message = describeError(error, 'Tap to Pay failed')
    logTapToPayTrace(`tap error: ${message}`)
    await cancelTapToPay().catch(() => {})
    throw new Error(message)
  }
}

export async function cancelTapToPay() {
  if (!tapToPaySupported()) return
  await StripeTerminal?.cancelCollectPaymentMethod?.().catch(() => {})
  await StripeTerminal?.cancelDiscoverReaders?.().catch(() => {})
  await StripeTerminal?.disconnectReader?.().catch(() => {})
}

export function warmUpTapToPay(config: StripeTerminalConfig | null): void {
  if (!tapToPaySupported()) return
  void resolveTapToPayConfig(config)
    .then((resolved) => ensureTapToPayReady({ config: resolved }))
    .then(() => {
      logTapToPayTrace('warmup connected')
    })
    .catch((error) => {
      logTapToPayTrace('warmup: ' + describeError(error, 'warmup failed'))
    })
}
