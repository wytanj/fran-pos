/**
 * Screen A ↔ Screen B transport (docs/SCREEN_A_B_PLAN.md).
 *
 * Supabase is the only channel — both tablets are separate devices, so
 * same-origin browser messaging cannot bridge them.
 *
 *  - A: ensureLane → publishCustomerDisplay(publish_token, payload)
 *  - B: pairCustomerDisplay(store_code, pair_token) → subscribe
 *
 * Realtime: the DB trigger broadcasts each publish to the private topic
 * `customer_display:<lane_id>` (anon has no SELECT policy on the table, so
 * postgres_changes would never reach the face; a realtime.messages policy
 * admits that topic prefix). Poll via get_customer_display is the fallback
 * (fast while the channel is down, slow heartbeat otherwise).
 */

import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type {
  CustomerDisplayLane,
  CustomerDisplayPairSession,
  CustomerDisplayPayload,
} from './customer-display-types'

export const CUSTOMER_DISPLAY_LANE_STORAGE_KEY = 'fran_pos_customer_display_lane_v1'
export const CUSTOMER_DISPLAY_PAIR_STORAGE_KEY = 'fran_pos_customer_display_pair_v1'
export const CUSTOMER_DISPLAY_DEVICE_SECRET_KEY = 'fran_pos_customer_display_device_secret_v1'

export const CUSTOMER_DISPLAY_FAST_POLL_MS = 1500
export const CUSTOMER_DISPLAY_SLOW_POLL_MS = 6000

export function normalizeStoreCode(value: string) {
  return value.trim().toUpperCase()
}

export function normalizePairToken(value: string) {
  return value.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
}

function randomId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

// ---------------------------------------------------------------------------
// localStorage
// ---------------------------------------------------------------------------

function readJson<T>(key: string): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown | null) {
  if (typeof window === 'undefined') return
  if (value === null) window.localStorage.removeItem(key)
  else window.localStorage.setItem(key, JSON.stringify(value))
}

/** Demo-mode A (no auth) proves lane ownership with this per-device secret. */
export function getOrCreateDeviceSecret() {
  if (typeof window === 'undefined') return randomId()
  const existing = window.localStorage.getItem(CUSTOMER_DISPLAY_DEVICE_SECRET_KEY)
  if (existing) return existing
  const created = randomId()
  window.localStorage.setItem(CUSTOMER_DISPLAY_DEVICE_SECRET_KEY, created)
  return created
}

export function loadStoredLane(): CustomerDisplayLane | null {
  const lane = readJson<Partial<CustomerDisplayLane>>(CUSTOMER_DISPLAY_LANE_STORAGE_KEY)
  if (!lane?.laneId || !lane.publishToken || !lane.pairToken || !lane.storeCode) return null
  return {
    laneId: lane.laneId,
    storeCode: lane.storeCode,
    laneCode: lane.laneCode || 'MAIN',
    pairToken: lane.pairToken,
    publishToken: lane.publishToken,
  }
}

export function saveStoredLane(lane: CustomerDisplayLane | null) {
  writeJson(CUSTOMER_DISPLAY_LANE_STORAGE_KEY, lane)
}

export function loadPairSession(): CustomerDisplayPairSession | null {
  const session = readJson<Partial<CustomerDisplayPairSession>>(CUSTOMER_DISPLAY_PAIR_STORAGE_KEY)
  if (!session?.laneId || !session.pairToken || !session.storeCode) return null
  return {
    laneId: session.laneId,
    storeCode: session.storeCode,
    laneCode: session.laneCode || 'MAIN',
    pairToken: session.pairToken,
    pairedAt: session.pairedAt || new Date().toISOString(),
  }
}

export function savePairSession(session: CustomerDisplayPairSession | null) {
  writeJson(CUSTOMER_DISPLAY_PAIR_STORAGE_KEY, session)
}

// ---------------------------------------------------------------------------
// RPCs
// ---------------------------------------------------------------------------

type LaneRpcRow = {
  lane_id: string
  store_code: string
  lane_code: string
  pair_token: string
  publish_token: string
}

type DisplayRpcRow = {
  lane_id: string
  store_code: string
  lane_code: string
  payload: CustomerDisplayPayload | Record<string, never> | null
  updated_at: string
}

export interface CustomerDisplaySnapshot {
  laneId: string
  storeCode: string
  laneCode: string
  payload: CustomerDisplayPayload | null
  updatedAt: string
}

function asPayload(value: unknown): CustomerDisplayPayload | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Partial<CustomerDisplayPayload>
  if (typeof record.state !== 'string') return null
  return record as CustomerDisplayPayload
}

function toSnapshot(row: DisplayRpcRow): CustomerDisplaySnapshot {
  return {
    laneId: row.lane_id,
    storeCode: row.store_code,
    laneCode: row.lane_code,
    payload: asPayload(row.payload),
    updatedAt: row.updated_at,
  }
}

