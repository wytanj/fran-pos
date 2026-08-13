import Stripe from 'stripe'
import type { VercelRequest, VercelResponse } from '@vercel/node'

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET || ''
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set on the server')
  return new Stripe(key)
}

function json(res: VercelResponse, status: number, body: Record<string, unknown>) {
  res.status(status).json(body)
}

function readBearer(req: VercelRequest) {
  const header = req.headers.authorization || req.headers.Authorization
  if (typeof header !== 'string') return ''
  return header.startsWith('Bearer ') ? header.slice(7).trim() : header.trim()
}

async function requireUser(req: VercelRequest) {
  const token = readBearer(req)
  if (!token) throw new Error('Sign in to use Stripe Terminal')

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NUXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) throw new Error('Supabase auth is not configured for Stripe Terminal')

  const response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseKey,
    },
  })
  if (!response.ok) throw new Error('Stripe Terminal session is not valid')
  const user = await response.json()
  if (!user?.id) throw new Error('Stripe Terminal session is not valid')
  return user as { id: string; email?: string }
}

function mapPaymentIntent(pi: Stripe.PaymentIntent) {
  return {
    id: pi.id,
    client_secret: pi.client_secret,
    status: pi.status,
    amount: pi.amount,
    currency: pi.currency,
    latest_charge: typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge?.id || null,
  }
}

function assertReader(reader: Stripe.Terminal.Reader | Stripe.Terminal.DeletedReader): Stripe.Terminal.Reader {
  if ('deleted' in reader && reader.deleted) {
    throw new Error('That Stripe reader was deleted. Register the S700 again.')
  }
  return reader
}

function mapReader(reader: Stripe.Terminal.Reader | Stripe.Terminal.DeletedReader) {
  reader = assertReader(reader)
  const action = reader.action
  const processPi = action && 'process_payment_intent' in action ? action.process_payment_intent : null
  return {
    id: reader.id,
    label: reader.label,
    status: reader.status,
    device_type: reader.device_type,
    action_status: action?.status || null,
    action_type: action?.type || null,
    failure_code: action?.failure_code || null,
    failure_message: action?.failure_message || null,
    payment_intent_id:
      processPi && typeof processPi.payment_intent === 'string'
        ? processPi.payment_intent
        : processPi && processPi.payment_intent && typeof processPi.payment_intent === 'object'
          ? processPi.payment_intent.id
          : null,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return json(res, 405, { error: 'Use POST' })

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const action = String(body.action || '')
    if (action === 'health') {
      const stripe = getStripe()
      const account = await stripe.accounts.retrieve()
      return json(res, 200, {
        ok: true,
        livemode: Boolean(account.charges_enabled && !String(process.env.STRIPE_SECRET_KEY || '').startsWith('sk_test_')),
        simulated_ready: String(process.env.STRIPE_SECRET_KEY || '').startsWith('sk_test_'),
      })
    }

    await requireUser(req)
    const stripe = getStripe()

    if (action === 'connection_token') {
      const location = String(body.location_id || '').trim()
      const token = await stripe.terminal.connectionTokens.create(location ? { location } : {})
      return json(res, 200, { secret: token.secret })
    }

    if (action === 'create_payment_intent') {
      const amount = Number(body.amount)
      if (!Number.isInteger(amount) || amount < 50) {
        throw new Error('Amount must be at least 50 cents for card present')
      }
      const currency = String(body.currency || 'sgd').toLowerCase()
      const pi = await stripe.paymentIntents.create({
        amount,
        currency,
        payment_method_types: ['card_present'],
        capture_method: 'automatic',
        description: String(body.description || 'Fran POS in-person sale'),
        metadata: {
          source: 'fran-pos',
          ...(body.metadata && typeof body.metadata === 'object' ? body.metadata : {}),
        },
      })
      return json(res, 200, { payment_intent: mapPaymentIntent(pi) })
    }

    if (action === 'retrieve_payment_intent') {
      const pi = await stripe.paymentIntents.retrieve(String(body.id || ''))
      return json(res, 200, { payment_intent: mapPaymentIntent(pi) })
    }

    if (action === 'cancel_payment_intent') {
      const pi = await stripe.paymentIntents.cancel(String(body.id || ''))
      return json(res, 200, { payment_intent: mapPaymentIntent(pi) })
    }

    if (action === 'process_s700') {
      const readerId = String(body.readerId || body.reader_id || '')
      const paymentIntentId = String(body.paymentIntentId || body.payment_intent_id || '')
      if (!readerId || !paymentIntentId) throw new Error('S700 reader id and payment intent are required')
      const reader = await stripe.terminal.readers.processPaymentIntent(readerId, {
        payment_intent: paymentIntentId,
      })
      return json(res, 200, { reader: mapReader(reader) })
    }

    if (action === 'present_simulated_method') {
      const readerId = String(body.readerId || body.reader_id || '')
      if (!readerId) throw new Error('Reader id is required')
      const reader = await stripe.testHelpers.terminal.readers.presentPaymentMethod(readerId)
      return json(res, 200, { reader: mapReader(reader) })
    }

    if (action === 'reader_status') {
      const reader = await stripe.terminal.readers.retrieve(String(body.readerId || body.reader_id || ''))
      return json(res, 200, { reader: mapReader(reader) })
    }

    if (action === 'cancel_reader') {
      const reader = await stripe.terminal.readers.cancelAction(String(body.readerId || body.reader_id || ''))
      return json(res, 200, { reader: mapReader(reader) })
    }

    if (action === 'list_locations') {
      const locations = await stripe.terminal.locations.list({ limit: 50 })
      return json(res, 200, {
        locations: locations.data.map((location) => ({
          id: location.id,
          display_name: location.display_name,
        })),
      })
    }

    if (action === 'create_location') {
      const displayName = String(body.display_name || '').trim()
      if (!displayName) throw new Error('Location display name is required')
      const address = body.address && typeof body.address === 'object' ? body.address : {}
      const location = await stripe.terminal.locations.create({
        display_name: displayName,
        address: {
          line1: String(address.line1 || '1 Raffles Place'),
          city: String(address.city || 'Singapore'),
          postal_code: String(address.postal_code || '048616'),
          country: String(address.country || 'SG'),
        },
      })
      return json(res, 200, { location: { id: location.id, display_name: location.display_name } })
    }

    if (action === 'register_reader') {
      const registrationCode = String(body.registration_code || '').trim()
      const locationId = String(body.location_id || '').trim()
      if (!registrationCode || !locationId) throw new Error('Registration code and location are required')
      const reader = await stripe.terminal.readers.create({
        registration_code: registrationCode,
        location: locationId,
        label: String(body.label || 'Fran S700').trim() || 'Fran S700',
      })
      return json(res, 200, { reader: mapReader(reader) })
    }

    return json(res, 400, { error: `Unknown Stripe Terminal action: ${action}` })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Stripe Terminal request failed'
    const status = /not valid|Sign in/i.test(message) ? 401 : 400
    return json(res, status, { error: message })
  }
}
