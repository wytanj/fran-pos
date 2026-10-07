export type ClockInStep =
  | { step: 'photo'; shot: string | null }
  | { step: 'pin'; shot: string }

export type ClockInEvent =
  | { type: 'capture'; photo: string }
  | { type: 'continue' }
  | { type: 'retake' }
  | { type: 'reset' }

export type ClockInControls = {
  photo: boolean
  pin: boolean
  canContinue: boolean
}

export const HRM_CLOCK_PATH = '/api/v1/clock'

const HRM_STORE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type HrmStoreId = string & { readonly __brand: 'HrmStoreId' }

export function hrmStoreId(value: string | null | undefined): HrmStoreId | null {
  const id = (value ?? '').trim()
  if (!HRM_STORE_UUID.test(id)) return null
  return id as HrmStoreId
}

export function parseHrmClockRequest(body: unknown): { staffId: string; storeId: HrmStoreId } | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const record = body as Record<string, unknown>
  const staffRaw = record.staff_id ?? record.staffId
  const storeRaw = record.store_id ?? record.storeId
  const staffId = typeof staffRaw === 'string' ? staffRaw.trim() : ''
  const storeId = hrmStoreId(typeof storeRaw === 'string' ? storeRaw : '')
  if (!staffId || !storeId) return null
  return { staffId, storeId }
}

export function hrmClockInBody(input: { staffId: string; storeId: HrmStoreId }) {
  return {
    action: 'clock_in' as const,
    staff_id: input.staffId,
    store_id: input.storeId,
  }
}

export function initialClockInStep(): ClockInStep {
  return { step: 'photo', shot: null }
}

export function reduceClockInStep(state: ClockInStep, event: ClockInEvent): ClockInStep {
  if (event.type === 'reset' || event.type === 'retake') {
    return { step: 'photo', shot: null }
  }
  if (event.type === 'capture') {
    if (state.step !== 'photo') return state
    const shot = event.photo.trim()
    if (!shot) return state
    return { step: 'photo', shot }
  }
  if (event.type === 'continue') {
    if (state.step !== 'photo' || !state.shot) return state
    return { step: 'pin', shot: state.shot }
  }
  const _exhaustive: never = event
  return _exhaustive
}

export function clockInControls(state: ClockInStep): ClockInControls {
  switch (state.step) {
    case 'photo':
      return { photo: true, pin: false, canContinue: state.shot !== null }
    case 'pin':
      return { photo: false, pin: true, canContinue: false }
    default: {
      const _exhaustive: never = state
      return _exhaustive
    }
  }
}
