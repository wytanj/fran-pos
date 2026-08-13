/**
 * FWB tier display for POS (loyaltys.pdf F1 / F2 / F3).
 * Accepts legacy Base / Silver / Gold keys from older CRM snapshots.
 */
import { FWB_TIER_RATES, fwbTierRateFromKey } from './fwb-earn'
import type { FranCounterTier } from '../types'

export type FwbTierNormalized = 'F1' | 'F2' | 'F3' | 'Tourist' | 'Unknown'

export function normalizeFwbTierKey(tier: FranCounterTier | string | null | undefined): FwbTierNormalized {
  const key = String(tier || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
  if (!key) return 'Unknown'
  if (key === 'TOURIST') return 'Tourist'
  if (key === 'F1' || key === 'TIER1' || key === 'BASE') return 'F1'
  if (key === 'F2' || key === 'TIER2' || key === 'SILVER') return 'F2'
  if (key === 'F3' || key === 'TIER3' || key === 'GOLD') return 'F3'
  return 'Unknown'
}

/** Cashier-facing label: prefer CRM tierLabel, else FWB name. */
export function tierLabel(tier: FranCounterTier | string, label?: string | null): string {
  if (label && String(label).trim()) return String(label).trim()
  const n = normalizeFwbTierKey(tier)
  if (n === 'F1') return 'Tier 1'
  if (n === 'F2') return 'Tier 2'
  if (n === 'F3') return 'Tier 3'
  if (n === 'Tourist') return 'Tourist'
  return String(tier || 'Member')
}

export function tierBadgeClass(tier: FranCounterTier | string): string {
  const n = normalizeFwbTierKey(tier)
  switch (n) {
    case 'F3':
      return 'border-yellow bg-yellow text-brown'
    case 'F2':
      return 'border-tan bg-peach-soft text-brown'
    case 'F1':
      return 'border-line bg-surface-sunken text-ink'
    case 'Tourist':
      return 'border-line-strong bg-white text-ink-soft'
    default:
      return 'border-line bg-white text-ink'
  }
}

/** Earn rate for this tier (1.00 / 1.25 / 1.50). */
export function tierEarnRate(tier: FranCounterTier | string): number {
  const n = normalizeFwbTierKey(tier)
  if (n === 'F3') return FWB_TIER_RATES.F3
  if (n === 'F2') return FWB_TIER_RATES.F2
  if (n === 'F1') return FWB_TIER_RATES.F1
  return fwbTierRateFromKey(String(tier))
}

export function tierEarnRateLabel(tier: FranCounterTier | string): string {
  const rate = tierEarnRate(tier)
  return `${rate.toFixed(2)}× earn`
}

/** Short subtitle for member list rows. */
export function tierSummaryLine(opts: {
  tier: FranCounterTier | string
  tierLabel?: string | null
  calendarYtdSpend?: number | null
  trailingTwelveMonthSpend?: number | null
  currency?: string
}): string {
  const rate = tierEarnRateLabel(opts.tier)
  const ytd = opts.calendarYtdSpend ?? opts.trailingTwelveMonthSpend
  if (ytd != null && Number.isFinite(ytd)) {
    const cur = opts.currency || 'SGD'
    return `${rate} · YTD ${cur} ${Number(ytd).toFixed(0)}`
  }
  return rate
}
