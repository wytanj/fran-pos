import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function amountToStripeCents(amount) {
  if (!Number.isFinite(amount) || amount < 0) return 0
  return Math.round(amount * 100)
}

function stripeCurrencyCode(currency = 'SGD') {
  return String(currency || 'SGD').trim().toLowerCase() || 'sgd'
}

function toStripeTerminalConfig(settings) {
  const connector = settings?.pos_config?.stripe_terminal
  if (!connector?.enabled) return null
  return {
    enabled: true,
    simulated: Boolean(connector.simulated),
    location_id: (connector.location_id || '').trim(),
    s700_reader_id: (connector.s700_reader_id || '').trim(),
    merchant_display_name: (connector.merchant_display_name || 'Fran POS').trim() || 'Fran POS',
    default_reader: connector.default_reader || 's700',
  }
}

function preferredStoreChargeMode(config, tapReady) {
  if (config?.enabled) {
    if (config.default_reader === 'tap_to_pay' && tapReady) return 'stripe_tap'
    if (config.s700_reader_id) return 'stripe_s700'
    if (tapReady) return 'stripe_tap'
    return null
  }
  return tapReady ? 'stripe_tap' : null
}

function stripeS700Ready(config) {
  return Boolean(config?.enabled && config.s700_reader_id)
}

function visiblePaymentModes({ stripeEnabled, s700Ready, tapReady }) {
  const modes = ['cash', 'stripe_s700', 'stripe_tap', 'card', 'paynow']
  return modes.filter((id) => {
    if (id === 'stripe_s700') return stripeEnabled && s700Ready
    if (id === 'stripe_tap') return tapReady
    if (id === 'card') return !stripeEnabled && !tapReady
    return true
  })
}

test('SGD amounts convert to Stripe cents without float drift', () => {
  assert.equal(amountToStripeCents(38), 3800)
  assert.equal(amountToStripeCents(19.99), 1999)
  assert.equal(amountToStripeCents(0.5), 50)
  assert.equal(amountToStripeCents(-1), 0)
})

test('currency codes are lower-case Stripe values', () => {
  assert.equal(stripeCurrencyCode('SGD'), 'sgd')
  assert.equal(stripeCurrencyCode(''), 'sgd')
})

test('disabled Stripe connector stays off the register', () => {
  assert.equal(toStripeTerminalConfig({ pos_config: { stripe_terminal: { enabled: false, s700_reader_id: 'tmr_1' } } }), null)
})

test('S700 is ready only when enabled and a reader id exists', () => {
  const config = toStripeTerminalConfig({
    pos_config: {
      stripe_terminal: {
        enabled: true,
        simulated: true,
        location_id: 'tml_1',
        s700_reader_id: 'tmr_s700',
        merchant_display_name: 'Fran',
        default_reader: 's700',
      },
    },
  })
  assert.equal(stripeS700Ready(config), true)
  assert.equal(stripeS700Ready({ ...config, s700_reader_id: '' }), false)
})

test('payment sheet hides simulated card when Stripe is on', () => {
  assert.deepEqual(visiblePaymentModes({ stripeEnabled: false, s700Ready: false, tapReady: false }), ['cash', 'card', 'paynow'])
  assert.deepEqual(visiblePaymentModes({ stripeEnabled: false, s700Ready: false, tapReady: true }), ['cash', 'stripe_tap', 'paynow'])
  assert.deepEqual(visiblePaymentModes({ stripeEnabled: true, s700Ready: true, tapReady: false }), ['cash', 'stripe_s700', 'paynow'])
  assert.deepEqual(visiblePaymentModes({ stripeEnabled: true, s700Ready: true, tapReady: true }), ['cash', 'stripe_s700', 'stripe_tap', 'paynow'])
})

test('Galaxy Tab store kit charges the S700 first', () => {
  const config = {
    enabled: true,
    simulated: false,
    location_id: 'tml_1',
    s700_reader_id: 'tmr_s700',
    merchant_display_name: 'Fran',
    default_reader: 's700',
  }
  assert.equal(preferredStoreChargeMode(config, true), 'stripe_s700')
  assert.equal(preferredStoreChargeMode({ ...config, default_reader: 'tap_to_pay' }, true), 'stripe_tap')
  assert.equal(preferredStoreChargeMode({ ...config, s700_reader_id: '' }, true), 'stripe_tap')
  assert.equal(preferredStoreChargeMode(null, true), 'stripe_tap')
  assert.equal(toStripeTerminalConfig({ pos_config: { stripe_terminal: { enabled: true, s700_reader_id: 'tmr_1' } } }).default_reader, 's700')
})

