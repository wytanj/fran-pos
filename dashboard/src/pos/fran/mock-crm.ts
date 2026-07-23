import type {
  FranBasketPreview,
  FranBasketPreviewInput,
  FranActivePerk,
  FranCounterMember,
  FranCounterSession,
  FranCounterSessionInput,
  FranCrmEventAck,
  FranCrmEventInput,
  FranEarnMultiplier,
  FranEarnPolicyBasis,
  FranEarnProjection,
  FranLoyaltyPolicyBundle,
  FranMembershipTier,
  FranMemberResolution,
  FranMemberResolutionInput,
  FranPointsExpiryAlert,
  FranPointsRedemptionOffer,
  FranRewardCatalogueItem,
  FranRewardCatalogueValueType,
  FranRewardCommit,
  FranRewardCommitInput,
  FranRewardDecision,
  FranRewardQuote,
  FranRewardQuoteInput,
  FranRewardReverse,
  FranRewardReverseInput,
  FranTierProgress,
} from './types'

/** FWB PDF tiers F1/F2/F3 — calendar-year thresholds $500 / $1,250 */
const tierThresholds = [
  { tier: 'F1', label: 'Tier 1', annualSpend: 0, earnMultiplier: 1 },
  { tier: 'F2', label: 'Tier 2', annualSpend: 500, earnMultiplier: 1.25 },
  { tier: 'F3', label: 'Tier 3', annualSpend: 1250, earnMultiplier: 1.5 },
] satisfies Array<{ tier: FranMembershipTier; label: string; annualSpend: number; earnMultiplier: number }>

const calendarYtdSpendByMemberId: Record<string, number> = {
  'fran-member-001': 620,
  'fran-member-002': 180,
}

/** FWB PDF §3 fixed redemption dens */
const fwbRedeemDens = [
  { points: 200, discount: 6 },
  { points: 500, discount: 20 },
  { points: 1000, discount: 50 },
  { points: 1500, discount: 90 },
  { points: 2500, discount: 175 },
]

const earnPolicy: { basis: FranEarnPolicyBasis; pointsPerCurrencyUnit: number } = {
  basis: 'post_discount',
  pointsPerCurrencyUnit: 1,
}

const pointsRedemptionPolicy = {
  minimumPoints: 200,
  pointsToCurrencyRate: 0.03,
}

const pointsExpiryPolicy = {
  lookaheadDays: 30,
}

const expiringPointLotsByMemberId: Record<string, Array<{ points: number; expiresAt: string }>> = {
  'fran-member-001': [
    { points: 620, expiresAt: addDaysIso(14) },
    { points: 180, expiresAt: addDaysIso(46) },
  ],
  'fran-member-002': [
    { points: 240, expiresAt: addDaysIso(24) },
  ],
}

const rewardCatalogue = [
  {
    id: 'reward-400-cleanser-sample',
    name: 'Free Cleanser Sample',
    description: 'Limited-time cleanser sample reward for active members.',
    valueType: 'product_value',
    pointsCost: 400,
    value: 8,
    valueLabel: 'Cleanser Sample, SGD 8.00 value',
    expiresAt: '2099-06-30T23:59:59+08:00',
  },
  {
    id: 'reward-500-5off',
    name: 'SGD 5 basket reward',
    description: 'Redeem points for SGD 5 off the current sale.',
    valueType: 'dollar_value',
    pointsCost: 500,
    value: 5,
    valueLabel: 'SGD 5.00 off',
    expiresAt: null,
  },
  {
    id: 'reward-1000-10off',
    name: 'SGD 10 basket reward',
    description: 'Redeem points for SGD 10 off the current sale.',
    valueType: 'dollar_value',
    pointsCost: 1000,
    value: 10,
    valueLabel: 'SGD 10.00 off',
    expiresAt: null,
  },
  {
    id: 'reward-1800-atomizer',
    name: 'Travel atomizer reward',
    description: 'Redeem for a refillable travel atomizer product reward.',
    valueType: 'product_value',
    pointsCost: 1800,
    value: 28,
    valueLabel: 'Refillable Travel Atomizer, SGD 28.00 value',
    expiresAt: null,
  },
  {
    id: 'reward-2500-25off',
    name: 'SGD 25 premium reward',
    description: 'Higher value basket reward for larger point balances.',
    valueType: 'dollar_value',
    pointsCost: 2500,
    value: 25,
    valueLabel: 'SGD 25.00 off',
    expiresAt: null,
  },
  {
    id: 'reward-expired-mini-mask',
    name: 'Expired Mini Mask Reward',
    description: 'Expired demo reward that must never appear in the POS catalogue.',
    valueType: 'product_value',
    pointsCost: 300,
    value: 6,
    valueLabel: 'Mini Mask, SGD 6.00 value',
    expiresAt: '2020-06-30T23:59:59+08:00',
  },
] satisfies Array<{
  id: string
  name: string
  description: string
  valueType: FranRewardCatalogueValueType
  pointsCost: number
  value: number
  valueLabel: string
  expiresAt: string | null
}>

