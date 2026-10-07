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
 * Browser / Capacitor → this proxy → fran-hrm /api/v1/clock
 * Uses FRAN_HRM_API_KEY (attendance:write) for manual clock_in after POS PIN verify.
 * Photo is collected on-device as a UX gate; HRM clock has no photo column today,
 * so optional photo_data_url is forwarded only as note metadata if present.
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
      error: 'HRM clock is not configured',
      message: 'Set FRAN_HRM_URL and FRAN_HRM_API_KEY on the POS deployment',
    })
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
  const action = body.action || 'clock_in'
  const staff_id = body.staff_id || body.staffId
  const store_id = body.store_id || body.storeId
  if (!staff_id || !store_id) {
    return json(res, req, 400, { error: 'staff_id and store_id required' })
  }

  const noteParts = ['pos_clock_in']
  if (body.store_code || body.storeCode) noteParts.push(`store_code=${body.store_code || body.storeCode}`)
  if (body.register_id || body.registerId) noteParts.push(`register=${body.register_id || body.registerId}`)
  if (body.photo_captured || body.photoCaptured) noteParts.push('photo_captured=1')

  try {
    const upstream = await fetch(`${hrmUrl}/api/v1/clock`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        action,
        staff_id,
        store_id,
        note: noteParts.join(' '),
        device_id: body.device_token || body.deviceToken || null,
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
        error: 'HRM clock failed',
        message: parsed.statusMessage || parsed.message || parsed.error || text || upstream.statusText,
      })
    }
    return json(res, req, 200, {
      ok: true,
      action: parsed.action || action,
      entry: parsed.data || parsed.entry || null,
      flags: parsed.flags || [],
    })
  } catch (e: any) {
    return json(res, req, 502, { error: 'HRM unreachable', message: e?.message || 'fetch failed' })
  }
}