test('tap to pay collects on the device NFC reader', () => {
  const collect = readFileSync(new URL('../dashboard/src/pos/lib/stripe-collect.ts', import.meta.url), 'utf8')
  const tap = readFileSync(new URL('../dashboard/src/pos/lib/stripe-tap-to-pay.ts', import.meta.url), 'utf8')
  const api = readFileSync(new URL('../dashboard/src/pos/lib/stripe-terminal-api.ts', import.meta.url), 'utf8')
  assert.match(collect, /collectTapToPay/)
  assert.match(collect, /ensureTapToPayReady/)
  assert.ok(collect.indexOf('ensureTapToPayReady') < collect.indexOf("Creating the Stripe test charge"))
  assert.doesNotMatch(collect, /ensureSimulatedReader/)
  assert.match(tap, /initialize\(\{ isTest: false \}\)/)
  assert.doesNotMatch(tap, /initialize\(\{ isTest: true \}\)/)
  assert.match(tap, /TerminalConnectTypes.TapToPay/)
  assert.match(tap, /DiscoveredReaders/)
  assert.match(tap, /getConnectedReader/)
  assert.match(tap, /prefetchedConnectionToken/)
  assert.match(tap, /2\/5 Requesting a Stripe connection token/)
  assert.match(tap, /3\/5 Checking the Tap to Pay plugin/)
  assert.match(tap, /3\/5 Starting Stripe on this phone/)
  assert.match(tap, /import \{ StripeTerminal \} from '@capgo\/capacitor-stripe-terminal'/)
  assert.doesNotMatch(tap, /import\('@capgo\/capacitor-stripe-terminal'\)/)
  assert.match(tap, /logTapToPayTrace/)
  // The Capacitor plugin proxy fabricates a `then` method, so resolving a promise
  // with it hangs forever. Never await it or return it from an async function.
  assert.doesNotMatch(tap, /await terminalApi\(/)
  assert.doesNotMatch(tap, /return terminal\b/)
  assert.match(tap, /function terminalApi\(\)/)
  assert.doesNotMatch(tap, /async function terminalApi/)
  assert.match(tap, /cancelDiscoverReaders/)
  assert.match(tap, /Developer options must stay off/)
  assert.match(api, /Promise\.race\(\[fetchPromise, timeoutPromise\]\)/)
  assert.match(api, /clearStripeAuthCache/)
  const server = readFileSync(new URL('../api/stripe-terminal.ts', import.meta.url), 'utf8')
  assert.match(server, /stripe_terminal_action/)
  assert.match(server, /Could not verify the Google session/)
})

test('paynow and wechat show a full-screen stripe qr and poll until paid', () => {
  const server = readFileSync(new URL('../api/stripe-terminal.ts', import.meta.url), 'utf8')
  assert.match(server, /create_qr_payment_intent/)
  assert.match(server, /paynow_display_qr_code/)
  assert.match(server, /wechat_pay_display_qr_code/)
  assert.match(server, /QR method must be paynow or wechat_pay/)

  const api = readFileSync(new URL('../dashboard/src/pos/lib/stripe-terminal-api.ts', import.meta.url), 'utf8')
  assert.match(api, /createStripeQrPaymentIntent/)
  assert.match(api, /waitForQrPayment/)
  assert.match(api, /requires_payment_method/)

  const modal = readFileSync(new URL('../dashboard/src/pos/components/payment-modal.tsx', import.meta.url), 'utf8')
  assert.match(modal, /runQrCharge/)
  assert.match(modal, /QrPaymentOverlay/)
  // The old fake tender that recorded PayNow without any Stripe payment is gone.
  assert.doesNotMatch(modal, /commit\('PayNow QR'/)

  const overlay = readFileSync(new URL('../dashboard/src/pos/components/qr-payment-overlay.tsx', import.meta.url), 'utf8')
  assert.match(overlay, /createPortal/)
  assert.match(overlay, /QR valid for/)
  assert.match(overlay, /Payment received/)
})
