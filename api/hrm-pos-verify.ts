import type { VercelRequest, VercelResponse } from '@vercel/node'

function json(res: VercelResponse, status: number, body: Record<string, unknown>) {
  res.status(status).json(body)
}

function hrmBaseUrl() {
  return (process.env.FRAN_HRM_URL || process.env.VITE_FRAN_HRM_URL || '')
    .trim()
    .replace(/\\n$/g, '')
    .replace(/\/+$/, '')
}

/**
 * Browser / Capacitor → this proxy → fran-hrm /api/v1/pos/verify
 * Keeps FRAN_HRM_API_KEY server-side.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' })
  }

  const hrmUrl = hrmBaseUrl()
  const apiKey = (process.env.FRAN_HRM_API_KEY || '').trim()
  if (!hrmUrl || !apiKey) {
    return json(res, 503, {
      error: 'HRM verify is not configured',
      message: 'Set FRAN_HRM_URL and FRAN_HRM_API_KEY on the POS deployment',
    })
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
  const employee_code = body.employee_code || body.employeeCode
  const pin = body.pin
  if (!employee_code || !pin) {
    return json(res, 400, { error: 'employee_code and pin required' })
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
      return json(res, upstream.status, {
        error: 'HRM verify failed',
        message: parsed.statusMessage || parsed.message || parsed.error || text || upstream.statusText,
        reason: parsed.data?.reason || parsed.reason,
      })
    }
    const staff = parsed?.staff || parsed?.data?.staff
    if (!staff) {
      return json(res, 502, {
        error: 'HRM verify returned no staff',
        message: 'Unexpected HRM response shape',
      })
    }
    return json(res, 200, { ok: true, staff })
  } catch (e: any) {
    return json(res, 502, { error: 'HRM unreachable', message: e?.message || 'fetch failed' })
  }
}
