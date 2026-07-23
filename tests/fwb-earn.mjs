/**
 * Pure FWB earn helpers (mirrors dashboard/src/pos/fran/lib/fwb-earn.ts for node:test).
 * Keep in sync with fwb-earn.ts when changing PDF math.
 */

export const FWB_TIER_RATES = { F1: 1.0, F2: 1.25, F3: 1.5 }

export const FWB_REDEEM_DENOMS = [
  { points: 200, discount: 6 },
  { points: 500, discount: 20 },
  { points: 1000, discount: 50 },
  { points: 1500, discount: 90 },
  { points: 2500, discount: 175 },
]

export function computeFwbEarnPoints(input) {
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
  return { tierRate, birthdayAdd, categoryAdd, campaignAdd, totalMultiplier, points }
}

export function bestFwbRedeemDenom(availablePoints) {
  const pts = Math.max(0, Math.floor(availablePoints))
  let best = null
  for (const row of FWB_REDEEM_DENOMS) {
    if (pts >= row.points) best = row
  }
  return best
}
