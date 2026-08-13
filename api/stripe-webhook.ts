import Stripe from 'stripe'
import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = {
  api: { bodyParser: false },
}

async function rawBody(req: VercelRequest) {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST' })
    return
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET
  const key = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET
  if (!secret || !key) {
    res.status(500).json({ error: 'Stripe webhook is not configured' })
    return
  }

  try {
    const stripe = new Stripe(key)
    const signature = req.headers['stripe-signature']
    if (typeof signature !== 'string') throw new Error('Missing stripe-signature')
    const event = stripe.webhooks.constructEvent(await rawBody(req), signature, secret)

    if (
      event.type === 'payment_intent.succeeded' ||
      event.type === 'payment_intent.payment_failed' ||
      event.type === 'terminal.reader.action_succeeded' ||
      event.type === 'terminal.reader.action_failed' ||
      event.type === 'charge.refunded'
    ) {
      console.log(`stripe.webhook ${event.type} ${event.id}`)
    }

    res.status(200).json({ received: true, type: event.type })
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Webhook failed' })
  }
}
