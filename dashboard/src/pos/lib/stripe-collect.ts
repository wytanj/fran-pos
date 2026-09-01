import type { StripeTerminalConfig } from './stripe-connector'
import {
  cancelStripePaymentIntent,
  cancelStripeReader,
  createStripePaymentIntent,
  presentSimulatedPaymentMethod,
  processS700Payment,
  retrieveStripePaymentIntent,
  waitForS700Action,
  type StripePaymentIntentResult,
} from './stripe-terminal-api'
import { cancelTapToPay, collectTapToPay, ensureTapToPayReady } from './stripe-tap-to-pay'
import { stripeCentsToAmount } from './stripe-money'

export type StripeCollectKind = 's700' | 'tap_to_pay'

export interface StripeCollectResult {
  paymentIntent: StripePaymentIntentResult
  kind: StripeCollectKind
  amount: number
  last4?: string | null
}

export async function collectStripeInPerson(input: {
  kind: StripeCollectKind
  config: StripeTerminalConfig
  amount: number
  currency: string
  description?: string
  metadata?: Record<string, string>
  onStatus?: (message: string) => void
}): Promise<StripeCollectResult> {
  let payment_intent: StripePaymentIntentResult | undefined

  try {
    if (input.kind === 'tap_to_pay') {
      input.onStatus?.('1/5 Checking the Google session for Stripe…')
      const piPromise = createStripePaymentIntent({
        amount: input.amount,
        currency: input.currency,
        description: input.description,
        metadata: input.metadata,
      })
      piPromise.then((r) => { payment_intent = r?.payment_intent }).catch(() => {})
      await ensureTapToPayReady({ config: input.config, onStatus: input.onStatus })
      input.onStatus?.('Creating the Stripe test charge…')
      const created = await piPromise
      payment_intent = created?.payment_intent
    } else {
      input.onStatus?.('Creating the Stripe test charge…')
      const created = await createStripePaymentIntent({
        amount: input.amount,
        currency: input.currency,
        description: input.description,
        metadata: input.metadata,
      })
      payment_intent = created?.payment_intent
    }
    if (!payment_intent?.id) throw new Error('Stripe did not return a PaymentIntent. Check the Google session and try again.')

    if (input.kind === 's700') {
      if (!input.config.s700_reader_id) throw new Error('Register an S700 reader id in Settings → Integrations')
      input.onStatus?.('Sending the sale to the S700…')
      await processS700Payment({
        readerId: input.config.s700_reader_id,
        paymentIntentId: payment_intent.id,
      })
      if (input.config.simulated) {
        input.onStatus?.('Presenting simulated card on the test reader…')
        await presentSimulatedPaymentMethod(input.config.s700_reader_id)
      } else {
        input.onStatus?.('Ask the customer to tap, insert, or swipe on the S700…')
      }
      await waitForS700Action(input.config.s700_reader_id)
    } else {
      if (!payment_intent.client_secret) throw new Error('Stripe did not return a client secret for Tap to Pay')
      await collectTapToPay({
        config: input.config,
        clientSecret: payment_intent.client_secret,
        onStatus: input.onStatus,
      })
    }

    const retrieved = await retrieveStripePaymentIntent(payment_intent.id)
    const finalIntent = retrieved?.payment_intent
    if (!finalIntent?.id) throw new Error('Stripe did not return the finished PaymentIntent')
    if (finalIntent.status !== 'succeeded' && finalIntent.status !== 'requires_capture') {
      throw new Error(`Stripe payment ended as ${finalIntent.status}`)
    }
    return {
      paymentIntent: finalIntent,
      kind: input.kind,
      amount: stripeCentsToAmount(finalIntent.amount) || input.amount,
    }
  } catch (error) {
    if (input.config.s700_reader_id) {
      await cancelStripeReader(input.config.s700_reader_id).catch(() => {})
    }
    await cancelTapToPay().catch(() => {})
    if (payment_intent?.id) {
      await cancelStripePaymentIntent(payment_intent.id).catch(() => {})
    }
    throw error
  }
}

export async function cancelStripeCollection(config: StripeTerminalConfig | null) {
  await cancelTapToPay().catch(() => {})
  if (config?.s700_reader_id) {
    await cancelStripeReader(config.s700_reader_id).catch(() => {})
  }
}

// Thrown when the S700 never started displaying the QR, so the caller can fall
// back to the on-screen QR flow without double-charging.
export class S700QrStartError extends Error {}

// Shows a PayNow / WeChat Pay QR on the S700's own screen (server-driven).
// The customer scans the reader, finishes in their banking app, and the reader
// action succeeds once Stripe sees the payment. Simulated readers can't display
// QR methods, so callers should expect S700QrStartError and fall back.
export async function collectS700Qr(input: {
  config: StripeTerminalConfig
  method: 'paynow' | 'wechat_pay'
  amount: number
  currency: string
  description?: string
  metadata?: Record<string, string>
  onStatus?: (message: string) => void
  onDisplaying?: () => void
  shouldStop?: () => boolean
}): Promise<StripePaymentIntentResult> {
  const readerId = input.config.s700_reader_id
  if (!input.config.enabled || !readerId) throw new S700QrStartError('No S700 reader configured')
  if (input.config.simulated) throw new S700QrStartError('Simulated readers cannot display QR payments')

  let payment_intent: StripePaymentIntentResult | undefined
  let displaying = false
  try {
    input.onStatus?.('Creating the Stripe charge…')
    const created = await createStripePaymentIntent({
      amount: input.amount,
      currency: input.currency,
      description: input.description,
      metadata: input.metadata,
      paymentMethodTypes: [input.method],
    })
    payment_intent = created?.payment_intent
    if (!payment_intent?.id) throw new S700QrStartError('Stripe did not return a PaymentIntent')

    try {
      input.onStatus?.('Sending the QR to the S700…')
      await processS700Payment({ readerId, paymentIntentId: payment_intent.id })
    } catch (error) {
      throw new S700QrStartError(error instanceof Error ? error.message : 'The S700 could not start the QR payment')
    }
    displaying = true
    input.onDisplaying?.()
    input.onStatus?.('Ask the customer to scan the QR on the S700…')
    await waitForS700Action(readerId, { timeoutMs: 300_000, shouldStop: input.shouldStop })

    const retrieved = await retrieveStripePaymentIntent(payment_intent.id)
    const finalIntent = retrieved?.payment_intent
    if (!finalIntent?.id) throw new Error('Stripe did not return the finished PaymentIntent')
    if (finalIntent.status !== 'succeeded') {
      throw new Error(`Stripe payment ended as ${finalIntent.status}`)
    }
    return finalIntent
  } catch (error) {
    if (displaying) {
      await cancelStripeReader(readerId).catch(() => {})
    }
    if (payment_intent?.id) {
      await cancelStripePaymentIntent(payment_intent.id).catch(() => {})
    }
    throw error
  }
}
