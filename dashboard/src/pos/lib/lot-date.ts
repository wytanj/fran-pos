/** Same 9-month shelf rule as SKUMS checkNearExpiryGate: floor(months * 30.44). */
export const SHORT_DATE_MIN_MONTHS = 9

export function shortDateMinDays(minMonths = SHORT_DATE_MIN_MONTHS) {
  return Math.floor(minMonths * 30.44)
}

export const FRAN_WH_DESTINATION = {
  code: 'WH-FRAN-2000',
  name: 'Fran WH (2000 sqft)',
} as const

export const OUTBOUND_TRANSFER_DESTINATIONS = [
  FRAN_WH_DESTINATION,
  { code: 'FRAN02', name: 'Fran Beauty Vivocity' },
  { code: 'SG03', name: 'Jewel Changi' },
] as const

export type LotRecord =
  | { kind: 'absent' }
  | { kind: 'batch_only'; batch_code: string }
  | {
      kind: 'dated'
      batch_code: string | null
      expiry_year: number
      expiry_month: number
      expiry_day: number
    }

export type LotDateParse = { ok: true; lot: LotRecord } | { ok: false; error: string }

export type LotWireFields = {
  batch_code: string | null
  expiry_year: number | null
  expiry_month: number | null
  expiry_day: number | null
}

export function lotWireFields(lot: LotRecord | null | undefined): LotWireFields {
  if (!lot || lot.kind === 'absent') {
    return { batch_code: null, expiry_year: null, expiry_month: null, expiry_day: null }
  }
  if (lot.kind === 'batch_only') {
    return { batch_code: lot.batch_code, expiry_year: null, expiry_month: null, expiry_day: null }
  }
  return {
    batch_code: lot.batch_code,
    expiry_year: lot.expiry_year,
    expiry_month: lot.expiry_month,
    expiry_day: lot.expiry_day,
  }
}

export function outboundDestinationLabel(code: string) {
  const destination = OUTBOUND_TRANSFER_DESTINATIONS.find((item) => item.code === code)
  return destination ? `${destination.name} (${destination.code})` : code
}

export function parseLotDate(input: { batchCode?: string | null; expiryDate?: string | null }): LotDateParse {
  const batch = (input.batchCode ?? '').trim()
  const raw = (input.expiryDate ?? '').trim()
  if (!batch && !raw) return { ok: true, lot: { kind: 'absent' } }
  if (!raw) return { ok: true, lot: { kind: 'batch_only', batch_code: batch } }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (!match) return { ok: false, error: 'Expiry date must be YYYY-MM-DD.' }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const utc = new Date(Date.UTC(year, month - 1, day))
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) {
    return { ok: false, error: 'Expiry date is not a real calendar day.' }
  }

  return {
    ok: true,
    lot: {
      kind: 'dated',
      batch_code: batch || null,
      expiry_year: year,
      expiry_month: month,
      expiry_day: day,
    },
  }
}

export type ShortDateBlock = {
  sku: string
  days_until_expiry: number
  expiry_date: string
}

export type ShortDateDecision =
  | { ok: true; min_days: number; blocked: ShortDateBlock[]; overridden: boolean }
  | {
      ok: false
      reason: 'loft_destination' | 'unknown_destination' | 'short_date'
      message: string
      min_days: number
      blocked: ShortDateBlock[]
    }

function calendarDaysUntil(lot: Extract<LotRecord, { kind: 'dated' }>, today: Date) {
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  const exp = Date.UTC(lot.expiry_year, lot.expiry_month - 1, lot.expiry_day)
  return Math.floor((exp - start) / 86400000)
}

function isoDate(lot: Extract<LotRecord, { kind: 'dated' }>) {
  const month = String(lot.expiry_month).padStart(2, '0')
  const day = String(lot.expiry_day).padStart(2, '0')
  return `${lot.expiry_year}-${month}-${day}`
}

export function evaluateShortDateGate(input: {
  lines: Array<{ sku: string; lot: LotRecord | null }>
  destinationCode: string
  overrideReason?: string | null
  today?: Date
}): ShortDateDecision {
  const minDays = shortDateMinDays()
  const code = input.destinationCode.trim()

  if (/loft/i.test(code)) {
    return {
      ok: false,
      reason: 'loft_destination',
      message: 'Loft is not a transfer destination. Send overflow to Fran WH (2000 sqft).',
      min_days: minDays,
      blocked: [],
    }
  }

  const known = OUTBOUND_TRANSFER_DESTINATIONS.some((item) => item.code === code)
  if (!known) {
    return {
      ok: false,
      reason: 'unknown_destination',
      message: `Unknown destination ${code}. Use Fran WH (2000 sqft) or a store.`,
      min_days: minDays,
      blocked: [],
    }
  }

  const today = input.today ?? new Date()
  const blocked: ShortDateBlock[] = []
  for (const line of input.lines) {
    if (!line.lot || line.lot.kind !== 'dated') continue
    const days = calendarDaysUntil(line.lot, today)
    if (days < minDays) {
      blocked.push({
        sku: line.sku,
        days_until_expiry: days,
        expiry_date: isoDate(line.lot),
      })
    }
  }

  const reason = (input.overrideReason ?? '').trim()
  if (blocked.length > 0 && reason.length === 0) {
    const first = blocked[0]
    const extra = blocked.length > 1 ? ` and ${blocked.length - 1} more` : ''
    return {
      ok: false,
      reason: 'short_date',
      message: `${first.sku} expires ${first.expiry_date} (${first.days_until_expiry} days left)${extra}. Outbound transfers need ${minDays} days of shelf life, or a reason to send short-dated stock.`,
      min_days: minDays,
      blocked,
    }
  }

  return {
    ok: true,
    min_days: minDays,
    blocked,
    overridden: blocked.length > 0,
  }
}
