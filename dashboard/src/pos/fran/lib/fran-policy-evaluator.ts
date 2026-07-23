import type { SkumsPosBasketQuote, SkumsPosBasketQuoteLine } from '@pos/shared'
import type {
  FranBasketPreview,
  FranCounterMember,
  FranCounterSession,
  FranEarnMultiplier,
  FranEvaluationTraceRule,
  FranLoyaltyPolicyBundle,
  FranPointsRedemptionOffer,
  FranRewardCatalogueItem,
  FranRewardDecision,
  FranTierProgress,
  FranVoucherScan,
} from '../types'
import {
  bestFwbRedeemDenom,
  computeFwbEarnPoints,
  fwbCalendarYearWindow,
  fwbRedeemOptions,
  fwbTierRateFromKey,
} from './fwb-earn'

interface FranPolicyEvaluationInput {
  policyBundle: FranLoyaltyPolicyBundle
  quote: SkumsPosBasketQuote
  session: FranCounterSession
  calculatedAt?: string
  /** Scanned birthday / category / redeem vouchers at counter (PDF QR flow). */
  voucherScans?: FranVoucherScan[]
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function roundedPoints(value: number, mode: FranLoyaltyPolicyBundle['earn']['rounding']) {
  if (mode === 'round') return Math.round(value)
  if (mode === 'ceil') return Math.ceil(value)
  return Math.floor(value)
}

function addMinutes(minutes: number, from = Date.now()) {
  return new Date(from + minutes * 60 * 1000).toISOString()
}

function isExpired(expiresAt: string | null) {
  if (!expiresAt) return false
  const expiry = new Date(expiresAt).getTime()
  return Number.isFinite(expiry) && expiry < Date.now()
}

function memberCanEarn(session: FranCounterSession) {
  return session.mode === 'member' && Boolean(session.member && !session.member.tourist)
}

function matchingTier(policy: FranLoyaltyPolicyBundle, member: FranCounterMember | null) {
  const sorted = [...policy.tiers].sort((a, b) => a.sortOrder - b.sortOrder)
  const tier = sorted.find((item) => item.key === member?.tier) ?? sorted[0] ?? null
  return { tier, sorted }
}

function lineHasExcludedFlag(line: SkumsPosBasketQuoteLine, excludedFlags: string[]) {
  return line.restricted_flags.some((flag) => excludedFlags.includes(flag))
}

function eligibleEarnLines(policy: FranLoyaltyPolicyBundle, quote: SkumsPosBasketQuote) {
  return quote.lines.filter((line) => (
    line.quantity > 0 &&
    line.reward_eligible &&
    !lineHasExcludedFlag(line, policy.earn.excludedRestrictedFlags)
  ))
}

function lineGross(line: SkumsPosBasketQuoteLine) {
  return roundCurrency(line.unit_price * line.quantity)
}

function buildTierProgress(
  member: FranCounterMember,
  policy: FranLoyaltyPolicyBundle,
  transactionValue: number,
  calculatedAt: string,
  traceRules: FranEvaluationTraceRule[]
): FranTierProgress | null {
  if (member.tourist || member.tier === 'Tourist') return null

  const { tier, sorted } = matchingTier(policy, member)
  if (!tier) return null
  const next = sorted.find((item) => item.annualSpendThreshold > tier.annualSpendThreshold) ?? null
  // FWB PDF: calendar-year YTD spend (prefer calendarYtdSpend, fall back to trailing field)
  const currentWindowSpend = roundCurrency(
    Math.max(0, member.calendarYtdSpend ?? member.trailingTwelveMonthSpend ?? 0),
  )
  const projectedWindowSpend = roundCurrency(currentWindowSpend + transactionValue)
  const window = fwbCalendarYearWindow(new Date(calculatedAt))

  traceRules.push({
    ruleId: 'tier.calendar_year',
    type: 'tier',
    label: 'FWB calendar-year tier progress',
    inputs: {
      memberTier: member.tier,
      currentWindowSpend,
      transactionValue,
      policyVersionId: policy.policyVersionId,
      year: window.year,
    },
    output: {
      projectedWindowSpend,
      nextTier: next?.key ?? null,
    },
  })

  if (!next) {
    return {
      currentTier: tier.key,
      currentTierLabel: member.tierLabel ?? tier.label,
      nextTier: null,
      nextTierLabel: null,
      measurementWindow: 'calendar_year',
      windowStart: window.windowStart,
      windowEnd: window.windowEnd,
      currency: policy.currency,
      currentWindowSpend,
      transactionValue,
      projectedWindowSpend,
      nextTierThreshold: null,
      spendRequiredForNextTier: null,
      gapBeforeTransaction: 0,
      gapRemaining: 0,
      crossesTierThreshold: false,
      progressPercent: 100,
      upgradeAlert: null,
    }
  }

  const gapBeforeTransaction = roundCurrency(Math.max(0, next.annualSpendThreshold - currentWindowSpend))
  const gapRemaining = roundCurrency(Math.max(0, next.annualSpendThreshold - projectedWindowSpend))
  const crossesTierThreshold = currentWindowSpend < next.annualSpendThreshold && projectedWindowSpend >= next.annualSpendThreshold
  const progressPercent = next.annualSpendThreshold > 0
    ? Math.min(100, Math.round((projectedWindowSpend / next.annualSpendThreshold) * 100))
    : 100

  return {
    currentTier: tier.key,
    currentTierLabel: member.tierLabel ?? tier.label,
    nextTier: next.key,
    nextTierLabel: next.label,
    measurementWindow: 'calendar_year',
    windowStart: window.windowStart,
    windowEnd: window.windowEnd,
    currency: policy.currency,
    currentWindowSpend,
    transactionValue,
    projectedWindowSpend,
    nextTierThreshold: next.annualSpendThreshold,
    spendRequiredForNextTier: next.annualSpendThreshold,
    gapBeforeTransaction,
    gapRemaining,
    crossesTierThreshold,
    progressPercent,
    upgradeAlert: crossesTierThreshold
      ? `This transaction brings ${member.name} to ${next.label} based on FWB calendar-year spend.`
      : null,
  }
}

function categorySpend(lines: SkumsPosBasketQuoteLine[], category: string) {
  return roundCurrency(lines
    .filter((line) => line.category_name?.toLowerCase() === category.toLowerCase())
    .reduce((sum, line) => sum + Math.max(0, line.line_total), 0))
}

function voucherKinds(scans: FranVoucherScan[] | undefined) {
  const set = new Set((scans || []).map((v) => v.kind))
  return {
    birthdayVoucher: set.has('birthday'),
    categoryVoucher: set.has('category_bonus'),
    redeemVoucher: set.has('points_redeem'),
  }
}

/**
 * Build earn components for FWB additive stack (PDF §5).
 * Multiplier field on each row is the **rate contribution** (tier rate or +1 add), not a product factor.
 */
function buildEarnMultipliers(
  policy: FranLoyaltyPolicyBundle,
  quote: SkumsPosBasketQuote,
  session: FranCounterSession,
  eligibleLines: SkumsPosBasketQuoteLine[],
  traceRules: FranEvaluationTraceRule[],
  voucherScans?: FranVoucherScan[],
) {
  const member = session.member
  if (!memberCanEarn(session) || !member) return []
  const { tier } = matchingTier(policy, member)
  const tierRate = tier?.earnMultiplier ?? fwbTierRateFromKey(member.tier)
  const vouchers = voucherKinds(voucherScans)
  const currentMonth = new Date().getMonth() + 1
  // Birthday: PDF requires voucher at POS; also allow month match when voucher scanned or policy allows auto.
  const birthdayMonthMatch = member.birthdayMonth === currentMonth
  const birthdayApplies =
    vouchers.birthdayVoucher ||
    (policy.bonuses.birthdayRequiresVoucher === false && birthdayMonthMatch)

  const multipliers: FranEarnMultiplier[] = [
    {
      kind: 'tier',
      code: `tier-${tier?.key ?? member.tier}`.toLowerCase(),
      label: `${tier?.label ?? member.tier} tier rate`,
      multiplier: tierRate,
      applied: true,
      reason: null,
    },
    {
      kind: 'birthday',
      code: 'birthday-month',
      label: 'Birthday bonus (+1.00)',
      // FWB: +1.00 additive contribution when active (display rate slice, not product factor)
      multiplier: birthdayApplies ? 1 : 0,
      applied: birthdayApplies,
      reason: birthdayApplies
        ? null
        : vouchers.birthdayVoucher
          ? null
          : 'Scan birthday voucher (or set birthday month) to activate +1.00.',
    },
  ]

  let anyCategoryApplied = false
  for (const rule of policy.bonuses.categoryMultipliers) {
    const spend = categorySpend(eligibleLines, rule.category)
    const scopeOk = spend >= rule.minimumSpend
    // Category bonus needs voucher scan per PDF, unless policy disables it
    const voucherOk = vouchers.categoryVoucher || policy.bonuses.categoryRequiresVoucher === false
    const applied = scopeOk && voucherOk
    if (applied) anyCategoryApplied = true
    multipliers.push({
      kind: 'category',
      code: rule.ruleId,
      label: `${rule.label} (+1.00)`,
      multiplier: applied ? 1 : 0,
      applied,
      reason: applied
        ? null
        : !voucherOk
          ? 'Scan category bonus voucher at checkout.'
          : `${rule.category} spend must be at least ${policy.currency} ${rule.minimumSpend.toFixed(2)}.`,
    })
  }

  // Campaign adds: treat applied campaign as +1 FWB-style (not product of 1.5×)
  for (const rule of policy.bonuses.campaignMultipliers) {
    const hasSku = eligibleLines.some((line) => rule.skuPrefixes.some((prefix) => line.sku.startsWith(prefix)))
    const applied = hasSku && quote.total >= rule.minimumSpend
    multipliers.push({
      kind: 'campaign',
      code: rule.code,
      label: `${rule.label} (+1.00)`,
      multiplier: applied ? 1 : 0,
      applied,
      reason: applied
        ? null
        : hasSku
          ? `Basket must be at least ${policy.currency} ${rule.minimumSpend.toFixed(2)}.`
          : 'No campaign product in basket.',
    })
  }

  if (policy.bonuses.checkInPoints > 0) {
    multipliers.push({
      kind: 'check_in',
      code: 'counter-session-check-in',
      label: 'Counter check-in (flat pts, not in multiplier)',
      multiplier: 0,
      applied: true,
      reason: null,
    })
  }

  for (const multiplier of multipliers) {
    traceRules.push({
      ruleId: multiplier.code,
      type: 'bonus',
      label: multiplier.label,
      inputs: {
        rateContribution: multiplier.multiplier,
        basketTotal: quote.total,
        stackMode: 'fwb_additive',
        anyCategoryApplied,
      },
      output: {
        applied: multiplier.applied,
        reason: multiplier.reason,
      },
    })
  }

  return multipliers
}

function buildPointsRedemptionOffer(
  member: FranCounterMember | null,
  policy: FranLoyaltyPolicyBundle,
  quote: SkumsPosBasketQuote,
  traceRules: FranEvaluationTraceRule[]
): FranPointsRedemptionOffer | null {
  if (!member || member.tourist) return null

  const availablePoints = Math.max(0, member.pointsBalance)
  const dens = policy.redemption.fixedDenominations?.length
    ? policy.redemption.fixedDenominations
    : fwbRedeemOptions(Number.MAX_SAFE_INTEGER).map((d) => ({
        points: d.points,
        discount: d.discount,
      }))
  const minDenom = dens.reduce((m, d) => Math.min(m, d.points), dens[0]?.points ?? policy.redemption.minimumPoints)
  const minimumPoints = policy.redemption.minimumPoints || minDenom
  const livePolicyRequired = policy.redemption.requiresLiveQuote && policy.cache.status !== 'fresh'
  const best = dens
    .filter((d) => availablePoints >= d.points)
    .sort((a, b) => b.points - a.points)[0] ?? bestFwbRedeemDenom(availablePoints)
  const maximumPoints = best?.points ?? 0
  const availableValue = best ? roundCurrency(best.discount) : 0
  const minRow = dens.find((d) => d.points === minimumPoints) ?? dens[0]
  const eligible = !livePolicyRequired && quote.total > 0 && Boolean(best)
  const reason = eligible
    ? null
    : livePolicyRequired
      ? 'Live CRM policy is required for redemption.'
      : quote.total <= 0
        ? 'Add sale items before redeeming points.'
        : `Member needs at least ${minimumPoints.toLocaleString()} points (fixed FWB dens).`

  const options = dens
    .filter((d) => availablePoints >= d.points)
    .map((d) => ({
      points: d.points,
      discount: d.discount,
      conversionPerPoint: d.discount / d.points,
    }))

  traceRules.push({
    ruleId: 'redemption.fwb_fixed_denoms',
    type: 'redemption',
    label: 'FWB fixed denomination redemption',
    inputs: {
      availablePoints,
      minimumPoints,
      maximumPoints,
      policyCacheStatus: policy.cache.status,
      quoteTotal: quote.total,
      options,
    },
    output: {
      eligible,
      reason,
      best,
    },
    blockedReason: eligible ? null : reason,
  })

  return {
    availablePoints,
    minimumPoints,
    maximumPoints,
    pointsToCurrencyRate: best ? best.discount / best.points : policy.redemption.pointsToCurrencyRate,
    availableValue,
    minimumValue: minRow ? roundCurrency(minRow.discount) : 0,
    currency: policy.currency,
    eligible,
    reason,
    fixedDenominations: options,
  }
}

function rewardMatchesTier(reward: FranLoyaltyPolicyBundle['rewards'][number], member: FranCounterMember) {
  return !reward.eligibleTierKeys?.length || reward.eligibleTierKeys.includes(member.tier)
}

function rewardBlockedByFlags(reward: FranLoyaltyPolicyBundle['rewards'][number], quote: SkumsPosBasketQuote) {
  const flags = reward.restrictedFlags ?? []
  if (flags.length === 0) return false
  return quote.lines.some((line) => line.restricted_flags.some((flag) => flags.includes(flag)))
}

function buildRedeemableRewards(
  member: FranCounterMember | null,
  policy: FranLoyaltyPolicyBundle,
  quote: SkumsPosBasketQuote,
  traceRules: FranEvaluationTraceRule[]
): FranRewardCatalogueItem[] {
  if (!member || member.tourist) return []

  return policy.rewards
    .filter((reward) => !isExpired(reward.expiresAt))
    .map((reward) => {
      const livePolicyRequired = policy.redemption.requiresLiveQuote && policy.cache.status !== 'fresh'
      const eligible =
        !livePolicyRequired &&
        member.pointsBalance >= reward.pointsCost &&
        rewardMatchesTier(reward, member) &&
        !rewardBlockedByFlags(reward, quote)
      const reason = eligible
        ? null
        : livePolicyRequired
          ? 'Live CRM policy is required for catalogue rewards.'
          : member.pointsBalance < reward.pointsCost
            ? `Requires ${reward.pointsCost.toLocaleString()} points.`
            : !rewardMatchesTier(reward, member)
              ? 'Member tier is not eligible.'
              : 'Basket has restricted items for this reward.'

      traceRules.push({
        ruleId: `reward.${reward.id}`,
        type: 'reward',
        label: reward.name,
        inputs: {
          pointsBalance: member.pointsBalance,
          pointsCost: reward.pointsCost,
          tier: member.tier,
          policyCacheStatus: policy.cache.status,
        },
        output: {
          eligible,
          reason,
        },
        blockedReason: eligible ? null : reason,
      })

      return {
        id: reward.id,
        name: reward.name,
        description: reward.description,
        valueType: reward.valueType,
        pointsCost: reward.pointsCost,
        value: reward.value,
        valueLabel: reward.valueLabel,
        expiresAt: reward.expiresAt,
        currency: policy.currency,
        eligible,
        reason,
      }
    })
    .filter((reward) => reward.eligible)
}

function buildRewardDecisions(
  pointsRedemption: FranPointsRedemptionOffer | null,
  quote: SkumsPosBasketQuote
): FranRewardDecision[] {
  if (!pointsRedemption) return []
  return [
    {
      id: 'fran-points-redemption',
      title: 'Points redemption',
      description: 'Cashier-selected partial points redemption. Customer confirmation required.',
      kind: 'points_redemption',
      value: pointsRedemption.availableValue,
      pointsCost: 0,
      expiresAt: quote.expires_at,
      eligible: pointsRedemption.eligible,
      reason: pointsRedemption.reason,
      requiresConfirmation: true,
    },
  ]
}

export function evaluateFranPolicy(input: FranPolicyEvaluationInput): FranBasketPreview {
  const policy = input.policyBundle
  const quote = input.quote
  const session = input.session
  const member = session.member
  const calculatedAt = input.calculatedAt ?? new Date().toISOString()
  const voucherScans = input.voucherScans || []
  const traceRules: FranEvaluationTraceRule[] = []
  const blockedReasons: string[] = []
  const warnings = [...policy.warnings, ...quote.warnings]
  if (policy.cache.status === 'stale') {
    warnings.push('Cached loyalty policy is stale; redemption is blocked until Fran CRM refreshes.')
  } else if (policy.cache.status === 'offline_fallback') {
    warnings.push('Using cached loyalty policy because Fran CRM is offline.')
  }
  if (quote.stale) warnings.push('SKUMS basket quote is stale; refresh before final reward decisions.')
  if (
    memberCanEarn(session) &&
    member &&
    member.calendarYtdSpend == null &&
    member.trailingTwelveMonthSpend == null
  ) {
    warnings.push('CRM member snapshot did not include calendar YTD spend; tier progress uses zero as the local fallback.')
  }

  const canEarn = memberCanEarn(session)
  const eligibleLines = eligibleEarnLines(policy, quote)
  const excludedLines = quote.lines.filter((line) => !eligibleLines.includes(line))
  for (const line of excludedLines) {
    if (line.quantity <= 0) continue
    if (!line.reward_eligible || lineHasExcludedFlag(line, policy.earn.excludedRestrictedFlags)) {
      traceRules.push({
        ruleId: `earn.line.${line.quote_line_id}`,
        type: 'earn',
        label: 'Line earn eligibility',
        inputs: {
          sku: line.sku,
          rewardEligible: line.reward_eligible,
          restrictedFlags: line.restricted_flags,
        },
        output: {
          included: false,
        },
        blockedReason: 'Line is not loyalty-earn eligible.',
      })
    }
  }

  const subtotal = roundCurrency(eligibleLines.reduce((sum, line) => sum + lineGross(line), 0))
  const discountTotal = roundCurrency(eligibleLines.reduce((sum, line) => sum + line.discount_amount, 0))
  const totalAfterDiscount = roundCurrency(eligibleLines.reduce((sum, line) => sum + Math.max(0, line.line_total), 0))
  const baseAmount = canEarn
    ? policy.earn.basis === 'pre_discount' ? subtotal : totalAfterDiscount
    : 0
  const multipliers = buildEarnMultipliers(
    policy,
    quote,
    session,
    eligibleLines,
    traceRules,
    voucherScans,
  )

  // FWB additive stack (PDF §5) — not a product of multipliers
  const tierRate =
    multipliers.find((m) => m.kind === 'tier' && m.applied)?.multiplier ??
    fwbTierRateFromKey(member?.tier)
  const birthdayActive = Boolean(multipliers.find((m) => m.kind === 'birthday' && m.applied))
  const categoryActive = Boolean(multipliers.find((m) => m.kind === 'category' && m.applied))
  const campaignAdds = multipliers
    .filter((m) => m.kind === 'campaign' && m.applied)
    .map((m) => m.multiplier)

  const fwb = canEarn && baseAmount >= policy.earn.minimumEligibleAmount
    ? computeFwbEarnPoints({
        spend: baseAmount * policy.earn.pointsPerCurrencyUnit,
        tierRate,
        birthdayActive,
        categoryActive,
        campaignAdds,
      })
    : {
        tierRate,
        birthdayAdd: 0,
        categoryAdd: 0,
        campaignAdd: 0,
        totalMultiplier: 0,
        points: 0,
      }

  const totalMultiplier = fwb.totalMultiplier
  const checkInPoints = canEarn ? policy.bonuses.checkInPoints : 0
  // FWB uses floor(); check-in flat pts are outside the spend multiplier (PDF §6)
  const earnPoints = canEarn
    ? Math.max(0, roundedPoints(fwb.points, policy.earn.rounding === 'floor' ? 'floor' : policy.earn.rounding) + checkInPoints)
    : 0

  traceRules.push({
    ruleId: 'earn.final.fwb',
    type: 'earn',
    label: 'FWB final earn (additive stack)',
    inputs: {
      basis: policy.earn.basis,
      baseAmount,
      pointsPerCurrencyUnit: policy.earn.pointsPerCurrencyUnit,
      tierRate: fwb.tierRate,
      birthdayAdd: fwb.birthdayAdd,
      categoryAdd: fwb.categoryAdd,
      campaignAdd: fwb.campaignAdd,
      totalMultiplier,
      checkInPoints,
      voucherScans: voucherScans.map((v) => v.kind),
      formula: 'floor(spend × (tier + bday + cat + campaigns)) + check_in',
    },
    output: {
      earnPoints,
    },
    rounding: policy.earn.rounding,
    blockedReason: canEarn ? null : 'No earning member attached to this sale.',
  })
  if (!canEarn) blockedReasons.push('No earning member attached to this sale.')

  const projectedPointsBalance = member && !member.tourist ? member.pointsBalance + earnPoints : null
  const tierProgress = member && canEarn
    ? buildTierProgress(member, policy, totalAfterDiscount, calculatedAt, traceRules)
    : null
  const pointsRedemption = buildPointsRedemptionOffer(member, policy, quote, traceRules)
  if (pointsRedemption && !pointsRedemption.eligible && pointsRedemption.reason) {
    blockedReasons.push(pointsRedemption.reason)
  }
  const redeemableRewards = buildRedeemableRewards(member, policy, quote, traceRules)
  const rewardsAvailable = buildRewardDecisions(pointsRedemption, quote)
  const activeRewardCatalogueSize = policy.rewards.filter((reward) => !isExpired(reward.expiresAt)).length

  return {
    previewId: `fran_eval_${quote.quote_id}`,
    sessionId: session.sessionId,
    memberId: member?.id ?? null,
    policyVersionId: policy.policyVersionId,
    assignmentId: policy.assignmentId,
    skumsQuoteId: quote.quote_id,
    skumsQuote: quote,
    policyCacheStatus: policy.cache.status,
    evaluationTrace: {
      traceId: `fran_trace_${policy.policyVersionId}_${quote.quote_id}_${Date.now()}`,
      policyVersionId: policy.policyVersionId,
      assignmentId: policy.assignmentId,
      skumsQuoteId: quote.quote_id,
      evaluatedAt: calculatedAt,
      rules: traceRules,
      blockedReasons,
      warnings,
      final: {
        earnPoints,
        projectedPointsBalance,
        rewardDecisionCount: rewardsAvailable.length + redeemableRewards.length,
        redemptionEligible: Boolean(pointsRedemption?.eligible),
      },
    },
    earnPoints,
    projectedPointsBalance,
    earnProjection: {
      sourceSystem: 'fran_skums',
      policy: {
        basis: policy.earn.basis,
        pointsPerCurrencyUnit: policy.earn.pointsPerCurrencyUnit,
        rounding: policy.earn.rounding,
        currency: policy.currency,
        policyVersionId: policy.policyVersionId,
        assignmentId: policy.assignmentId,
      },
      baseAmount,
      subtotal,
      discountTotal,
      totalAfterDiscount,
      totalMultiplier,
      projectedEarnPoints: earnPoints,
      multipliers,
      calculatedAt,
    },
    tierProgress,
    pointsRedemption,
    redeemableRewards,
    rewardCatalogueSize: member && !member.tourist ? activeRewardCatalogueSize : 0,
    rewardsAvailable,
    warnings,
    expiresAt: quote.expires_at || addMinutes(10),
  }
}