export const FRAN_MOCK_MEMBERS: FranCounterMember[] = [
  {
    id: 'fran-member-001',
    crmCustomerId: 'crm_fran_001',
    memberNo: 'FRAN1001',
    name: 'Mei Lin Koh',
    phone: '+65 9123 4567',
    email: 'meilin.koh@example.com',
    tier: 'F2',
    tierLabel: 'Tier 2',
    pointsBalance: 2480,
    calendarYtdSpend: 620,
    trailingTwelveMonthSpend: 620,
    memberSince: '2024-03-18',
    birthday: '1991-07-18',
    birthdayMonth: 7,
    pointsExpireAt: '2027-06-30',
    expiresAt: '2027-06-30',
    rewardCount: 2,
    tourist: false,
    warnings: [],
  },
  {
    id: 'fran-member-002',
    crmCustomerId: 'crm_fran_002',
    memberNo: 'FRAN2048',
    name: 'Alicia Tan',
    phone: '+65 9876 5432',
    email: 'alicia.tan@example.com',
    tier: 'F1',
    tierLabel: 'Tier 1',
    pointsBalance: 840,
    calendarYtdSpend: 180,
    trailingTwelveMonthSpend: 180,
    memberSince: '2025-01-09',
    birthday: '1996-11-03',
    birthdayMonth: 11,
    pointsExpireAt: '2026-12-31',
    expiresAt: '2026-12-31',
    rewardCount: 1,
    tourist: false,
    warnings: ['Membership expires within this calendar year.'],
  },
  {
    id: 'fran-tourist-001',
    crmCustomerId: 'crm_fran_tourist_001',
    memberNo: 'TOUR-7781',
    name: 'Visitor Profile',
    phone: '+81 90 1000 7781',
    email: null,
    tier: 'Tourist',
    pointsBalance: 0,
    memberSince: null,
    birthday: null,
    birthdayMonth: null,
    pointsExpireAt: null,
    expiresAt: null,
    rewardCount: 0,
    tourist: true,
    warnings: ['Tourist exception: do not enrol without explicit consent.'],
  },
]

function nowIso() {
  return new Date().toISOString()
}

function addMinutes(minutes: number) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString()
}

function addDaysIso(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
}

export function mockActivePolicyBundle(input: { workspaceId?: string; programKey?: string } = {}): FranLoyaltyPolicyBundle {
  const workspaceId = input.workspaceId || 'demo'
  const programKey = input.programKey || 'fran-v2'
  const policyVersionId = 'fran-v2.1-demo'
  const assignmentId = 'fran-orchard-demo-assignment'
  const cachedAt = nowIso()

  return {
    workspaceId,
    programKey,
    policyVersionId,
    assignmentId,
    label: "Fran's With Benefits (FWB) demo policy",
    currency: 'SGD',
    activeFrom: '2026-01-01T00:00:00+08:00',
    publishedAt: '2026-01-01T00:00:00+08:00',
    allowedTtlSeconds: 24 * 60 * 60,
    cache: {
      status: 'fresh',
      cacheKey: `${workspaceId}:${programKey}:${policyVersionId}:${assignmentId}`,
      cachedAt,
      staleAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    },
    earn: {
      basis: earnPolicy.basis,
      pointsPerCurrencyUnit: earnPolicy.pointsPerCurrencyUnit,
      rounding: 'floor',
      minimumEligibleAmount: 0,
      excludedRestrictedFlags: ['no_loyalty_earn'],
    },
    tiers: tierThresholds.map((tier, index) => ({
      key: tier.tier,
      label: tier.label,
      annualSpendThreshold: tier.annualSpend,
      earnMultiplier: tier.earnMultiplier,
      sortOrder: index,
    })),
    redemption: {
      minimumPoints: pointsRedemptionPolicy.minimumPoints,
      maximumPointsPerBasket: null,
      pointsToCurrencyRate: pointsRedemptionPolicy.pointsToCurrencyRate,
      requiresLiveQuote: true,
      fixedDenominations: fwbRedeemDens.map((d) => ({ ...d })),
    },
    bonuses: {
      birthdayMultiplier: 2,
      checkInPoints: 0,
      // Demo: auto-apply category when spend met (voucher optional in mock)
      birthdayRequiresVoucher: false,
      categoryRequiresVoucher: false,
      categoryMultipliers: [
        {
          ruleId: 'category-skincare-bonus',
          category: 'Skincare',
          label: 'Category bonus (FWB +1.00)',
          multiplier: 2,
          minimumSpend: 0,
        },
      ],
      campaignMultipliers: [],
    },
    expiry: {
      lookaheadDays: pointsExpiryPolicy.lookaheadDays,
      defaultMonths: 12,
    },
    rewards: activeRewardCatalogue().map((reward) => ({
      id: reward.id,
      name: reward.name,
      description: reward.description,
      valueType: reward.valueType,
      pointsCost: reward.pointsCost,
      value: reward.value,
      valueLabel: reward.valueLabel,
      expiresAt: reward.expiresAt,
      requiresLiveStock: reward.valueType === 'product_value',
      restrictedFlags: [],
    })),
    warnings: [],
  }
}

