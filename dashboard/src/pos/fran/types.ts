import type { Customer } from '@/pos/data/mock'

export type FranMemberLookupMethod = 'qr' | 'barcode' | 'member_number' | 'mobile' | 'manual'
export type FranCounterSessionMode = 'member' | 'non_member' | 'tourist'

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
  tier: string
  pointsBalance: number
  birthday: string | null
  birthdayMonth: number | null
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
  startedAt: string
  expiresAt: string
  prompts: string[]
  warnings: string[]
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

export interface FranBasketPreviewInput {
  session: FranCounterSession
  lines: FranBasketLineInput[]
  subtotal: number
  discountTotal: number
  total: number
  currency: string
}

export interface FranTierProgress {
  currentTier: string
  nextTier: string | null
  spendToNextTier: number
  progressPercent: number
  upgradeAlert: string | null
}

export interface FranRewardDecision {
  id: string
  title: string
  description: string
  kind: 'amount_discount' | 'points_redemption' | 'birthday_reward'
  value: number
  pointsCost: number
  expiresAt: string | null
  eligible: boolean
  reason: string | null
  requiresConfirmation: true
}

export interface FranBasketPreview {
  previewId: string
  sessionId: string
  memberId: string | null
  earnPoints: number
  projectedPointsBalance: number | null
  tierProgress: FranTierProgress | null
  rewardsAvailable: FranRewardDecision[]
  warnings: string[]
  expiresAt: string
}

export interface FranRewardQuoteInput {
  session: FranCounterSession
  preview: FranBasketPreview
  rewardId: string
  basketTotal: number
  currency: string
}

export interface FranRewardQuote {
  quoteId: string
  previewId: string
  rewardId: string
  memberId: string
  title: string
  lineLabel: string
  amount: number
  pointsCost: number
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
  receiptNo: string
  reason: string
  idempotencyKey: string
}

export interface FranRewardReverse {
  reverseId: string
  commitId: string
  status: 'reversed' | 'queued'
  eventId: string
}

export interface FranAppliedReward {
  lineId: string
  quote: FranRewardQuote
  confirmedAt: string
  status: 'quoted' | 'committed' | 'reversed' | 'failed'
  commit: FranRewardCommit | null
  reverse: FranRewardReverse | null
  error: string | null
}

export interface FranSaleContext {
  counterSession: FranCounterSession | null
  basketPreview: FranBasketPreview | null
  appliedReward: FranAppliedReward | null
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
