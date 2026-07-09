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
} from '../types'

interface FranPolicyEvaluationInput {
  policyBundle: FranLoyaltyPolicyBundle
  quote: SkumsPosBasketQuote
  session: FranCounterSession
  calculatedAt?: string
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
  const currentWindowSpend = roundCurrency(Math.max(0, member.trailingTwelveMonthSpend ?? 0))
  const projectedWindowSpend = roundCurrency(currentWindowSpend + transactionValue)
  const windowEnd = new Date(calculatedAt)
  const windowStart = new Date(windowEnd)
  windowStart.setFullYear(windowStart.getFullYear() - 1)

  traceRules.push({
    ruleId: 'tier.trailing_12_months',
    type: 'tier',
    label: 'Trailing 12-month tier progress',
    inputs: {
      memberTier: member.tier,
      currentWindowSpend,
      transactionValue,
      policyVersionId: policy.policyVersionId,
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
      measurementWindow: 'trailing_12_months',
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
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
    measurementWindow: 'trailing_12_months',
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
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
      ? `This transaction brings ${member.name} to ${next.label} based on trailing 12-month spend.`
      : null,
  }
}

function categorySpend(lines: SkumsPosBasketQuoteLine[], category: string) {
  return roundCurrency(lines
    .filter((line) => line.category_name?.toLowerCase() === category.toLowerCase())
    .reduce((sum, line) => sum + Math.max(0, line.line_total), 0))
}

function buildEarnMultipliers(
  policy: FranLoyaltyPolicyBundle,
  quote: SkumsPosBasketQuote,
  session: FranCounterSession,
  eligibleLines: SkumsPosBasketQuoteLine[],
  traceRules: FranEvaluationTraceRule[]
) {
  const member = session.member
  if (!memberCanEarn(session) || !member) return []
  const { tier } = matchingTier(policy, member)
  const currentMonth = new Date().getMonth() + 1
  const birthdayApplies = member.birthdayMonth === currentMonth
  const multipliers: FranEarnMultiplier[] = [
    {
      kind: 'tier',
      code: `tier-${tier?.key ?? member.tier}`.toLowerCase(),
      label: `${tier?.label ?? member.tier} tier`,
      multiplier: tier?.earnMultiplier ?? 1,
      applied: true,
      reason: null,
    },
    {
      kind: 'birthday',
      code: 'birthday-month',
      label: 'Birthday month',
      multiplier: birthdayApplies ? policy.bonuses.birthdayMultiplier : 1,
      applied: birthdayApplies,
      reason: birthdayApplies ? null : 'Not birthday month.',
    },
  ]

  for (const rule of policy.bonuses.categoryMultipliers) {
    const spend = categorySpend(eligibleLines, rule.category)
    const applied = spend >= rule.minimumSpend
    multipliers.push({
      kind: 'category',
      code: rule.ruleId,
      label: rule.label,
      multiplier: applied ? rule.multiplier : 1,
      applied,
      reason: applied ? null : `${rule.category} spend must be at least ${policy.currency} ${rule.minimumSpend.toFixed(2)}.`,
    })
  }

  for (const rule of policy.bonuses.campaignMultipliers) {
    const hasSku = eligibleLines.some((line) => rule.skuPrefixes.some((prefix) => line.sku.startsWith(prefix)))
    const applied = hasSku && quote.total >= rule.minimumSpend
    multipliers.push({
      kind: 'campaign',
      code: rule.code,
      label: rule.label,
      multiplier: applied ? rule.multiplier : 1,
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
      label: 'Counter check-in',
      multiplier: 1,
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
        multiplier: multiplier.multiplier,
        basketTotal: quote.total,
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
  const minimumPoints = policy.redemption.minimumPoints
  const livePolicyRequired = policy.redemption.requiresLiveQuote && policy.cache.status !== 'fresh'
  const maximumPoints = Math.max(0, Math.min(
    availablePoints,
    policy.redemption.maximumPointsPerBasket ?? availablePoints
  ))
  const availableValue = roundCurrency(maximumPoints * policy.redemption.pointsToCurrencyRate)
  const eligible = !livePolicyRequired && quote.total > 0 && maximumPoints >= minimumPoints
  const reason = eligible
    ? null
    : livePolicyRequired
      ? 'Live CRM policy is required for redemption.'
      : quote.total <= 0
        ? 'Add sale items before redeeming points.'
        : `Member needs at least ${minimumPoints.toLocaleString()} points to redeem.`

  traceRules.push({
    ruleId: 'redemption.points_threshold',
    type: 'redemption',
    label: 'Points redemption threshold',
    inputs: {
      availablePoints,
      minimumPoints,
      maximumPoints,
      policyCacheStatus: policy.cache.status,
      quoteTotal: quote.total,
    },
    output: {
      eligible,
      reason,
    },
    blockedReason: eligible ? null : reason,
  })

  return {
    availablePoints,
    minimumPoints,
    maximumPoints,
    pointsToCurrencyRate: policy.redemption.pointsToCurrencyRate,
    availableValue,
    minimumValue: roundCurrency(minimumPoints * policy.redemption.pointsToCurrencyRate),
    currency: policy.currency,
    eligible,
    reason,
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
  const traceRules: FranEvaluationTraceRule[] = []
  const blockedReasons: string[] = []
  const warnings = [...policy.warnings, ...quote.warnings]
  if (policy.cache.status === 'stale') {
    warnings.push('Cached loyalty policy is stale; redemption is blocked until Fran CRM refreshes.')
  } else if (policy.cache.status === 'offline_fallback') {
    warnings.push('Using cached loyalty policy because Fran CRM is offline.')
  }
  if (quote.stale) warnings.push('SKUMS basket quote is stale; refresh before final reward decisions.')
  if (memberCanEarn(session) && member && member.trailingTwelveMonthSpend == null) {
    warnings.push('CRM member snapshot did not include trailing 12-month spend; tier progress uses zero as the local fallback.')
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
  const multipliers = buildEarnMultipliers(policy, quote, session, eligibleLines, traceRules)
  const totalMultiplier = multipliers.reduce(
    (product, multiplier) => product * (multiplier.applied ? multiplier.multiplier : 1),
    1
  )
  const calculatedEarn = baseAmount >= policy.earn.minimumEligibleAmount
    ? baseAmount * policy.earn.pointsPerCurrencyUnit * totalMultiplier
    : 0
  const checkInPoints = canEarn ? policy.bonuses.checkInPoints : 0
  const earnPoints = canEarn ? Math.max(0, roundedPoints(calculatedEarn, policy.earn.rounding) + checkInPoints) : 0

  traceRules.push({
    ruleId: 'earn.final',
    type: 'earn',
    label: 'Final earn calculation',
    inputs: {
      basis: policy.earn.basis,
      baseAmount,
      pointsPerCurrencyUnit: policy.earn.pointsPerCurrencyUnit,
      totalMultiplier,
      checkInPoints,
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
