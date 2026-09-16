import { Capacitor } from '@capacitor/core'
import { supabase } from '@/lib/supabase'

const DEVICE_TOKEN_KEY = 'pos_register_device_token'
const BINDING_KEY = 'pos_register_binding'

/** Capacitor WebView has no Vercel /api routes — hit prod origin. */
const POS_API_ORIGIN =
  (import.meta.env.VITE_POS_API_ORIGIN as string | undefined)?.replace(/\/+$/, '') ||
  'https://fran-pos.vercel.app'

export type RegisterBinding = {
  device_token: string
  store_code: string
  register_id: string
  company_id?: string | null
  label?: string | null
}

export type HrmPosStaff = {
  id: string
  employee_code: string
  display_name: string
  role: string
  employment_type?: string | null
  home_store_id?: string | null
  pin_expires_at?: string | null
  store_codes?: string[]
}

function hrmPosVerifyUrl() {
  if (Capacitor.isNativePlatform()) return `${POS_API_ORIGIN}/api/hrm-pos-verify`
  return '/api/hrm-pos-verify'
}

export function loadRegisterBinding(): RegisterBinding | null {
  try {
    const raw = localStorage.getItem(BINDING_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as RegisterBinding
    if (!parsed?.device_token || !parsed?.store_code) return null
    return parsed
  } catch {
    return null
  }
}

export function saveRegisterBinding(binding: RegisterBinding) {
  localStorage.setItem(DEVICE_TOKEN_KEY, binding.device_token)
  localStorage.setItem(BINDING_KEY, JSON.stringify(binding))
}

export function clearRegisterBinding() {
  localStorage.removeItem(DEVICE_TOKEN_KEY)
  localStorage.removeItem(BINDING_KEY)
}

export async function pairRegisterDevice(input: {
  storeCode: string
  pairCode: string
  registerId?: string
}): Promise<RegisterBinding> {
  const { data, error } = await supabase.rpc('pair_pos_register_device', {
    p_store_code: input.storeCode.trim(),
    p_pair_code: input.pairCode.trim(),
    p_register_id: input.registerId?.trim() || null,
  })
  if (error) throw new Error(error.message)
  const row = data as RegisterBinding
  if (!row?.device_token) throw new Error('Pair failed')
  const binding: RegisterBinding = {
    device_token: row.device_token,
    store_code: row.store_code,
    register_id: row.register_id || 'REG-01',
    company_id: row.company_id,
    label: row.label,
  }
  saveRegisterBinding(binding)
  return binding
}

export async function refreshRegisterBinding(token?: string): Promise<RegisterBinding | null> {
  const deviceToken = token || localStorage.getItem(DEVICE_TOKEN_KEY)
  if (!deviceToken) return null
  const { data, error } = await supabase.rpc('get_pos_register_device', {
    p_device_token: deviceToken,
  })
  if (error) {
    clearRegisterBinding()
    throw new Error(error.message)
  }
  const row = data as RegisterBinding
  const binding: RegisterBinding = {
    device_token: row.device_token,
    store_code: row.store_code,
    register_id: row.register_id || 'REG-01',
    company_id: row.company_id,
    label: row.label,
  }
  saveRegisterBinding(binding)
  return binding
}

export async function verifyHrmPosPin(input: {
  employeeCode: string
  pin: string
  binding: RegisterBinding
}): Promise<{ staff: HrmPosStaff }> {
  const res = await fetch(hrmPosVerifyUrl(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      employee_code: input.employeeCode.trim().toUpperCase(),
      pin: input.pin,
      store_code: input.binding.store_code,
      register_id: input.binding.register_id,
      device_token: input.binding.device_token,
    }),
  })
  const body = (await res.json().catch(() => ({}))) as Record<string, any>
  if (!res.ok) {
    const msg = body?.message || body?.error || res.statusText || 'Verify failed'
    const err = new Error(msg) as Error & { reason?: string; status?: number }
    err.reason = body?.reason || body?.data?.reason
    err.status = res.status
    throw err
  }
  const staff = (body?.staff || body?.data?.staff) as HrmPosStaff | undefined
  if (!staff?.id || !staff?.role) {
    throw new Error(
      Capacitor.isNativePlatform()
        ? 'HRM verify returned no staff. Check tablet can reach fran-pos.vercel.app'
        : 'HRM verify returned no staff',
    )
  }
  return { staff }
}

export type RegisterCompanyContext = {
  company_id: string
  company: {
    id: string
    name: string
    slug: string
    owner_id: string
    business_type: string
    is_active: boolean
    created_at: string
    updated_at: string
  }
  settings: Record<string, unknown> | null
  store_code?: string
  register_id?: string
  label?: string | null
}

function registerContextUrl() {
  if (Capacitor.isNativePlatform()) return `${POS_API_ORIGIN}/api/pos-register-context`
  return '/api/pos-register-context'
}

/**
 * Load Auth company + company_settings for a bound register (no Google).
 * Tries Supabase RPC first; falls back to POS API (service role / RPC proxy).
 */
export async function loadRegisterCompanyContext(binding: RegisterBinding): Promise<RegisterCompanyContext> {
  const token = binding.device_token?.trim()
  if (!token) throw new Error('Register is not bound')

  const { data, error } = await supabase.rpc('get_pos_register_company_context', {
    p_device_token: token,
  })
  if (!error && data && typeof data === 'object' && (data as any).company) {
    const row = data as any
    return {
      company_id: row.company_id || row.company.id,
      company: row.company,
      settings: row.settings ?? null,
      store_code: row.store_code,
      register_id: row.register_id,
      label: row.label,
    }
  }

  const res = await fetch(registerContextUrl(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ device_token: token }),
  })
  const body = (await res.json().catch(() => ({}))) as Record<string, any>
  if (!res.ok) {
    throw new Error(body?.message || body?.error || error?.message || 'Failed to load register company')
  }
  if (!body?.company?.id) {
    throw new Error('Register company context missing company')
  }
  return {
    company_id: body.company_id || body.company.id,
    company: body.company,
    settings: body.settings ?? null,
    store_code: body.store_code,
    register_id: body.register_id,
    label: body.label,
  }
}