function normalizeLookup(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '')
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, '')
}

function sessionId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`
}

function calendarYearWindowDates() {
  const year = new Date().getFullYear()
  return {
    windowStart: new Date(Date.UTC(year, 0, 1)).toISOString(),
    windowEnd: new Date(Date.UTC(year, 11, 31, 23, 59, 59)).toISOString(),
  }
}

function currentWindowSpendFor(member: FranCounterMember) {
  return calendarYtdSpendByMemberId[member.id] ?? member.calendarYtdSpend ?? member.trailingTwelveMonthSpend ?? 0
}

function tierProgress(member: FranCounterMember, basketTotal: number, currency: string): FranTierProgress | null {
  if (member.tourist || member.tier === 'Tourist') return null
  const currentIndex = tierThresholds.findIndex((item) => item.tier === member.tier)
  const currentTier = tierThresholds[Math.max(currentIndex, 0)] ?? tierThresholds[0]
  const next = tierThresholds[Math.max(currentIndex, 0) + 1] ?? null
  const { windowStart, windowEnd } = calendarYearWindowDates()
  const currentWindowSpend = currentWindowSpendFor(member)
  const transactionValue = roundCurrency(Math.max(basketTotal, 0))
  const projectedWindowSpend = roundCurrency(currentWindowSpend + transactionValue)
  if (!next) {
    return {
      currentTier: member.tier,
      currentTierLabel: currentTier.label,
      nextTier: null,
      nextTierLabel: null,
      measurementWindow: 'calendar_year',
      windowStart,
      windowEnd,
      currency,
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

  const gapBeforeTransaction = roundCurrency(Math.max(0, next.annualSpend - currentWindowSpend))
  const gapRemaining = roundCurrency(Math.max(0, next.annualSpend - projectedWindowSpend))
  const crossesTierThreshold = currentWindowSpend < next.annualSpend && projectedWindowSpend >= next.annualSpend
  const progressPercent = Math.min(100, Math.round((projectedWindowSpend / next.annualSpend) * 100))
  return {
    currentTier: member.tier,
    currentTierLabel: currentTier.label,
    nextTier: next.tier,
    nextTierLabel: next.label,
    measurementWindow: 'calendar_year',
    windowStart,
    windowEnd,
    currency,
    currentWindowSpend,
    transactionValue,
    projectedWindowSpend,
    nextTierThreshold: next.annualSpend,
    spendRequiredForNextTier: next.annualSpend,
    gapBeforeTransaction,
    gapRemaining,
    crossesTierThreshold,
    progressPercent,
    upgradeAlert: crossesTierThreshold
      ? `This transaction brings ${member.name} to ${next.label} based on FWB calendar-year spend.`
      : null,
  }
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function tierEarnMultiplier(member: FranCounterMember) {
  const key = String(member.tier || '').toUpperCase()
  if (key === 'F3' || key === 'GOLD') return 1.5
  if (key === 'F2' || key === 'SILVER') return 1.25
  return 1
}

function buildEarnMultipliers(input: FranBasketPreviewInput, member: FranCounterMember): FranEarnMultiplier[] {
  const cart = input.cart
  const currentMonth = new Date().getMonth() + 1
  const birthdayApplies = member.birthdayMonth === currentMonth
  const hasSkincare = cart.lines.some(
    (line) =>
      String(line.category || '').toLowerCase() === 'skincare' || line.sku.startsWith('SKN-'),
  )
  const categoryApplies = hasSkincare

  return [
    {
      kind: 'tier',
      code: `tier-${member.tier.toLowerCase()}`,
      label: `${member.tierLabel ?? member.tier} tier rate`,
      multiplier: tierEarnMultiplier(member),
      applied: true,
      reason: null,
    },
    {
      kind: 'birthday',
      code: 'birthday-month',
      label: 'Birthday bonus (+1.00)',
      multiplier: birthdayApplies ? 1 : 0,
      applied: birthdayApplies,
      reason: birthdayApplies ? null : 'Not birthday month.',
    },
    {
      kind: 'category',
      code: 'category-skincare-bonus',
      label: 'Category bonus (+1.00)',
      multiplier: categoryApplies ? 1 : 0,
      applied: categoryApplies,
      reason: categoryApplies ? null : 'No category-bonus product in basket.',
    },
  ]
}

function buildEarnProjection(input: FranBasketPreviewInput): FranEarnProjection {
  const member = input.session.member
  const cart = input.cart
  const canEarn = input.session.mode === 'member' && member != null && !member.tourist
  const subtotal = roundCurrency(Math.max(cart.subtotal, 0))
  const discountTotal = roundCurrency(Math.max(cart.discountTotal, 0))
  const totalAfterDiscount = roundCurrency(Math.max(cart.total, 0))
  const baseAmount = canEarn
    ? earnPolicy.basis === 'pre_discount' ? subtotal : totalAfterDiscount
    : 0
  const multipliers = canEarn && member ? buildEarnMultipliers(input, member) : []
  // FWB additive: tier + birthday + category (not product)
  const tierRate = multipliers.find((m) => m.kind === 'tier' && m.applied)?.multiplier ?? 1
  const birthdayAdd = multipliers.find((m) => m.kind === 'birthday' && m.applied)?.multiplier ?? 0
  const categoryAdd = multipliers.find((m) => m.kind === 'category' && m.applied)?.multiplier ?? 0
  const totalMultiplier = canEarn ? tierRate + birthdayAdd + categoryAdd : 0
  const projectedEarnPoints = canEarn
    ? Math.floor(baseAmount * earnPolicy.pointsPerCurrencyUnit * totalMultiplier)
    : 0

  return {
    sourceSystem: 'fran_skums',
    policy: {
      basis: earnPolicy.basis,
      pointsPerCurrencyUnit: earnPolicy.pointsPerCurrencyUnit,
      rounding: 'floor',
      currency: cart.currency,
    },
    baseAmount,
    subtotal,
    discountTotal,
    totalAfterDiscount,
    totalMultiplier,
    projectedEarnPoints,
    multipliers,
    calculatedAt: nowIso(),
  }
}

function buildPointsRedemptionOffer(
  member: FranCounterMember | null,
  currency: string
): FranPointsRedemptionOffer | null {
  if (!member || member.tourist) return null

  const availablePoints = Math.max(0, member.pointsBalance)
  const options = fwbRedeemDens
    .filter((d) => availablePoints >= d.points)
    .map((d) => ({
      points: d.points,
      discount: d.discount,
      conversionPerPoint: d.discount / d.points,
    }))
  const best = options[options.length - 1] ?? null
  const minimumPoints = fwbRedeemDens[0].points
  const eligible = Boolean(best)

  return {
    availablePoints,
    minimumPoints,
    maximumPoints: best?.points ?? 0,
    pointsToCurrencyRate: best ? best.conversionPerPoint : pointsRedemptionPolicy.pointsToCurrencyRate,
    availableValue: best ? roundCurrency(best.discount) : 0,
    minimumValue: roundCurrency(fwbRedeemDens[0].discount),
    currency,
    eligible,
    reason: eligible
      ? null
      : `Member needs at least ${minimumPoints.toLocaleString()} points (FWB fixed dens).`,
    fixedDenominations: options,
  }
}

function isRewardExpired(expiresAt: string | null) {
  if (!expiresAt) return false
  const expiry = new Date(expiresAt).getTime()
  return Number.isFinite(expiry) && expiry < Date.now()
}

function activeRewardCatalogue() {
  return rewardCatalogue.filter((reward) => !isRewardExpired(reward.expiresAt))
}

function redeemableRewardsFor(member: FranCounterMember | null, currency: string): FranRewardCatalogueItem[] {
  if (!member || member.tourist) return []

  return activeRewardCatalogue()
    .map((reward) => {
      const eligible = member.pointsBalance >= reward.pointsCost
      return {
        ...reward,
        currency,
        eligible,
        reason: eligible
          ? null
          : `Requires ${reward.pointsCost.toLocaleString()} points.`,
      }
    })
    .filter((reward) => reward.eligible)
}

function rewardsFor(member: FranCounterMember | null, basketTotal: number, currency: string): FranRewardDecision[] {
  if (!member || member.tourist) return []

  const rewardCap = Math.max(0, basketTotal - 1)
  const month = new Date().getMonth() + 1
  const birthdayValue = Math.min(15, rewardCap)
  const hasTierReward = ['F2', 'F3', 'Silver', 'Gold'].includes(member.tier)
  const pointsOffer = buildPointsRedemptionOffer(member, currency)

  return [
    {
      id: 'fran-points-redemption',
      title: 'Points redemption',
      description: 'FWB fixed dens (200 / 500 / 1000 / 1500 / 2500). Customer confirmation required.',
      kind: 'points_redemption',
      value: pointsOffer?.availableValue ?? 0,
      pointsCost: pointsOffer?.maximumPoints ?? 0,
      expiresAt: addMinutes(10),
      eligible: Boolean(pointsOffer?.eligible),
      reason: pointsOffer?.reason ?? 'Member is not eligible for points redemption.',
      requiresConfirmation: true,
    },
    {
      id: 'fran-tier-10',
      title: hasTierReward ? `${member.tierLabel ?? member.tier} tier reward` : 'Tier 2+ reward',
      description: 'CRM-approved reward for Tier 2 and Tier 3 members.',
      kind: 'amount_discount',
      value: Math.min(10, rewardCap),
      pointsCost: 0,
      expiresAt: addMinutes(10),
      eligible: hasTierReward && basketTotal >= 60,
      reason: hasTierReward
        ? basketTotal >= 60 ? null : 'Basket must be at least SGD 60.'
        : 'Member tier must be F2 or F3.',
      requiresConfirmation: true,
    },
    {
      id: 'fran-birthday-15',
      title: 'Birthday month reward',
      description: 'Birthday reward returned by Fran CRM.',
      kind: 'birthday_reward',
      value: birthdayValue,
      pointsCost: 0,
      expiresAt: addMinutes(10),
      eligible: member.birthdayMonth === month && birthdayValue > 0,
      reason: member.birthdayMonth === month ? null : 'Not birthday month.',
      requiresConfirmation: true,
    },
  ]
}

function activePerksFor(member: FranCounterMember | null, currency = 'SGD'): FranActivePerk[] {
  if (!member || member.tourist) return []

  const tierKey = String(member.tier || '').toUpperCase()
  const tierOffer =
    tierKey === 'F3' || tierKey === 'GOLD'
      ? {
          title: 'Tier 3 exclusive',
          description: 'CRM perk: complimentary deluxe pouch with any basket today.',
          valueLabel: 'Deluxe pouch gift',
        }
      : tierKey === 'F2' || tierKey === 'SILVER'
        ? {
            title: 'Tier 2 exclusive',
            description: 'CRM perk: 10% off selected fragrance add-ons.',
            valueLabel: '10% fragrance offer',
          }
        : {
            title: 'Base tier offer',
            description: 'CRM perk: double points on the next qualifying skincare basket.',
            valueLabel: '2x next skincare basket',
          }

  return [
    {
      id: `${member.id}:free-sample-threshold`,
      kind: 'free_sample_threshold',
      title: 'Free sample threshold',
      description: 'Add a cleanser sample when the basket reaches the CRM threshold.',
      valueLabel: `Free sample at ${currency} 75.00`,
      thresholdAmount: 75,
      currency,
      tier: null,
      expiresAt: null,
    },
    {
      id: `${member.id}:birthday-discount`,
      kind: 'birthday_discount',
      title: 'Birthday discount',
      description: 'CRM birthday perk is active for this counter session.',
      valueLabel: '15% birthday discount',
      thresholdAmount: null,
      currency,
      tier: null,
      expiresAt: addMinutes(45),
    },
    {
      id: `${member.id}:tier-offer`,
      kind: 'tier_specific_offer',
      title: tierOffer.title,
      description: tierOffer.description,
      valueLabel: tierOffer.valueLabel,
      thresholdAmount: null,
      currency,
      tier: member.tier === 'Tourist' ? null : member.tier,
      expiresAt: addMinutes(45),
    },
  ]
}

function pointsExpiryAlertFor(
  member: FranCounterMember | null,
  lookaheadDays = pointsExpiryPolicy.lookaheadDays
): FranPointsExpiryAlert | null {
  if (!member || member.tourist) return null

  const now = Date.now()
  const lookaheadEnd = now + lookaheadDays * 24 * 60 * 60 * 1000
  const atRiskLots = (expiringPointLotsByMemberId[member.id] ?? [])
    .map((lot) => ({
      ...lot,
      expiresAtMs: new Date(lot.expiresAt).getTime(),
    }))
    .filter((lot) => Number.isFinite(lot.expiresAtMs) && lot.expiresAtMs >= now && lot.expiresAtMs <= lookaheadEnd)
    .sort((a, b) => a.expiresAtMs - b.expiresAtMs)

  if (atRiskLots.length === 0) return null

  const firstExpiry = atRiskLots[0].expiresAt
  const amountAtRisk = atRiskLots
    .filter((lot) => lot.expiresAt === firstExpiry)
    .reduce((sum, lot) => sum + lot.points, 0)

  return {
    amountAtRisk,
    expiresAt: firstExpiry,
    lookaheadDays,
    calculatedAt: nowIso(),
  }
}

export async function mockResolveMember(input: FranMemberResolutionInput): Promise<FranMemberResolution> {
  const lookup = normalizeLookup(input.raw)
  const phone = normalizePhone(input.raw)
  const matches = FRAN_MOCK_MEMBERS.filter((member) => {
    return (
      normalizeLookup(member.memberNo) === lookup ||
      normalizeLookup(member.id) === lookup ||
      normalizePhone(member.phone).includes(phone) ||
      normalizeLookup(member.name).includes(lookup)
    )
  })

  return {
    status: matches.length > 0 ? 'matched' : 'none',
    input,
    matches,
    warnings: matches.some((member) => member.tourist) ? ['Confirm tourist handling before continuing.'] : [],
  }
}

export async function mockGetActivePolicy(input: { workspaceId?: string; programKey?: string } = {}): Promise<FranLoyaltyPolicyBundle> {
  return mockActivePolicyBundle(input)
}

export async function mockGetCounterSession(input: FranCounterSessionInput): Promise<FranCounterSession> {
  const registeredMember: FranCounterMember | null = input.registration
    ? {
        id: `fran-member-new-${Date.now()}`,
        crmCustomerId: `crm_fran_new_${Date.now()}`,
        memberNo: `FRAN${Math.floor(3000 + Math.random() * 6000)}`,
        name: input.registration.fullName,
        phone: input.registration.phone,
        email: null,
        tier: 'Base',
        pointsBalance: 0,
        memberSince: nowIso().slice(0, 10),
        birthday: input.registration.birthday ?? null,
        birthdayMonth: input.registration.birthday ? Number(input.registration.birthday.slice(5, 7)) : null,
        pointsExpireAt: null,
        expiresAt: '2027-12-31',
        rewardCount: 0,
        tourist: false,
        warnings: ['New member was created by the POS inline registration flow.'],
      }
    : null

  const member =
    registeredMember ??
    (input.memberId ? FRAN_MOCK_MEMBERS.find((item) => item.id === input.memberId) ?? null : null)

  return {
    sessionId: sessionId(input.mode === 'member' ? 'fran_counter' : `fran_${input.mode}`),
    mode: input.mode,
    member,
    activePerks: activePerksFor(member),
    pointsExpiryAlert: pointsExpiryAlertFor(member),
    startedAt: nowIso(),
    expiresAt: addMinutes(45),
    prompts:
      input.mode === 'member'
        ? ['Confirm member identity before redeeming rewards.', 'Show available rewards after basket preview.']
        : input.mode === 'tourist'
          ? ['Tourist exception selected. Skip member-required prompts for this sale only.']
          : ['Non-member sale selected. Keep the sale explicit on the receipt and event payload.'],
    warnings: member?.warnings ?? [],
  }
}

export async function mockPreviewBasket(input: FranBasketPreviewInput): Promise<FranBasketPreview> {
  const member = input.session.member
  const positiveTotal = Math.max(input.cart.total, 0)
  const earnProjection = buildEarnProjection(input)
  const earnPoints = earnProjection.projectedEarnPoints
  const projectedPointsBalance = member && !member.tourist ? member.pointsBalance + earnPoints : null
  const previewId = sessionId('fran_preview')
  const pointsRedemption = buildPointsRedemptionOffer(member, input.cart.currency)
  const redeemableRewards = redeemableRewardsFor(member, input.cart.currency)

  return {
    previewId,
    sessionId: input.session.sessionId,
    memberId: member?.id ?? null,
    earnPoints,
    projectedPointsBalance,
    earnProjection,
    policyVersionId: 'fran-v2.1-demo',
    assignmentId: 'fran-orchard-demo-assignment',
    skumsQuoteId: null,
    skumsQuote: null,
    policyCacheStatus: 'fresh',
    evaluationTrace: null,
    tierProgress: member ? tierProgress(member, positiveTotal, input.cart.currency) : null,
    pointsRedemption,
    redeemableRewards,
    rewardCatalogueSize: member && !member.tourist ? activeRewardCatalogue().length : 0,
    rewardsAvailable: rewardsFor(member, positiveTotal, input.cart.currency),
    warnings: input.cart.lines.length === 0 ? ['Add products before quoting rewards.'] : [],
    expiresAt: addMinutes(10),
  }
}

export async function mockQuoteRewardRedemption(input: FranRewardQuoteInput): Promise<FranRewardQuote> {
  const member = input.session.member
  if (!member) throw new Error('Reward quotes require a resolved Fran member.')
  const reward = input.preview.rewardsAvailable.find((item) => item.id === input.rewardId)
  const catalogueReward = input.preview.redeemableRewards.find((item) => item.id === input.rewardId)
  if (!reward && !catalogueReward) throw new Error('Reward is not available for this basket preview.')
  if (catalogueReward) {
    if (member.pointsBalance < catalogueReward.pointsCost) {
      throw new Error(`Member needs ${catalogueReward.pointsCost.toLocaleString()} points for this reward.`)
    }
    const amount = Math.min(catalogueReward.value, Math.max(input.basketTotal - 1, 0))
    if (amount <= 0) throw new Error('Add sale items before applying this reward.')

    return {
      quoteId: sessionId('fran_quote'),
      previewId: input.preview.previewId,
      rewardId: catalogueReward.id,
      memberId: member.id,
      redemptionKind: 'catalogue_reward',
      title: catalogueReward.name,
      lineLabel: `${catalogueReward.name} (${member.memberNo})`,
      amount,
      pointsCost: catalogueReward.pointsCost,
      minimumPoints: catalogueReward.pointsCost,
      pointsValueRate: null,
      pointsBalanceBefore: member.pointsBalance,
      pointsBalanceAfterRedemption: Math.max(0, member.pointsBalance - catalogueReward.pointsCost),
      currency: input.currency,
      expiresAt: addMinutes(10),
      confirmationText:
        `Redeem ${catalogueReward.name} for ${catalogueReward.pointsCost.toLocaleString()} points. ` +
        `This will apply ${input.currency} ${amount.toFixed(2)} after customer confirmation and payment.`,
      decisionRef: `${input.preview.previewId}:${catalogueReward.id}`,
    }
  }
  if (!reward) throw new Error('Reward is not available for this basket preview.')
  if (!reward.eligible) throw new Error(reward.reason ?? 'Reward is not eligible.')

  if (reward.kind === 'points_redemption') {
    const offer = input.preview.pointsRedemption
    if (!offer?.eligible) throw new Error(offer?.reason ?? 'Points redemption is not eligible.')
    if (typeof input.pointsToRedeem !== 'number' || !Number.isInteger(input.pointsToRedeem)) {
      throw new Error('Enter a whole-number points value.')
    }
    const pointsToRedeem = input.pointsToRedeem
    if (pointsToRedeem < offer.minimumPoints) {
      throw new Error(`Minimum redemption is ${offer.minimumPoints.toLocaleString()} points.`)
    }
    if (pointsToRedeem > offer.maximumPoints) {
      throw new Error(`Maximum redemption is ${offer.maximumPoints.toLocaleString()} points.`)
    }

    const amount = roundCurrency(pointsToRedeem * offer.pointsToCurrencyRate)
    if (amount <= 0) throw new Error('Points redemption value must be greater than zero.')
    if (amount > input.basketTotal) {
      throw new Error('Points redemption value cannot exceed the current basket total.')
    }

    return {
      quoteId: sessionId('fran_quote'),
      previewId: input.preview.previewId,
      rewardId: reward.id,
      memberId: member.id,
      redemptionKind: reward.kind,
      title: 'Points redemption',
      lineLabel: `Points redemption (${member.memberNo})`,
      amount,
      pointsCost: pointsToRedeem,
      minimumPoints: offer.minimumPoints,
      pointsValueRate: offer.pointsToCurrencyRate,
      pointsBalanceBefore: offer.availablePoints,
      pointsBalanceAfterRedemption: Math.max(0, offer.availablePoints - pointsToRedeem),
      currency: input.currency,
      expiresAt: reward.expiresAt ?? addMinutes(10),
      confirmationText:
        `Redeem ${pointsToRedeem.toLocaleString()} points worth ${input.currency} ${amount.toFixed(2)} for ${member.name}. ` +
        'Apply only after the customer confirms; points are deducted when payment is confirmed.',
      decisionRef: `${input.preview.previewId}:${reward.id}:${pointsToRedeem}`,
    }
  }

  const amount = Math.min(reward.value, Math.max(input.basketTotal - 1, 0))
  return {
    quoteId: sessionId('fran_quote'),
    previewId: input.preview.previewId,
    rewardId: reward.id,
    memberId: member.id,
    redemptionKind: reward.kind,
    title: reward.title,
    lineLabel: `${reward.title} (${member.memberNo})`,
    amount,
    pointsCost: reward.pointsCost,
    minimumPoints: null,
    pointsValueRate: null,
    pointsBalanceBefore: member.pointsBalance,
    pointsBalanceAfterRedemption: reward.pointsCost > 0 ? Math.max(0, member.pointsBalance - reward.pointsCost) : null,
    currency: input.currency,
    expiresAt: reward.expiresAt ?? addMinutes(10),
    confirmationText: `Redeem ${reward.title} for ${member.name}. This will apply SGD ${amount.toFixed(2)} after payment is confirmed.`,
    decisionRef: `${input.preview.previewId}:${reward.id}`,
  }
}

export async function mockCommitRewardRedemption(input: FranRewardCommitInput): Promise<FranRewardCommit> {
  const member = FRAN_MOCK_MEMBERS.find((item) => item.id === input.quote.memberId)
  return {
    commitId: sessionId('fran_commit'),
    quoteId: input.quote.quoteId,
    status: 'committed',
    eventId: `evt_${input.idempotencyKey.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`,
    pointsBalanceAfter: member ? Math.max(0, member.pointsBalance - input.quote.pointsCost) : null,
  }
}

export async function mockReverseRewardRedemption(input: FranRewardReverseInput): Promise<FranRewardReverse> {
  const member = FRAN_MOCK_MEMBERS.find((item) => item.id === input.quote.memberId)

  return {
    reverseId: sessionId('fran_reverse'),
    commitId: input.commit.commitId,
    status: 'reversed',
    eventId: `evt_${input.idempotencyKey.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`,
    reason: input.reason,
    pointsRestored: input.quote.pointsCost,
    pointsBalanceAfter: member ? member.pointsBalance : null,
    rewardAvailable: true,
  }
}

export async function mockSendEvent(input: FranCrmEventInput): Promise<FranCrmEventAck> {
  return {
    eventId: `evt_${input.idempotencyKey.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`,
    status: 'accepted',
  }
}

/** L-pos: settle FWB earn/redeem after payment (CRM ledger SoR). */
export async function mockCommitSale(
  input: import('./types').FranLoyaltyCommitSaleInput,
): Promise<import('./types').FranLoyaltyCommitSaleResult> {
  const member = FRAN_MOCK_MEMBERS.find((item) => item.id === input.memberId)
  const earned = Math.max(0, Math.floor(input.pointsEarned || 0))
  const redeemed = Math.max(0, Math.floor(input.pointsRedeemed || 0))
  const balanceBefore = member?.pointsBalance ?? 0
  const pointsBalanceAfter = Math.max(0, balanceBefore - redeemed + earned)

  return {
    commitId: sessionId('fran_sale_commit'),
    saleId: input.saleId,
    status: 'committed',
    pointsEarned: earned,
    pointsRedeemed: redeemed,
    pointsBalanceAfter: member ? pointsBalanceAfter : null,
    tierAfter: member?.tier ?? null,
    ledgerEntryIds: [
      earned > 0 ? `led_earn_${input.idempotencyKey.slice(0, 12)}` : '',
      redeemed > 0 ? `led_redeem_${input.idempotencyKey.slice(0, 12)}` : '',
    ].filter(Boolean),
    warnings: [],
  }
}
