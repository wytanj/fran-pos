import type { Customer } from '@/pos/data/mock'

export type FranMemberLookupMethod = 'qr' | 'barcode' | 'member_number' | 'mobile' | 'manual'
export type FranCounterSessionMode = 'member' | 'non_member' | 'tourist'
export type FranMembershipTier = 'Base' | 'Silver' | 'Gold'
export type FranCounterTier = FranMembershipTier | 'Tourist'
export type FranEarnPolicyBasis = 'pre_discount' | 'post_discount'
export type FranEarnMultiplierKind = 'tier' | 'birthday' | 'campaign'
export type FranActivePerkKind = 'free_sample_threshold' | 'birthday_discount' | 'tier_specific_offer'
export type FranLoyaltySyncStatus = 'online' | 'queued' | 'unavailable'

export interface FranMemberResolutionInput {
  raw: string
  method: FranMemberLookupMethod
}

export interface FranCounterMember {
  id: string
  crmCustomerId: string
  memberNo: string
  name: string
  phone: string
  email: string | null
  tier: FranCounterTier
  pointsBalance: number
  memberSince: string | null
  birthday: string | null
  birthdayMonth: number | null
  pointsExpireAt: string | null
  expiresAt: string | null
  rewardCount: number
  tourist: boolean
  warnings: string[]
}

export interface FranMemberResolution {
  status: 'matched' | 'none'
  input: FranMemberResolutionInput
  matches: FranCounterMember[]
  warnings: string[]
}

export interface FranCounterSessionInput {
  mode: FranCounterSessionMode
  memberId?: string | null
  registration?: {
    fullName: string
    phone: string
    birthday?: string | null
  }
  lookup?: FranMemberResolutionInput | null
}

export interface FranCounterSession {
  sessionId: string
  mode: FranCounterSessionMode
  member: FranCounterMember | null
  activePerks: FranActivePerk[]
  pointsExpiryAlert: FranPointsExpiryAlert | null
  startedAt: string
  expiresAt: string
  prompts: string[]
  warnings: string[]
}

export interface FranActivePerk {
  id: string
  kind: FranActivePerkKind
  title: string
  description: string
  valueLabel: string
  thresholdAmount: number | null
  currency: string
  tier: FranMembershipTier | null
  expiresAt: string | null
}

export interface FranPointsExpiryAlert {
  amountAtRisk: number
  expiresAt: string
  lookaheadDays: number
  calculatedAt: string
}

export interface FranBasketLineInput {
  lineId: string
  sku: string
  name: string
  quantity: number
  unitPrice: number
  lineTotal: number
  lineKind?: string | null
}

export interface FranSkumsCartInput {
  cartId: string
  lines: FranBasketLineInput[]
  subtotal: number
  discountTotal: number
  total: number
  currency: string
  updatedAt: string
}

export interface FranBasketPreviewInput {
  session: FranCounterSession
  cart: FranSkumsCartInput
}

export interface FranTierProgress {
  currentTier: FranMembershipTier
  nextTier: FranMembershipTier | null
  measurementWindow: 'trailing_12_months'
  windowStart: string
  windowEnd: string
  currency: string
  currentWindowSpend: number
  transactionValue: number
  projectedWindowSpend: number
  nextTierThreshold: number | null
  spendRequiredForNextTier: number | null
  gapBeforeTransaction: number
  gapRemaining: number
  crossesTierThreshold: boolean
  progressPercent: number
  upgradeAlert: string | null
}

export interface FranRewardDecision {
  id: string
  title: string
  description: string
  kind: 'amount_discount' | 'points_redemption' | 'birthday_reward' | 'catalogue_reward'
  value: number
  pointsCost: number
  expiresAt: string | null
  eligible: boolean
  reason: string | null
  requiresConfirmation: true
}

export type FranRewardCatalogueValueType = 'dollar_value' | 'product_value'

export interface FranRewardCatalogueItem {
  id: string
  name: string
  description: string
  valueType: FranRewardCatalogueValueType
  pointsCost: number
  value: number
  valueLabel: string
  expiresAt: string | null
  currency: string
  eligible: boolean
  reason: string | null
}

