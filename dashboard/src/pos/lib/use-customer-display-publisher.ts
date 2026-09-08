/**
 * Screen A side of the customer display: claim the lane once, then publish
 * whenever the display payload changes. Never blocks the register — every
 * failure is reported as status/error and retried on the next change.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { customerDisplayPayloadKey } from './build-customer-display-payload'
import {
  ensureCustomerDisplayLane,
  loadStoredLane,
  publishCustomerDisplay,
  saveStoredLane,
} from './customer-display-sync'
import type { CustomerDisplayLane, CustomerDisplayPayload } from './customer-display-types'

export type CustomerDisplayPublisherStatus = 'disabled' | 'connecting' | 'ready' | 'error'

export interface CustomerDisplayPublisher {
  lane: CustomerDisplayLane | null
  status: CustomerDisplayPublisherStatus
  error: string | null
  lastPublishedAt: string | null
  /** Re-run lane claim (after an error or a store change). */
  reconnect: () => void
}

const PUBLISH_DEBOUNCE_MS = 120

export function useCustomerDisplayPublisher(input: {
  enabled: boolean
  storeCode: string
  laneCode?: string
  companyId?: string | null
  payload: CustomerDisplayPayload
}): CustomerDisplayPublisher {
  const laneCode = (input.laneCode || 'MAIN').toUpperCase()
  const [lane, setLane] = useState<CustomerDisplayLane | null>(() => {
    const stored = loadStoredLane()
    return stored && stored.storeCode === input.storeCode.toUpperCase() && stored.laneCode === laneCode ? stored : null
  })
  const [status, setStatus] = useState<CustomerDisplayPublisherStatus>(input.enabled ? 'connecting' : 'disabled')
  const [error, setError] = useState<string | null>(null)
  const [lastPublishedAt, setLastPublishedAt] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  const laneRef = useRef<CustomerDisplayLane | null>(lane)
  laneRef.current = lane
  const lastKeyRef = useRef<string | null>(null)
  const inFlightRef = useRef(false)
  const pendingRef = useRef<CustomerDisplayPayload | null>(null)

  // 1) Claim the lane (idempotent RPC; also validates a stored lane still exists).
  useEffect(() => {
    if (!input.enabled || !input.storeCode) {
      setStatus('disabled')
      return
    }
    let cancelled = false
    setStatus('connecting')
    setError(null)
    ensureCustomerDisplayLane({ storeCode: input.storeCode, laneCode, companyId: input.companyId ?? null })
      .then((next) => {
        if (cancelled) return
        setLane(next)
        // Force a fresh publish against the (possibly new) lane.
        lastKeyRef.current = null
        setStatus('ready')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setStatus('error')
        setError(err instanceof Error ? err.message : 'Could not connect customer display')
        // Drop a stale stored lane so a fresh claim happens next attempt.
        if (laneRef.current) {
          saveStoredLane(null)
          setLane(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [input.enabled, input.storeCode, laneCode, input.companyId, attempt])

  // 2) Publish on payload change (debounced, deduped, serialised).
  const flush = useCallback(async () => {
    const current = laneRef.current
    const next = pendingRef.current
    if (!current || !next || inFlightRef.current) return
    const key = customerDisplayPayloadKey(next)
    if (key === lastKeyRef.current) {
      pendingRef.current = null
      return
    }
    inFlightRef.current = true
    pendingRef.current = null
    try {
      await publishCustomerDisplay(current.publishToken, next)
      lastKeyRef.current = key
      setLastPublishedAt(next.publishedAt)
      setStatus('ready')
      setError(null)
    } catch (err: unknown) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Publish failed')
      // Lane may have been deleted server-side; reclaim on next reconnect.
      if (err instanceof Error && /not found/i.test(err.message)) {
        saveStoredLane(null)
        setLane(null)
      }
    } finally {
      inFlightRef.current = false
      if (pendingRef.current) void flush()
    }
  }, [])

  const payloadKey = customerDisplayPayloadKey(input.payload)
  useEffect(() => {
    if (!input.enabled || !lane) return
    pendingRef.current = input.payload
    const timer = setTimeout(() => void flush(), PUBLISH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
    // payloadKey captures every meaningful change; input.payload identity churns each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input.enabled, lane, payloadKey, flush])

  const reconnect = useCallback(() => {
    lastKeyRef.current = null
    setAttempt((n) => n + 1)
  }, [])

  return { lane, status, error, lastPublishedAt, reconnect }
}
