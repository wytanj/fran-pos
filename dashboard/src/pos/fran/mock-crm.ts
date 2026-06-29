import type {
  FranBasketPreview,
  FranBasketPreviewInput,
  FranCounterMember,
  FranCounterSession,
  FranCounterSessionInput,
  FranCrmEventAck,
  FranCrmEventInput,
  FranMemberResolution,
  FranMemberResolutionInput,
  FranRewardCommit,
  FranRewardCommitInput,
  FranRewardDecision,
  FranRewardQuote,
  FranRewardQuoteInput,
  FranRewardReverse,
  FranRewardReverseInput,
} from './types'

const tierThresholds = [
  { tier: 'Member', annualSpend: 0 },
  { tier: 'Glow', annualSpend: 600 },
  { tier: 'Icon', annualSpend: 1500 },
]

export const FRAN_MOCK_MEMBERS: FranCounterMember[] = [
  {
    id: 'fran-member-001',
    crmCustomerId: 'crm_fran_001',
    memberNo: 'FRAN1001',
    name: 'Mei Lin Koh',
    phone: '+65 9123 4567',
    email: 'meilin.koh@example.com',
    tier: 'Glow',
    pointsBalance: 2480,
    birthday: '1991-06-18',
    birthdayMonth: 6,
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
    tier: 'Member',
    pointsBalance: 840,
    birthday: '1996-11-03',
    birthdayMonth: 11,
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
    birthday: null,
    birthdayMonth: null,
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

function normalizeLookup(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '')
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, '')
}

function sessionId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`
}

function tierProgress(member: FranCounterMember, basketTotal: number) {
  if (member.tourist) return null
  const currentIndex = tierThresholds.findIndex((item) => item.tier === member.tier)
  const current = tierThresholds[Math.max(currentIndex, 0)]
  const next = tierThresholds[Math.max(currentIndex, 0) + 1] ?? null
  if (!next) {
    return {
      currentTier: member.tier,
      nextTier: null,
      spendToNextTier: 0,
      progressPercent: 100,
      upgradeAlert: null,
    }
  }

  const assumedAnnualSpend = current.annualSpend + member.pointsBalance / 8
  const projected = assumedAnnualSpend + Math.max(basketTotal, 0)
  const spendToNextTier = Math.max(0, next.annualSpend - projected)
  const progressPercent = Math.min(100, Math.round((projected / next.annualSpend) * 100))
  return {
    currentTier: member.tier,
    nextTier: next.tier,
    spendToNextTier,
    progressPercent,
    upgradeAlert: spendToNextTier === 0 ? `This sale upgrades ${member.name} to ${next.tier}.` : null,
  }
}

function rewardsFor(member: FranCounterMember | null, basketTotal: number): FranRewardDecision[] {
  if (!member || member.tourist) return []

  const rewardCap = Math.max(0, basketTotal - 1)
  const pointsValue = Math.min(12, rewardCap)
  const month = new Date().getMonth() + 1
  const birthdayValue = Math.min(15, rewardCap)

  return [
    {
      id: 'fran-points-1000',
      title: 'Redeem 1,000 points',
      description: 'CRM-approved points redemption for this basket.',
      kind: 'points_redemption',
      value: pointsValue,
      pointsCost: 1000,
      expiresAt: addMinutes(10),
      eligible: member.pointsBalance >= 1000 && pointsValue > 0,
      reason: member.pointsBalance >= 1000 ? null : 'Member has fewer than 1,000 points.',
      requiresConfirmation: true,
    },
    {
      id: 'fran-glow-10',
      title: 'Glow tier reward',
      description: 'CRM-approved Glow member reward.',
      kind: 'amount_discount',
      value: Math.min(10, rewardCap),
      pointsCost: 0,
      expiresAt: addMinutes(10),
      eligible: ['Glow', 'Icon'].includes(member.tier) && basketTotal >= 60,
      reason: basketTotal >= 60 ? null : 'Basket must be at least SGD 60.',
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
        tier: 'Member',
        pointsBalance: 0,
        birthday: input.registration.birthday ?? null,
        birthdayMonth: input.registration.birthday ? Number(input.registration.birthday.slice(5, 7)) : null,
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
  const positiveTotal = Math.max(input.total, 0)
  const earnPoints = input.session.mode === 'member' && member && !member.tourist ? Math.floor(positiveTotal) : 0
  const projectedPointsBalance = member && !member.tourist ? member.pointsBalance + earnPoints : null
  const previewId = sessionId('fran_preview')

  return {
    previewId,
    sessionId: input.session.sessionId,
    memberId: member?.id ?? null,
    earnPoints,
    projectedPointsBalance,
    tierProgress: member ? tierProgress(member, positiveTotal) : null,
    rewardsAvailable: rewardsFor(member, positiveTotal),
    warnings: input.lines.length === 0 ? ['Add products before quoting rewards.'] : [],
    expiresAt: addMinutes(10),
  }
}

export async function mockQuoteRewardRedemption(input: FranRewardQuoteInput): Promise<FranRewardQuote> {
  const member = input.session.member
  if (!member) throw new Error('Reward quotes require a resolved Fran member.')
  const reward = input.preview.rewardsAvailable.find((item) => item.id === input.rewardId)
  if (!reward) throw new Error('Reward is not available for this basket preview.')
  if (!reward.eligible) throw new Error(reward.reason ?? 'Reward is not eligible.')

  const amount = Math.min(reward.value, Math.max(input.basketTotal - 1, 0))
  return {
    quoteId: sessionId('fran_quote'),
    previewId: input.preview.previewId,
    rewardId: reward.id,
    memberId: member.id,
    title: reward.title,
    lineLabel: `${reward.title} (${member.memberNo})`,
    amount,
    pointsCost: reward.pointsCost,
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
  return {
    reverseId: sessionId('fran_reverse'),
    commitId: input.commit.commitId,
    status: 'reversed',
    eventId: `evt_${input.idempotencyKey.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`,
  }
}

export async function mockSendEvent(input: FranCrmEventInput): Promise<FranCrmEventAck> {
  return {
    eventId: `evt_${input.idempotencyKey.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`,
    status: 'accepted',
  }
}