export interface FranPointsRedemptionOffer {
  availablePoints: number
  minimumPoints: number
  maximumPoints: number
  pointsToCurrencyRate: number
  availableValue: number
  minimumValue: number
  currency: string
  eligible: boolean
  reason: string | null
}

export interface FranEarnMultiplier {
  kind: FranEarnMultiplierKind
  code: string
  label: string
  multiplier: number
  applied: boolean
  reason: string | null
}

export interface FranEarnProjection {
  sourceSystem: 'fran_skums'
  policy: {
    basis: FranEarnPolicyBasis
    pointsPerCurrencyUnit: number
    currency: string
  }
  baseAmount: number
  subtotal: number
  discountTotal: number
  totalAfterDiscount: number
  totalMultiplier: number
  projectedEarnPoints: number
  multipliers: FranEarnMultiplier[]
  calculatedAt: string
}

export interface FranBasketPreview {
  previewId: string
  sessionId: string
  memberId: string | null
  earnPoints: number
  projectedPointsBalance: number | null
  earnProjection: FranEarnProjection
  tierProgress: FranTierProgress | null
  pointsRedemption: FranPointsRedemptionOffer | null
  redeemableRewards: FranRewardCatalogueItem[]
  rewardCatalogueSize: number
  rewardsAvailable: FranRewardDecision[]
  warnings: string[]
  expiresAt: string
}

export interface FranRewardQuoteInput {
  session: FranCounterSession
  preview: FranBasketPreview
  rewardId: string
  pointsToRedeem?: number | null
  basketTotal: number
  currency: string
}

export interface FranRewardQuote {
  quoteId: string
  previewId: string
  rewardId: string
  memberId: string
  redemptionKind: FranRewardDecision['kind']
  title: string
  lineLabel: string
  amount: number
  pointsCost: number
  minimumPoints: number | null
  pointsValueRate: number | null
  pointsBalanceBefore: number | null
  pointsBalanceAfterRedemption: number | null
  currency: string
  expiresAt: string
  confirmationText: string
  decisionRef: string
}

export interface FranRewardCommitInput {
  quote: FranRewardQuote
  receiptNo: string
  idempotencyKey: string
}

export interface FranRewardCommit {
  commitId: string
  quoteId: string
  status: 'committed' | 'queued'
  eventId: string
  pointsBalanceAfter: number | null
}

export interface FranRewardReverseInput {
  commit: FranRewardCommit
  quote: FranRewardQuote
  receiptNo: string
  reason: string
  idempotencyKey: string
}

export interface FranRewardReverse {
  reverseId: string
  commitId: string
  status: 'reversed' | 'queued'
  eventId: string
  reason: string
  pointsRestored: number
  pointsBalanceAfter: number | null
  rewardAvailable: boolean
}

export interface FranAppliedReward {
  lineId: string
  quote: FranRewardQuote
  confirmedAt: string
  status: 'quoted' | 'committed' | 'reversed' | 'failed' | 'reverse_failed'
  commit: FranRewardCommit | null
  reverse: FranRewardReverse | null
  error: string | null
}

export interface FranLoyaltySyncState {
  status: FranLoyaltySyncStatus
  pointsEarnQueued: number
  reason: string | null
  queuedAt: string | null
  syncOnReconnect: boolean
}

export interface FranSaleContext {
  counterSession: FranCounterSession | null
  basketPreview: FranBasketPreview | null
  appliedReward: FranAppliedReward | null
  loyaltySync: FranLoyaltySyncState | null
  memberMode: FranCounterSessionMode | null
}

export interface FranCrmEventInput {
  eventType: string
  idempotencyKey: string
  occurredAt: string
  payload: Record<string, unknown>
}

export interface FranCrmEventAck {
  eventId: string
  status: 'accepted' | 'queued'
}

export function customerFromFranMember(member: FranCounterMember): Customer {
  return {
    id: member.id,
    name: member.name,
    email: member.email ?? '',
    phone: member.phone,
    birthday: member.birthday,
    tier: member.tier,
    points: member.pointsBalance,
    storeCredit: 0,
    giftCardBalance: 0,
    source: 'fran_crm',
    externalId: member.crmCustomerId,
  }
}
