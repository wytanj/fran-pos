import type { VercelRequest, VercelResponse } from '@vercel/node'
import { HRM_CLOCK_PATH, hrmClockInBody, parseHrmClockRequest } from '../dashboard/src/pos/lib/pos-clock-in.ts'

function allowOrigin(req: VercelRequest) {
  const origin = String(req.headers.origin || '')
  if (
    origin === 'https://localhost' ||
    origin === 'http://localhost' ||
    origin.startsWith('https://localhost:') ||
    origin.startsWith('http://localhost:') ||
    origin.startsWith('capacitor://') ||
    origin.includes('fran-pos.vercel.app')
  ) {
    return origin
  }
  return 'https://localhost'
}

function setCors(res: VercelResponse, req: VercelRequest) {
  res.setHeader('Access-Control-Allow-Origin', allowOrigin(req))
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'content-type')
  res.setHeader('Vary', 'Origin')
}

function json(res: VercelResponse, req: VercelRequest, status: number, body: Record<string, unknown>) {
  setCors(res, req)
  res.status(status).json(body)
}

function hrmBaseUrl() {
  return (process.env.FRAN_HRM_URL || process.env.VITE_FRAN_HRM_URL || '')
    .trim()
    .replace(/\\n$/g, '')
    .replace(/\n$/g, '')
    .replace(/\/+$/, '')
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

function text(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  return typeof value === 'string' ? value.trim() : ''
}

function readJsonBody(req: VercelRequest): unknown {
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body || '{}') as unknown
    } catch {
      return null
    }
  }
  return req.body ?? {}
}

function upstreamMessage(parsed: Record<string, unknown>, fallback: string): string {
  const direct = text(parsed, 'statusMessage') || text(parsed, 'message') || text(parsed, 'error')
  if (direct) return direct
  const data = asRecord(parsed.data)
  if (data) {
    const nested = text(data, 'message') || text(data, 'error') || text(data, 'statusMessage')
    if (nested) return nested
  }
  return fallback
}

/** Manual clock_in needs attendance:write on that key. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    setCors(res, req)
    return res.status(204).end()
  }
  if (req.method !== 'POST') {
    return json(res, req, 405, { error: 'Method not allowed' })
  }

  const hrmUrl = hrmBaseUrl()
  const apiKey = (process.env.FRAN_HRM_API_KEY || '').trim()
  if (!hrmUrl || !apiKey) {
    return json(res, req, 503, {
      error: 'HRM clock is not configured',
      message: 'Set FRAN_HRM_URL and FRAN_HRM_API_KEY on the POS deployment',
    })
  }

  const ids = parseHrmClockRequest(readJsonBody(req))
  if (!ids) {
    return json(res, req, 400, { error: 'staff_id and a store UUID are required' })
  }

  try {
    const upstream = await fetch(`${hrmUrl}${HRM_CLOCK_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
        'x-api-key': apiKey,
      },
      body: JSON.stringify(hrmClockInBody(ids)),
    })
    const raw = await upstream.text()
    let parsed: Record<string, unknown> = {}
    try {
      const value: unknown = raw ? JSON.parse(raw) : {}
      parsed = asRecord(value) ?? { message: raw }
    } catch {
      parsed = { message: raw }
    }
    if (!upstream.ok) {
      return json(res, req, upstream.status, {
        error: 'HRM clock failed',
        message: upstreamMessage(parsed, raw || upstream.statusText),
      })
    }
    return json(res, req, 200, {
      ok: true,
      entry: parsed.data ?? null,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'fetch failed'
    return json(res, req, 502, { error: 'HRM unreachable', message })
  }
}
