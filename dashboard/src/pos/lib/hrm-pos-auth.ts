import { supabase } from '@/lib/supabase'

const DEVICE_TOKEN_KEY = 'pos_register_device_token'
const BINDING_KEY = 'pos_register_binding'

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
  const res = await fetch('/api/hrm-pos-verify', {
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
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = body?.message || body?.error || res.statusText || 'Verify failed'
    const err = new Error(msg) as Error & { reason?: string; status?: number }
    err.reason = body?.reason || body?.data?.reason
    err.status = res.status
    throw err
  }
  return { staff: body.staff as HrmPosStaff }
}
