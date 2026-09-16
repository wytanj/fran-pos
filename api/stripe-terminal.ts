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

function looksLikeJwt(token: string) {
  return token.split('.').length === 3
}

function readDeviceTokenHeader(req: VercelRequest) {
  const raw = req.headers['x-pos-device-token'] || req.headers['X-Pos-Device-Token']
  return typeof raw === 'string' ? raw.trim() : Array.isArray(raw) ? String(raw[0] || '').trim() : ''
}

async function assertRegisterDevice(deviceToken: string) {
  if (deviceToken.length < 8) throw new Error('Register device token is missing or too short')
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NUXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '')
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
  if (!supabaseUrl || (!serviceKey && !anonKey)) {
    throw new Error('Supabase is not configured for register device auth')
  }
  const key = serviceKey || anonKey
  const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/get_pos_register_company_context`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ p_device_token: deviceToken }),
  })
  const text = await rpcRes.text()
  let parsed: any = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = null
  }
  if (rpcRes.ok && parsed && typeof parsed === 'object' && (parsed.company_id || parsed.company?.id)) {
    return {
      kind: 'device' as const,
      device_token: deviceToken,
      company_id: String(parsed.company_id || parsed.company.id),
      store_code: parsed.store_code ? String(parsed.store_code) : null,
    }
  }

  if (serviceKey) {
    const deviceRes = await fetch(
      `${supabaseUrl}/rest/v1/pos_register_devices?device_token=eq.${encodeURIComponent(deviceToken)}&revoked_at=is.null&select=device_token,store_code,register_id,company_id&limit=1`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    )
    const rows = (await deviceRes.json().catch(() => [])) as any[]
    const row = Array.isArray(rows) ? rows[0] : null
    if (deviceRes.ok && row?.company_id) {
      return {
        kind: 'device' as const,
        device_token: deviceToken,
        company_id: String(row.company_id),
        store_code: row.store_code ? String(row.store_code) : null,
      }
    }
  }

  throw new Error(
    (parsed && (parsed.message || parsed.error || parsed.hint)) ||
      text ||
      'Unknown or revoked register device. Re-bind this tablet.',
  )
}

async function requireGoogleUser(token: string) {
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
  return { kind: 'user' as const, id: String(user.id), email: user.email ? String(user.email) : undefined }
}

/** Google JWT (HQ web) or bound register device_token (PIN-only S10). */
async function requireAuth(req: VercelRequest) {
  const bearer = readBearer(req)
  const headerDevice = readDeviceTokenHeader(req)
  const deviceToken = headerDevice || (bearer && !looksLikeJwt(bearer) ? bearer : '')

  if (deviceToken) {
    return assertRegisterDevice(deviceToken)
  }

  if (bearer && looksLikeJwt(bearer)) {
    return requireGoogleUser(bearer)
  }

  throw new Error('Unlock with a bound register PIN, or Continue with Google, to use Stripe Terminal')
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
  const collect = action?.type === 'collect_inputs' && 'collect_inputs' in action ? action.collect_inputs : null
  return {
    collected_inputs: collect
      ? (collect.inputs || []).map((inp) => ({
          type: inp.type,
          skipped: Boolean(inp.skipped),
          selection_id: inp.selection?.id ?? null,
          value:
            inp.selection?.text ??
            inp.phone?.value ??
            inp.email?.value ??
            inp.numeric?.value ??
            inp.text?.value ??
            (inp.signature?.value ? '(signature captured)' : null),
        }))
      : null,
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
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type, x-pos-device-token')
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

    await requireAuth(req)
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

    if (action === 'collect_inputs') {
      const readerId = String(body.readerId || body.reader_id || '').trim()
      if (!readerId) throw new Error('Reader id is required')
      const form = String(body.form || '').trim()
      const forms: Record<string, Stripe.Terminal.ReaderCollectInputsParams.Input[]> = {
        // Customers see big stacked buttons; the cashier's POS carries the
        // detail. Keep titles short, skip descriptions, and cap choices at
        // 2-3 so Stripe renders each button as large as possible.
        rewards_optin: [
          {
            type: 'selection',
            custom_text: {
              title: 'Join Fran Rewards?',
              skip_button: 'Skip',
            },
            selection: {
              choices: [
                { id: 'join', style: 'primary', text: 'Yes' },
                { id: 'decline', style: 'secondary', text: 'No' },
              ],
            },
          },
        ],
        phone: [
          {
            type: 'phone',
            custom_text: {
              title: 'Your mobile number',
              submit_button: 'Done',
            },
          },
        ],
        // Two-step international lookup: the built-in phone widget is locked to
        // the location country (+65), so country choice is a big two-button
        // selection, and international numbers come in as free text.
        member_country: [
          {
            type: 'selection',
            custom_text: {
              title: 'Member lookup',
              skip_button: 'Not a member',
            },
            selection: {
              choices: [
                { id: 'sg', style: 'primary', text: 'Singapore +65' },
                { id: 'intl', style: 'secondary', text: 'International' },
              ],
            },
          },
        ],
        intl_phone: [
          {
            type: 'text',
            custom_text: {
              title: 'Number with country code',
              submit_button: 'Done',
            },
          },
        ],
        // Country picker, Stripe-style: selections cap at 4 choices per screen,
        // so common countries page across two screens and "Other" falls back to
        // free-text entry. The number itself comes via the numeric keypad and
        // the app composes the E.164 string.
        intl_country_1: [
          {
            type: 'selection',
            custom_text: {
              title: 'Country',
              skip_button: 'Cancel',
            },
            selection: {
              choices: [
                { id: 'my', style: 'primary', text: 'Malaysia +60' },
                { id: 'cn', style: 'primary', text: 'China +86' },
                { id: 'id', style: 'primary', text: 'Indonesia +62' },
                { id: 'more', style: 'secondary', text: 'More countries' },
              ],
            },
          },
        ],
        intl_country_2: [
          {
            type: 'selection',
            custom_text: {
              title: 'Country',
              skip_button: 'Cancel',
            },
            selection: {
              choices: [
                { id: 'in', style: 'primary', text: 'India +91' },
                { id: 'jp', style: 'primary', text: 'Japan +81' },
                { id: 'kr', style: 'primary', text: 'South Korea +82' },
                { id: 'other', style: 'secondary', text: 'Other country' },
              ],
            },
          },
        ],
        intl_number: [
          {
            type: 'numeric',
            custom_text: {
              title: 'Mobile number',
              description: 'Without the country code',
              submit_button: 'Done',
            },
          },
        ],
        rating: [
          {
            type: 'selection',
            custom_text: {
              title: 'Rate your visit',
              skip_button: 'Skip',
            },
            selection: {
              choices: [
                { id: 'great', style: 'primary', text: 'Great' },
                { id: 'okay', style: 'secondary', text: 'Okay' },
                { id: 'poor', style: 'secondary', text: 'Poor' },
              ],
            },
          },
        ],
        receipt_email: [
          {
            type: 'email',
            custom_text: {
              title: 'Email for e-receipt',
              submit_button: 'Send',
            },
          },
        ],
      }
      const baseInputs = forms[form]
      if (!baseInputs) throw new Error(`Unknown collect_inputs form: ${form || '(missing)'}`)
      // Optional dynamic title (e.g. "Hong Kong +852 mobile number") so the
      // reader screen names the register-side country choice. 40-char API cap.
      const titleOverride = String(body.title || '').trim().slice(0, 40)
      const inputs = titleOverride
        ? baseInputs.map((input, index) =>
            index === 0 ? { ...input, custom_text: { ...input.custom_text, title: titleOverride } } : input,
          )
        : baseInputs
      const reader = await stripe.terminal.readers.collectInputs(readerId, {
        inputs,
        metadata: { source: 'fran-pos', form },
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
