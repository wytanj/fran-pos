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
    return origin || 'https://localhost'
  }
  return 'https://localhost'
}

function json(res: VercelResponse, req: VercelRequest, status: number, body: Record<string, unknown>) {
  res.setHeader('Access-Control-Allow-Origin', allowOrigin(req))
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'content-type')
  res.setHeader('Vary', 'Origin')
  res.status(status).json(body)
}

/**
 * Bound register (device_token) → company + company_settings for HRM PIN unlock (no Google).
 * Prefers SECURITY DEFINER RPC; falls back to service-role REST when RPC is not migrated yet.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return json(res, req, 204, {})
  }
  if (req.method !== 'POST') {
    return json(res, req, 405, { error: 'Method not allowed' })
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
  const deviceToken = String(body.device_token || body.deviceToken || '').trim()
  if (deviceToken.length < 8) {
    return json(res, req, 400, { error: 'device_token required' })
  }

  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
  if (!supabaseUrl || (!serviceKey && !anonKey)) {
    return json(res, req, 503, {
      error: 'Register context is not configured',
      message: 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or anon + RPC) on the POS deployment',
    })
  }

  const key = serviceKey || anonKey

  try {
    // Prefer RPC (works with anon once migration 00017 is applied).
    const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/get_pos_register_company_context`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ p_device_token: deviceToken }),
    })
    const rpcText = await rpcRes.text()
    let rpcParsed: any = null
    try {
      rpcParsed = rpcText ? JSON.parse(rpcText) : null
    } catch {
      rpcParsed = null
    }
    if (rpcRes.ok && rpcParsed && typeof rpcParsed === 'object' && rpcParsed.company) {
      return json(res, req, 200, rpcParsed)
    }

    // Fallback: service-role direct reads (when RPC missing).
    if (!serviceKey) {
      return json(res, req, rpcRes.status || 502, {
        error: 'Register context unavailable',
        message:
          (rpcParsed && (rpcParsed.message || rpcParsed.error || rpcParsed.hint)) ||
          rpcText ||
          'Apply migration get_pos_register_company_context or set SUPABASE_SERVICE_ROLE_KEY',
      })
    }

    const deviceRes = await fetch(
      `${supabaseUrl}/rest/v1/pos_register_devices?device_token=eq.${encodeURIComponent(deviceToken)}&revoked_at=is.null&select=device_token,store_code,register_id,company_id,label&limit=1`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
      },
    )
    const devices = (await deviceRes.json().catch(() => [])) as any[]
    const device = Array.isArray(devices) ? devices[0] : null
    if (!deviceRes.ok || !device?.company_id) {
      return json(res, req, 404, {
        error: 'Unknown or revoked device',
        message: !device?.company_id ? 'Register is not linked to a company' : 'Device not found',
      })
    }

    const [companyRes, settingsRes] = await Promise.all([
      fetch(
        `${supabaseUrl}/rest/v1/companies?id=eq.${encodeURIComponent(device.company_id)}&select=*&limit=1`,
        { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
      ),
      fetch(
        `${supabaseUrl}/rest/v1/company_settings?company_id=eq.${encodeURIComponent(device.company_id)}&select=*&limit=1`,
        { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
      ),
    ])
    const companies = (await companyRes.json().catch(() => [])) as any[]
    const settingsRows = (await settingsRes.json().catch(() => [])) as any[]
    const company = Array.isArray(companies) ? companies[0] : null
    if (!company) {
      return json(res, req, 404, { error: 'Company not found for register' })
    }

    return json(res, req, 200, {
      device_token: device.device_token,
      store_code: device.store_code,
      register_id: device.register_id,
      company_id: device.company_id,
      label: device.label,
      company,
      settings: Array.isArray(settingsRows) ? settingsRows[0] || null : null,
    })
  } catch (e: any) {
    return json(res, req, 502, {
      error: 'Register context failed',
      message: e?.message || 'fetch failed',
    })
  }
}
