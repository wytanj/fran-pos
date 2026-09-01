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

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  let response: Response
  try {
    response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseKey,
      },
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Could not verify the Google session with Supabase. Try Charge again.')
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
  if (!response.ok) throw new Error('Stripe Terminal session is not valid. Sign out and Continue with Google again.')
  const user = await response.json()
  if (!user?.id) throw new Error('Stripe Terminal session is not valid. Sign out and Continue with Google again.')
  return user as { id: string; email?: string }
}

function publicErrorMessage(error: unknown) {
  if (error && typeof error === 'object') {
    const record = error as { raw?: { message?: string }; message?: string }
    if (typeof record.raw?.message === 'string' && record.raw.message.trim()) return record.raw.message
    if (typeof record.message === 'string' && record.message.trim()) return record.message
  }
  if (error instanceof Error && error.message.trim()) return error.message
  return 'Stripe Terminal request failed'
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
  if ((reader as Stripe.Terminal.DeletedReader).deleted) {
    throw new Error('That Stripe reader was deleted. Register the S700 again.')
  }
  return reader as Stripe.Terminal.Reader
}

function mapReader(input: Stripe.Terminal.Reader | Stripe.Terminal.DeletedReader) {
  const reader = assertReader(input)
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
    console.log(JSON.stringify({
      stripe_terminal_action: action || 'missing',
      ...(action === 'client_log' ? { note: String(body.note || '').slice(0, 500) } : {}),
    }))
    if (action === 'client_log') {
      return json(res, 200, { ok: true })
    }
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
      // The reader can also display QR methods (PayNow / WeChat Pay) on its own
      // screen; both require automatic capture, which this intent already uses.
      const allowedTypes = new Set(['card_present', 'paynow', 'wechat_pay'])
      const requestedTypes = Array.isArray(body.payment_method_types)
        ? body.payment_method_types.map(String).filter((t: string) => allowedTypes.has(t))
        : []
      const pi = await stripe.paymentIntents.create({
        amount,
        currency,
        payment_method_types: requestedTypes.length ? requestedTypes : ['card_present'],
        capture_method: 'automatic',
        description: String(body.description || 'Fran POS in-person sale'),
        metadata: {
          source: 'fran-pos',
          ...(body.metadata && typeof body.metadata === 'object' ? body.metadata : {}),
        },
      })
      return json(res, 200, { payment_intent: mapPaymentIntent(pi) })
    }

    if (action === 'create_qr_payment_intent') {
      const method = String(body.method || '')
      if (method !== 'paynow' && method !== 'wechat_pay') {
        throw new Error('QR method must be paynow or wechat_pay')
      }
      const amount = Number(body.amount)
      if (!Number.isInteger(amount) || amount < 50) {
        throw new Error('Amount must be at least 50 cents for a QR payment')
      }
      const currency = String(body.currency || 'sgd').toLowerCase()
      const pi = await stripe.paymentIntents.create({
        amount,
        currency,
        payment_method_types: [method],
        payment_method_data: { type: method },
        ...(method === 'wechat_pay' ? { payment_method_options: { wechat_pay: { client: 'web' } } } : {}),
        confirm: true,
        description: String(body.description || 'Fran POS QR sale'),
        metadata: {
          source: 'fran-pos',
          ...(body.metadata && typeof body.metadata === 'object' ? body.metadata : {}),
        },
      } as Stripe.PaymentIntentCreateParams)
      const nextAction = pi.next_action as unknown as {
        paynow_display_qr_code?: { data?: string; image_url_png?: string; image_url_svg?: string; hosted_instructions_url?: string }
        wechat_pay_display_qr_code?: { data?: string; image_url_png?: string; image_url_svg?: string; hosted_instructions_url?: string }
      } | null
      const qr = nextAction?.paynow_display_qr_code || nextAction?.wechat_pay_display_qr_code || null
      return json(res, 200, {
        payment_intent: mapPaymentIntent(pi),
        qr: qr
          ? {
              data: qr.data || '',
              image_url_png: qr.image_url_png || '',
              image_url_svg: qr.image_url_svg || '',
              hosted_instructions_url: qr.hosted_instructions_url || '',
            }
          : null,
      })
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

    if (action === 'ensure_simulated_reader') {
      const locationId = String(body.location_id || '').trim()
      if (!locationId) throw new Error('Location is required for a Stripe test reader')
      const existing = await stripe.terminal.readers.list({ location: locationId, limit: 50 })
      const already =
        existing.data.find((reader) => /simulat/i.test(String(reader.label || ''))) ||
        existing.data.find((reader) => reader.device_type === 'simulated_wisepos_e') ||
        existing.data[0]
      if (already) return json(res, 200, { reader: mapReader(already) })
      const reader = await stripe.terminal.readers.create({
        registration_code: 'simulated-wpe',
        location: locationId,
        label: 'Fran simulated test reader',
      })
      return json(res, 200, { reader: mapReader(reader) })
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
    const message = publicErrorMessage(error)
    console.error(JSON.stringify({ stripe_terminal_error: message }))
    const status = /not valid|Sign in/i.test(message) ? 401 : 400
    return json(res, status, { error: message })
  }
}
