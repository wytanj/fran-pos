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
import { cancelTapToPay, collectTapToPay } from './stripe-tap-to-pay'
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
  input.onStatus?.('Creating Stripe PaymentIntent…')
  const { payment_intent } = await createStripePaymentIntent({
    amount: input.amount,
    currency: input.currency,
    description: input.description,
    metadata: input.metadata,
  })

  try {
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

    const { payment_intent: finalIntent } = await retrieveStripePaymentIntent(payment_intent.id)
    if (finalIntent.status !== 'succeeded' && finalIntent.status !== 'requires_capture') {
      throw new Error(`Stripe payment ended as ${finalIntent.status}`)
    }
    return {
      paymentIntent: finalIntent,
      kind: input.kind,
      amount: stripeCentsToAmount(finalIntent.amount) || input.amount,
    }
  } catch (error) {
    await cancelStripeReader(input.config.s700_reader_id).catch(() => {})
    await cancelTapToPay().catch(() => {})
    await cancelStripePaymentIntent(payment_intent.id).catch(() => {})
    throw error
  }
}

export async function cancelStripeCollection(config: StripeTerminalConfig | null) {
  await cancelTapToPay().catch(() => {})
  if (config?.s700_reader_id) {
    await cancelStripeReader(config.s700_reader_id).catch(() => {})
  }
}
