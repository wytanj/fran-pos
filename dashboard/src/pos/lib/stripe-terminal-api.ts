import { supabase } from '@/lib/supabase'
import { amountToStripeCents, stripeCurrencyCode } from './stripe-money'

export type StripeTerminalAction =
  | 'connection_token'
  | 'create_payment_intent'
  | 'retrieve_payment_intent'
  | 'process_s700'
  | 'present_simulated_method'
  | 'reader_status'
  | 'cancel_reader'
  | 'cancel_payment_intent'
  | 'register_reader'
  | 'list_locations'
  | 'create_location'
  | 'health'

export interface StripePaymentIntentResult {
  id: string
  client_secret: string
  status: string
  amount: number
  currency: string
  latest_charge?: string | null
}

export interface StripeReaderStatus {
  id: string
  label: string | null
  status: string | null
  device_type: string | null
  action_status: string | null
  action_type: string | null
  failure_code?: string | null
  failure_message?: string | null
  payment_intent_id?: string | null
}

export interface StripeLocationRow {
  id: string
  display_name: string | null
}

async function authHeaders() {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

function apiUrl() {
  const base = (import.meta.env.VITE_STRIPE_API_BASE || '').trim().replace(/\/+$/, '')
  return `${base}/api/stripe-terminal`
}

export async function callStripeTerminal<T>(action: StripeTerminalAction, body: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(apiUrl(), {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ action, ...body }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = typeof payload?.error === 'string' ? payload.error : `Stripe Terminal ${action} failed (${response.status})`
    throw new Error(message)
  }
  return payload as T
}

export function createStripePaymentIntent(input: {
  amount: number
  currency?: string
  description?: string
  metadata?: Record<string, string>
}) {
  return callStripeTerminal<{ payment_intent: StripePaymentIntentResult }>('create_payment_intent', {
    amount: amountToStripeCents(input.amount),
    currency: stripeCurrencyCode(input.currency),
    description: input.description || 'Fran POS in-person sale',
    metadata: input.metadata || {},
  })
}

export function retrieveStripePaymentIntent(id: string) {
  return callStripeTerminal<{ payment_intent: StripePaymentIntentResult }>('retrieve_payment_intent', { id })
}

export function processS700Payment(input: { readerId: string; paymentIntentId: string }) {
  return callStripeTerminal<{ reader: StripeReaderStatus }>('process_s700', input)
}

export function presentSimulatedPaymentMethod(readerId: string) {
  return callStripeTerminal<{ reader: StripeReaderStatus }>('present_simulated_method', { readerId })
}

export function getStripeReaderStatus(readerId: string) {
  return callStripeTerminal<{ reader: StripeReaderStatus }>('reader_status', { readerId })
}

export function cancelStripeReader(readerId: string) {
  return callStripeTerminal<{ reader: StripeReaderStatus }>('cancel_reader', { readerId })
}

export function cancelStripePaymentIntent(id: string) {
  return callStripeTerminal<{ payment_intent: StripePaymentIntentResult }>('cancel_payment_intent', { id })
}

export function createStripeConnectionToken(locationId?: string) {
  return callStripeTerminal<{ secret: string }>('connection_token', { location_id: locationId || '' })
}

export function listStripeLocations() {
  return callStripeTerminal<{ locations: StripeLocationRow[] }>('list_locations')
}

export function createStripeLocation(input: { display_name: string; address?: Record<string, string> }) {
  return callStripeTerminal<{ location: StripeLocationRow }>('create_location', input)
}

export function registerStripeReader(input: { registration_code: string; location_id: string; label?: string }) {
  return callStripeTerminal<{ reader: StripeReaderStatus }>('register_reader', input)
}

export function stripeTerminalHealth() {
  return callStripeTerminal<{ ok: boolean; livemode: boolean; simulated_ready: boolean }>('health')
}

export async function waitForS700Action(readerId: string, options?: { timeoutMs?: number; intervalMs?: number }) {
  const timeoutMs = options?.timeoutMs ?? 120_000
  const intervalMs = options?.intervalMs ?? 1500
  const started = Date.now()
  let last: StripeReaderStatus | null = null

  while (Date.now() - started < timeoutMs) {
    const { reader } = await getStripeReaderStatus(readerId)
    last = reader
    if (reader.action_status === 'succeeded') return reader
    if (reader.action_status === 'failed') {
      throw new Error(reader.failure_message || reader.failure_code || 'S700 payment failed')
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  throw new Error(last?.action_status === 'in_progress'
    ? 'Timed out waiting for the S700. Check the reader screen and retry the same sale.'
    : 'S700 did not start collecting. Confirm the reader is online and registered.')
}
