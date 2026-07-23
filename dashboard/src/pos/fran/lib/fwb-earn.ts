/**
 * Fran’s With Benefits — pure earn / redeem helpers (loyaltys.pdf).
 *
 * Total Multiplier = Tier Rate + Birthday Bonus (+1.00 if active) + Category Bonus (+1.00 if active)
 * Total Points = floor(Spend × Total Multiplier)
 *
 * POS evaluator and CRM mocks should call these so golden tests stay single-sourced.
 */

export const FWB_TIER_RATES = {
  F1: 1.0,
  F2: 1.25,
  F3: 1.5,
} as const

export type FwbTierKey = keyof typeof FWB_TIER_RATES

/** Fixed redemption denominations from FWB PDF §3 */
export const FWB_REDEEM_DENOMS = [
  { points: 200, discount: 6 },
  { points: 500, discount: 20 },
  { points: 1000, discount: 50 },
  { points: 1500, discount: 90 },
  { points: 2500, discount: 175 },
] as const

export const FWB_TIER_THRESHOLDS = [
  { key: 'F1', label: 'Tier 1', annualSpendThreshold: 0, earnRate: FWB_TIER_RATES.F1, sortOrder: 0 },
  { key: 'F2', label: 'Tier 2', annualSpendThreshold: 500, earnRate: FWB_TIER_RATES.F2, sortOrder: 1 },
  { key: 'F3', label: 'Tier 3', annualSpendThreshold: 1250, earnRate: FWB_TIER_RATES.F3, sortOrder: 2 },
] as const

export interface FwbEarnInput {
  /** Net eligible spend (post-discount basket portion that earns) */
  spend: number
  /** Base tier rate e.g. 1.0 / 1.25 / 1.5 */
  tierRate: number
  /** Birthday voucher / month active → +1.00 */
  birthdayActive?: boolean
  /** Category bonus voucher / promo active → +1.00 */
  categoryActive?: boolean
  /** Extra additive campaign adds (each full +N on the rate) */
  campaignAdds?: number[]
}

export interface FwbEarnResult {
  tierRate: number
  birthdayAdd: number
  categoryAdd: number
  campaignAdd: number
  totalMultiplier: number
  points: number
}

/**
 * FWB earn formula (PDF §5).
 * Birthday and category each contribute a flat +1.00 when active (not a product of rates).
 */
export function computeFwbEarnPoints(input: FwbEarnInput): FwbEarnResult {
  const spend = Math.max(0, Number(input.spend) || 0)
  const tierRate = Math.max(0, Number(input.tierRate) || 0)
  const birthdayAdd = input.birthdayActive ? 1 : 0
  const categoryAdd = input.categoryActive ? 1 : 0
  const campaignAdd = (input.campaignAdds || []).reduce(
    (sum, n) => sum + Math.max(0, Number(n) || 0),
    0,
  )
  const totalMultiplier = tierRate + birthdayAdd + categoryAdd + campaignAdd
  const points = Math.floor(spend * totalMultiplier)
  return {
    tierRate,
    birthdayAdd,
    categoryAdd,
    campaignAdd,
    totalMultiplier,
    points,
  }
}

export function fwbTierRateFromKey(tierKey: string | null | undefined): number {
  const key = String(tierKey || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
  if (key === 'F1' || key === 'TIER1' || key === 'BASE') return FWB_TIER_RATES.F1
  if (key === 'F2' || key === 'TIER2' || key === 'SILVER') return FWB_TIER_RATES.F2
  if (key === 'F3' || key === 'TIER3' || key === 'GOLD') return FWB_TIER_RATES.F3
  return FWB_TIER_RATES.F1
}

/** Highest fixed denom the member can redeem with available points. */
export function bestFwbRedeemDenom(availablePoints: number) {
  const pts = Math.max(0, Math.floor(availablePoints))
  let best: (typeof FWB_REDEEM_DENOMS)[number] | null = null
  for (const row of FWB_REDEEM_DENOMS) {
    if (pts >= row.points) best = row
  }
  return best
}

export function fwbRedeemOptions(availablePoints: number) {
  const pts = Math.max(0, Math.floor(availablePoints))
  return FWB_REDEEM_DENOMS.filter((row) => pts >= row.points).map((row) => ({
    points: row.points,
    discount: row.discount,
    conversionPerPoint: row.discount / row.points,
  }))
}

/** Calendar-year window for FWB YTD / tier qualification (PDF §1). */
export function fwbCalendarYearWindow(at: Date = new Date()) {
  const year = at.getFullYear()
  return {
    measurementWindow: 'calendar_year' as const,
    windowStart: new Date(Date.UTC(year, 0, 1, 0, 0, 0)).toISOString(),
    windowEnd: new Date(Date.UTC(year, 11, 31, 23, 59, 59)).toISOString(),
    year,
  }
}
