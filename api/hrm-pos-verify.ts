import type { VercelRequest, VercelResponse } from '@vercel/node'

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
  // Capacitor WebView default origin when Origin header absent
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

/**
 * Browser / Capacitor → this proxy → fran-hrm /api/v1/pos/verify
 * Keeps FRAN_HRM_API_KEY server-side.
 * CORS required for Capacitor https://localhost → fran-pos.vercel.app when CapacitorHttp is off.
 */
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
      error: 'HRM verify is not configured',
      message: 'Set FRAN_HRM_URL and FRAN_HRM_API_KEY on the POS deployment',
    })
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
  const employee_code = body.employee_code || body.employeeCode
  const pin = body.pin
  if (!employee_code || !pin) {
    return json(res, req, 400, { error: 'employee_code and pin required' })
  }

  try {
    const upstream = await fetch(`${hrmUrl}/api/v1/pos/verify`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        employee_code,
        pin,
        store_code: body.store_code || body.storeCode || null,
        register_id: body.register_id || body.registerId || null,
        device_token: body.device_token || body.deviceToken || null,
      }),
    })
    const text = await upstream.text()
    let parsed: any = {}
    try {
      parsed = text ? JSON.parse(text) : {}
    } catch {
      parsed = { message: text }
    }
    if (!upstream.ok) {
      return json(res, req, upstream.status, {
        error: 'HRM verify failed',
        message: parsed.statusMessage || parsed.message || parsed.error || text || upstream.statusText,
        reason: parsed.data?.reason || parsed.reason,
      })
    }
    const staff = parsed?.staff || parsed?.data?.staff
    if (!staff?.role) {
      return json(res, req, 502, {
        error: 'HRM verify returned no staff',
        message: 'Unexpected HRM response shape',
      })
    }
    return json(res, req, 200, { ok: true, staff })
  } catch (e: any) {
    return json(res, req, 502, { error: 'HRM unreachable', message: e?.message || 'fetch failed' })
  }
}