export async function ensureCustomerDisplayLane(input: {
  storeCode: string
  laneCode?: string
  companyId?: string | null
}): Promise<CustomerDisplayLane> {
  const { data, error } = await supabase.rpc('ensure_customer_display_lane', {
    p_store_code: normalizeStoreCode(input.storeCode),
    p_lane_code: (input.laneCode || 'MAIN').trim().toUpperCase(),
    p_device_secret: getOrCreateDeviceSecret(),
    p_company_id: input.companyId ?? null,
  })
  if (error) throw new Error(error.message)
  const row = data as LaneRpcRow
  const lane: CustomerDisplayLane = {
    laneId: row.lane_id,
    storeCode: row.store_code,
    laneCode: row.lane_code,
    pairToken: row.pair_token,
    publishToken: row.publish_token,
  }
  saveStoredLane(lane)
  return lane
}

export async function publishCustomerDisplay(publishToken: string, payload: CustomerDisplayPayload) {
  const { error } = await supabase.rpc('publish_customer_display', {
    p_publish_token: publishToken,
    p_payload: payload,
  })
  if (error) throw new Error(error.message)
}

export async function pairCustomerDisplay(storeCode: string, pairToken: string): Promise<CustomerDisplaySnapshot> {
  const { data, error } = await supabase.rpc('pair_customer_display', {
    p_store_code: normalizeStoreCode(storeCode),
    p_pair_token: normalizePairToken(pairToken),
  })
  if (error) throw new Error(error.message)
  const snapshot = toSnapshot(data as DisplayRpcRow)
  savePairSession({
    laneId: snapshot.laneId,
    storeCode: snapshot.storeCode,
    laneCode: snapshot.laneCode,
    pairToken: normalizePairToken(pairToken),
    pairedAt: new Date().toISOString(),
  })
  return snapshot
}

export async function getCustomerDisplay(laneId: string, pairToken: string): Promise<CustomerDisplaySnapshot> {
  const { data, error } = await supabase.rpc('get_customer_display', {
    p_lane_id: laneId,
    p_pair_token: normalizePairToken(pairToken),
  })
  if (error) throw new Error(error.message)
  return toSnapshot(data as DisplayRpcRow)
}

// ---------------------------------------------------------------------------
// Subscribe (realtime broadcast + poll fallback)
// ---------------------------------------------------------------------------

export type CustomerDisplayTransport = 'realtime' | 'polling'

export interface SubscribeCustomerDisplayOptions {
  laneId: string
  pairToken: string
  onSnapshot: (snapshot: CustomerDisplaySnapshot) => void
  onTransport?: (transport: CustomerDisplayTransport) => void
  onError?: (message: string) => void
  fastPollMs?: number
  slowPollMs?: number
}

export function customerDisplayTopic(laneId: string) {
  return `customer_display:${laneId}`
}

/**
 * Returns an unsubscribe function. Snapshots are delivered newest-wins by
 * `updatedAt`, so a late poll never overwrites a fresher broadcast.
 */
export function subscribeCustomerDisplay(options: SubscribeCustomerDisplayOptions): () => void {
  const fastPollMs = options.fastPollMs ?? CUSTOMER_DISPLAY_FAST_POLL_MS
  const slowPollMs = options.slowPollMs ?? CUSTOMER_DISPLAY_SLOW_POLL_MS
  let stopped = false
  let realtimeUp = false
  let lastUpdatedAt = ''
  let pollTimer: ReturnType<typeof setTimeout> | null = null
  let polling = false

  const deliver = (snapshot: CustomerDisplaySnapshot) => {
    if (stopped) return
    if (lastUpdatedAt && snapshot.updatedAt && snapshot.updatedAt < lastUpdatedAt) return
    lastUpdatedAt = snapshot.updatedAt || lastUpdatedAt
    options.onSnapshot(snapshot)
  }

  const setTransport = (up: boolean) => {
    if (realtimeUp === up) return
    realtimeUp = up
    options.onTransport?.(up ? 'realtime' : 'polling')
    schedulePoll(0)
  }

  const poll = async () => {
    if (stopped || polling) return
    polling = true
    try {
      deliver(await getCustomerDisplay(options.laneId, options.pairToken))
    } catch (error) {
      options.onError?.(error instanceof Error ? error.message : 'Display poll failed')
    } finally {
      polling = false
      schedulePoll(realtimeUp ? slowPollMs : fastPollMs)
    }
  }

  const schedulePoll = (delay: number) => {
    if (stopped) return
    if (pollTimer) clearTimeout(pollTimer)
    pollTimer = setTimeout(() => void poll(), delay)
  }

  let channel: RealtimeChannel | null = null
  try {
    channel = supabase
      .channel(customerDisplayTopic(options.laneId), { config: { private: true } })
      .on('broadcast', { event: 'display' }, (message) => {
        const body = (message as { payload?: { lane_id?: string; payload?: unknown; updated_at?: string } }).payload
        if (!body || body.lane_id !== options.laneId) return
        const payload = asPayload(body.payload)
        if (!payload) return
        deliver({
          laneId: options.laneId,
          storeCode: payload.storeCode,
          laneCode: payload.laneCode,
          payload,
          updatedAt: body.updated_at || new Date().toISOString(),
        })
      })
      .subscribe((status) => {
        if (stopped) return
        setTransport(status === 'SUBSCRIBED')
      })
  } catch {
    channel = null
  }

  // Initial read straight away; the channel upgrades the cadence when it lands.
  schedulePoll(0)

  return () => {
    stopped = true
    if (pollTimer) clearTimeout(pollTimer)
    if (channel) void supabase.removeChannel(channel)
  }
}
