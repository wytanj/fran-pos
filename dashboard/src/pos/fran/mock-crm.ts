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

const tierThresholds = [
  { tier: 'Base', annualSpend: 0 },
  { tier: 'Silver', annualSpend: 600 },
  { tier: 'Gold', annualSpend: 1500 },
] satisfies Array<{ tier: FranMembershipTier; annualSpend: number }>

const rollingSpendByMemberId: Record<string, number> = {
  'fran-member-001': 1450,
  'fran-member-002': 420,
}

const earnPolicy: { basis: FranEarnPolicyBasis; pointsPerCurrencyUnit: number } = {
  basis: 'post_discount',
  pointsPerCurrencyUnit: 1,
}

const pointsRedemptionPolicy = {
  minimumPoints: 500,
  pointsToCurrencyRate: 0.01,
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
    tier: 'Silver',
    pointsBalance: 2480,
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
    tier: 'Base',
    pointsBalance: 840,
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

function normalizeLookup(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '')
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, '')
}

function sessionId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`
}

function trailingWindowDates() {
  const end = new Date()
  const start = new Date(end)
  start.setFullYear(start.getFullYear() - 1)
  return {
    windowStart: start.toISOString(),
    windowEnd: end.toISOString(),
  }
}

function currentWindowSpendFor(member: FranCounterMember) {
  return rollingSpendByMemberId[member.id] ?? 0
}

function tierProgress(member: FranCounterMember, basketTotal: number, currency: string): FranTierProgress | null {
  if (member.tourist || member.tier === 'Tourist') return null
  const currentIndex = tierThresholds.findIndex((item) => item.tier === member.tier)
  const next = tierThresholds[Math.max(currentIndex, 0) + 1] ?? null
  const { windowStart, windowEnd } = trailingWindowDates()
  const currentWindowSpend = currentWindowSpendFor(member)
  const transactionValue = roundCurrency(Math.max(basketTotal, 0))
  const projectedWindowSpend = roundCurrency(currentWindowSpend + transactionValue)
  if (!next) {
    return {
      currentTier: member.tier,
      nextTier: null,
      measurementWindow: 'trailing_12_months',
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
    nextTier: next.tier,
    measurementWindow: 'trailing_12_months',
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
      ? `This transaction brings ${member.name} to ${next.tier} based on trailing 12-month spend.`
      : null,
  }
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function tierEarnMultiplier(member: FranCounterMember) {
  if (member.tier === 'Gold') return 1.5
  if (member.tier === 'Silver') return 1.25
  return 1
}

function buildEarnMultipliers(input: FranBasketPreviewInput, member: FranCounterMember): FranEarnMultiplier[] {
  const cart = input.cart
  const currentMonth = new Date().getMonth() + 1
  const birthdayApplies = member.birthdayMonth === currentMonth
  const hasCampaignSku = cart.lines.some((line) => line.sku.startsWith('SKN-'))
  const campaignApplies = hasCampaignSku && cart.total >= 100

  return [
    {
      kind: 'tier',
      code: `tier-${member.tier.toLowerCase()}`,
      label: `${member.tier} tier`,
      multiplier: tierEarnMultiplier(member),
      applied: true,
      reason: null,
    },
    {
      kind: 'birthday',
      code: 'birthday-month',
      label: 'Birthday month',
      multiplier: birthdayApplies ? 2 : 1,
      applied: birthdayApplies,
      reason: birthdayApplies ? null : 'Not birthday month.',
    },
    {
      kind: 'campaign',
      code: 'skincare-basket-100',
      label: 'Skincare campaign',
      multiplier: campaignApplies ? 1.5 : 1,
      applied: campaignApplies,
      reason: campaignApplies
        ? null
        : hasCampaignSku
          ? 'Skincare basket must be at least SGD 100.'
          : 'No campaign product in basket.',
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
  const totalMultiplier = multipliers.reduce(
    (product, multiplier) => product * (multiplier.applied ? multiplier.multiplier : 1),
    1
  )
  const projectedEarnPoints = canEarn
    ? Math.floor(baseAmount * earnPolicy.pointsPerCurrencyUnit * totalMultiplier)
    : 0

  return {
    sourceSystem: 'fran_skums',
    policy: {
      basis: earnPolicy.basis,
      pointsPerCurrencyUnit: earnPolicy.pointsPerCurrencyUnit,
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
  const minimumPoints = pointsRedemptionPolicy.minimumPoints
  const pointsToCurrencyRate = pointsRedemptionPolicy.pointsToCurrencyRate
  const eligible = availablePoints >= minimumPoints

  return {
    availablePoints,
    minimumPoints,
    maximumPoints: availablePoints,
    pointsToCurrencyRate,
    availableValue: roundCurrency(availablePoints * pointsToCurrencyRate),
    minimumValue: roundCurrency(minimumPoints * pointsToCurrencyRate),
    currency,
    eligible,
    reason: eligible
      ? null
      : `Member needs at least ${minimumPoints.toLocaleString()} points to redeem.`,
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
  const hasTierReward = ['Silver', 'Gold'].includes(member.tier)
  const pointsOffer = buildPointsRedemptionOffer(member, currency)

  return [
    {
      id: 'fran-points-redemption',
      title: 'Points redemption',
      description: 'Cashier-selected partial points redemption. Customer confirmation required.',
      kind: 'points_redemption',
      value: pointsOffer?.availableValue ?? 0,
      pointsCost: 0,
      expiresAt: addMinutes(10),
      eligible: Boolean(pointsOffer?.eligible),
      reason: pointsOffer?.reason ?? 'Member is not eligible for points redemption.',
      requiresConfirmation: true,
    },
    {
      id: 'fran-silver-10',
      title: ['Silver', 'Gold'].includes(member.tier) ? `${member.tier} tier reward` : 'Silver tier reward',
      description: 'CRM-approved reward for Silver and Gold members.',
      kind: 'amount_discount',
      value: Math.min(10, rewardCap),
      pointsCost: 0,
      expiresAt: addMinutes(10),
      eligible: hasTierReward && basketTotal >= 60,
      reason: hasTierReward
        ? basketTotal >= 60 ? null : 'Basket must be at least SGD 60.'
        : 'Member tier must be Silver or Gold.',
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

  const tierOffer =
    member.tier === 'Gold'
      ? {
          title: 'Gold tier offer',
          description: 'CRM perk: complimentary deluxe pouch with any basket today.',
          valueLabel: 'Deluxe pouch gift',
        }
      : member.tier === 'Silver'
        ? {
            title: 'Silver tier offer',
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
