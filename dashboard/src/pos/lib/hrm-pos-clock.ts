import { Capacitor } from '@capacitor/core'
import type { RegisterBinding } from './hrm-pos-auth'

const POS_API_ORIGIN =
  (import.meta.env.VITE_POS_API_ORIGIN as string | undefined)?.replace(/\/+$/, '') ||
  'https://fran-pos.vercel.app'

function hrmPosClockUrl() {
  if (Capacitor.isNativePlatform()) return `${POS_API_ORIGIN}/api/hrm-pos-clock`
  return '/api/hrm-pos-clock'
}

export async function clockInViaHrm(input: {
  staffId: string
  storeId: string
  binding: RegisterBinding
  photoCaptured: boolean
}): Promise<{ ok: true; entry: unknown; flags: string[] }> {
  const res = await fetch(hrmPosClockUrl(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'clock_in',
      staff_id: input.staffId,
      store_id: input.storeId,
      store_code: input.binding.store_code,
      register_id: input.binding.register_id,
      device_token: input.binding.device_token,
      photo_captured: input.photoCaptured,
    }),
  })
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    throw new Error(String(body.message || body.error || res.statusText || 'Clock-in failed'))
  }
  return {
    ok: true,
    entry: body.entry ?? null,
    flags: Array.isArray(body.flags) ? (body.flags as string[]) : [],
  }
}

export const POS_CLOCK_IN_STEPS = ['photo', 'pin'] as const
export type PosClockInStep = (typeof POS_CLOCK_IN_STEPS)[number]
