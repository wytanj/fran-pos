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

function asJsonRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function jsonString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' && value ? value : undefined
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

export const HRM_POS_PIN_DIGITS = 8

export const HRM_MANAGER_PLUS_ROLES = [
  'manager',
  'admin',
  'hq_admin',
  'owner',
  'store_manager',
  'area_manager',
] as const

export function isHrmManagerPlus(role: string | null | undefined): boolean {
  if (!role) return false
  return (HRM_MANAGER_PLUS_ROLES as readonly string[]).includes(role)
}

export async function verifyHrmManagerPin(input: {
  employeeCode: string
  pin: string
  binding: RegisterBinding
}): Promise<{ staff: HrmPosStaff }> {
  const { staff } = await verifyHrmPosPin(input)
  if (!isHrmManagerPlus(staff.role)) {
    const err = new Error('This employee is not a manager, admin, HQ admin, or owner') as Error & {
      reason?: string
      status?: number
    }
    err.reason = 'not_manager'
    err.status = 403
    throw err
  }
  return { staff }
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
  const body = asJsonRecord(await res.json().catch(() => ({})))
  if (!res.ok) {
    const nested = asJsonRecord(body.data)
    const msg = jsonString(body, 'message') || jsonString(body, 'error') || res.statusText || 'Verify failed'
    const err = new Error(msg) as Error & { reason?: string; status?: number }
    err.reason = jsonString(body, 'reason') || jsonString(nested, 'reason')
    err.status = res.status
    throw err
  }
  const staff = (body.staff || asJsonRecord(body.data).staff) as HrmPosStaff | undefined
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

export async function loadRegisterCompanyContext(binding: RegisterBinding): Promise<RegisterCompanyContext> {
  const token = binding.device_token?.trim()
  if (!token) throw new Error('Register is not bound')

  const { data, error } = await supabase.rpc('get_pos_register_company_context', {
    p_device_token: token,
  })
  const rpcRow = asJsonRecord(data)
  const rpcCompany = asJsonRecord(rpcRow.company)
  if (!error && jsonString(rpcCompany, 'id')) {
    return {
      company_id: jsonString(rpcRow, 'company_id') || jsonString(rpcCompany, 'id') || '',
      company: rpcCompany as RegisterCompanyContext['company'],
      settings: (rpcRow.settings as Record<string, unknown> | null) ?? null,
      store_code: jsonString(rpcRow, 'store_code'),
      register_id: jsonString(rpcRow, 'register_id'),
      label: jsonString(rpcRow, 'label') ?? null,
    }
  }

  const res = await fetch(registerContextUrl(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ device_token: token }),
  })
  const body = asJsonRecord(await res.json().catch(() => ({})))
  if (!res.ok) {
    throw new Error(jsonString(body, 'message') || jsonString(body, 'error') || error?.message || 'Failed to load register company')
  }
  const company = asJsonRecord(body.company)
  if (!jsonString(company, 'id')) {
    throw new Error('Register company context missing company')
  }
  return {
    company_id: jsonString(body, 'company_id') || jsonString(company, 'id') || '',
    company: company as RegisterCompanyContext['company'],
    settings: (body.settings as Record<string, unknown> | null) ?? null,
    store_code: jsonString(body, 'store_code'),
    register_id: jsonString(body, 'register_id'),
    label: jsonString(body, 'label') ?? null,
  }
}
