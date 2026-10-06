// Imported directly by node tests: keep this module free of imports.

export const MIRROR_SNAPSHOT_VERSION = 1

export interface MirrorStore {
  name: string
  code: string
  currency: string
}

export interface MirrorLine {
  id: string
  name: string
  qty: number
  net: number
  list?: number
  discount?: number
  discountLabel?: string
}

export interface MirrorReward {
  id: string
  label: string
  amount: number
}

export interface MirrorMember {
  name: string
  tierLabel: string | null
  pointsToEarn: number | null
}

export interface MirrorBasket {
  lines: MirrorLine[]
  itemCount: number
  subtotal: number
  rewards: MirrorReward[]
  nett: number
  member: MirrorMember | null
  tierNudge: string | null
}

export interface MirrorPromo {
  id: string
  eyebrow: string
  title: string
  body: string
}

export interface MirrorGiftCard {
  redeemed: number
  remaining: number
}

export type MirrorTenderKind = 'cash' | 'paynow' | 'card' | 'gift' | 'store-credit' | 'wechat' | 'misc'

export const MIRROR_DONE_IDLE_MS = 12_000

export type MirrorSnapshot =
  | { v: 1; phase: 'idle'; store: MirrorStore; promos: MirrorPromo[] }
  | { v: 1; phase: 'cart'; store: MirrorStore; basket: MirrorBasket }
  | {
      v: 1
      phase: 'paying'
      store: MirrorStore
      basket: MirrorBasket
      amountDue: number
      tender?: MirrorTenderKind
      changeDue?: number
      giftCard?: MirrorGiftCard
    }
  | {
      v: 1
      phase: 'done'
      store: MirrorStore
      receiptNo: string
      nett: number
      memberName: string | null
      pointsEarned: number | null
      changeDue?: number
      giftCard?: MirrorGiftCard
    }

export type MirrorPhase = MirrorSnapshot['phase']

export const MIRROR_IDLE_PROMOS: MirrorPromo[] = [
  {
    id: 'skincare-duo',
    eyebrow: 'Today only',
    title: 'Skincare duo: 2nd item 30% off',
    body: 'Buy any 2 skincare products, the lower-priced one is 30% off.',
  },
  {
    id: 'fwb-join',
    eyebrow: 'Fran With Benefits',
    title: 'Earn points on every visit',
    body: 'Join free at the counter and start earning on today’s purchase.',
  },
  {
    id: 'skin-match',
    eyebrow: 'Ask us',
    title: 'Find today’s skincare match',
    body: 'Tell our team your skin goals and we will pick three to try.',
  },
]

type CartLineKind = 'product' | 'fran_reward' | 'fran_points' | 'manual_adjustment' | 'open_amount'

export interface MirrorCartLineInput {
  lineId: string
  name: string
  qty: number
  unitPrice: number
  lineDiscount: number
  lineKind?: CartLineKind
  discountLabel?: string
}

export interface MirrorTotalsInput {
  itemCount: number
  total: number
  balance: number
  cartAdjustment: number
}

export interface MirrorTenderInput {
  mode: string
  amount: number
}

export interface MirrorLastSaleInput {
  receiptNo: string
  total: number
  saleStatus: 'completed' | 'voided'
  pointsEarned: number
  payments?: MirrorTenderInput[]
}

export interface MirrorFranSessionInput {
  mode: 'member' | 'non_member' | 'tourist'
  member: { name: string; tierLabel?: string | null; tier?: string | null; tourist?: boolean } | null
}

export interface MirrorTierProgressInput {
  nextTierLabel: string | null
  gapRemaining?: number | null
  spendRequiredForNextTier?: number | null
  crossesTierThreshold?: boolean
}

export interface MirrorFranPreviewInput {
  earnPoints?: number | null
  tierProgress?: MirrorTierProgressInput | null
}

export interface BuildMirrorSnapshotInput {
  store: MirrorStore
  cart: MirrorCartLineInput[]
  totals: MirrorTotalsInput
  paymentOpen: boolean
  completedOpen: boolean
  lastSale: MirrorLastSaleInput | null
  franSession: MirrorFranSessionInput | null
  franPreview: MirrorFranPreviewInput | null
  promos: MirrorPromo[]
  giftCard?: MirrorGiftCard | null
  tenders?: MirrorTenderInput[]
  activeTenderMode?: string | null
  /** Name stashed on the completed sale after the counter session is cleared. */
  memberName?: string | null
}

function round2(value: number) {
  return Math.round(((Number(value) || 0) + Number.EPSILON) * 100) / 100
}

export function formatMirrorMoney(amount: number, currency: string) {
  const value = round2(amount)
  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value).toFixed(2)
  if (currency === 'SGD') return `${sign}S$${abs}`
  return `${sign}${currency} ${abs}`
}

function isProductLine(line: MirrorCartLineInput) {
  return !line.lineKind || line.lineKind === 'product' || line.lineKind === 'open_amount'
}

function lineNet(line: MirrorCartLineInput) {
  return round2(line.unitPrice * line.qty - line.lineDiscount * (line.qty < 0 ? -1 : 1))
}

function toProductLine(line: MirrorCartLineInput): MirrorLine {
  const net = lineNet(line)
  const list = round2(line.unitPrice * line.qty)
  const discount = round2(list - net)
  const base: MirrorLine = { id: line.lineId, name: line.name, qty: line.qty, net }
  if (discount === 0) return base
  const label = line.discountLabel?.trim()
  return label ? { ...base, list, discount, discountLabel: label } : { ...base, list, discount }
}

function toMember(session: MirrorFranSessionInput | null, preview: MirrorFranPreviewInput | null): MirrorMember | null {
  if (session?.mode !== 'member' || !session.member) return null
  const name = session.member.name.trim()
  if (!name) return null
  const tierLabel = session.member.tourist
    ? null
    : (session.member.tierLabel || session.member.tier || '').trim() || null
  const pointsToEarn = typeof preview?.earnPoints === 'number' ? preview.earnPoints : null
  return { name, tierLabel, pointsToEarn }
}

export function formatTierNudge(progress: MirrorTierProgressInput | null | undefined, currency: string) {
  if (!progress?.nextTierLabel) return null
  const gap =
    typeof progress.gapRemaining === 'number'
      ? progress.gapRemaining
      : typeof progress.spendRequiredForNextTier === 'number'
        ? progress.spendRequiredForNextTier
        : null
  if (gap === null || !Number.isFinite(gap)) return null
  if (round2(gap) <= 0) {
    return progress.crossesTierThreshold ? `${progress.nextTierLabel} unlocked with this purchase` : null
  }
  return `${formatMirrorMoney(gap, currency)} more to ${progress.nextTierLabel}`
}

function toBasket(input: BuildMirrorSnapshotInput): MirrorBasket {
  const lines: MirrorLine[] = []
  const rewards: MirrorReward[] = []
  for (const line of input.cart) {
    if (isProductLine(line)) {
      lines.push(toProductLine(line))
    } else {
      rewards.push({ id: line.lineId, label: line.discountLabel || line.name, amount: lineNet(line) })
    }
  }
  if (round2(input.totals.cartAdjustment) !== 0) {
    rewards.push({ id: 'cart-adjustment', label: 'Price adjustment', amount: round2(input.totals.cartAdjustment) })
  }
  const member = toMember(input.franSession, input.franPreview)
  return {
    lines,
    itemCount: input.totals.itemCount,
    subtotal: round2(lines.reduce((sum, line) => sum + line.net, 0)),
    rewards,
    nett: round2(input.totals.total),
    member,
    tierNudge: member ? formatTierNudge(input.franPreview?.tierProgress, input.store.currency) : null,
  }
}

function giftField(giftCard: MirrorGiftCard | null | undefined): { giftCard: MirrorGiftCard } | Record<string, never> {
  if (!giftCard || !Number.isFinite(giftCard.redeemed) || !Number.isFinite(giftCard.remaining)) return {}
  return { giftCard: { redeemed: round2(giftCard.redeemed), remaining: round2(giftCard.remaining) } }
}

export function mirrorTenderKind(mode: string | null | undefined): MirrorTenderKind | null {
  switch (mode) {
    case 'cash':
      return 'cash'
    case 'paynow':
      return 'paynow'
    case 'wechat':
      return 'wechat'
    case 'gift-card':
      return 'gift'
    case 'store-credit':
      return 'store-credit'
    case 'misc':
      return 'misc'
    case 'stripe_s700':
    case 'stripe_tap':
    case 'card':
    case 'square_pos':
      return 'card'
    default:
      return null
  }
}

export function mirrorPayingCopy(tender: MirrorTenderKind | null): string {
  switch (tender) {
    case 'cash':
      return 'Pay with cash'
    case 'paynow':
      return 'Scan PayNow'
    case 'card':
      return 'Pay on the card reader'
    case 'gift':
      return 'Gift card'
    case 'store-credit':
      return 'Store credit'
    case 'wechat':
      return 'Scan WeChat Pay'
    case 'misc':
      return 'Other payment'
    default:
      return 'Amount due'
  }
}

export type MirrorPayBanner =
  | { kind: 'change'; label: 'Change due'; amount: number }
  | { kind: 'due'; label: string; amount: number }
  | { kind: 'hidden' }

export function mirrorPayBanner(input: {
  amountDue: number
  changeDue: number
  tender: MirrorTenderKind | null
}): MirrorPayBanner {
  if (input.changeDue > 0) return { kind: 'change', label: 'Change due', amount: round2(input.changeDue) }
  if (input.amountDue <= 0) return { kind: 'hidden' }
  return { kind: 'due', label: mirrorPayingCopy(input.tender), amount: round2(input.amountDue) }
}

export function mirrorAfterDoneIdle(
  snapshot: MirrorSnapshot,
  elapsedMs: number,
  promos: MirrorPromo[],
): MirrorSnapshot {
  if (snapshot.phase !== 'done' || elapsedMs < MIRROR_DONE_IDLE_MS) return snapshot
  return { v: 1, phase: 'idle', store: snapshot.store, promos }
}

function namedMember(name: string | null | undefined) {
  const trimmed = name?.trim()
  return trimmed || null
}

function changeField(changeDue: number): { changeDue: number } | Record<string, never> {
  return changeDue > 0 ? { changeDue } : {}
}

function tenderField(tender: MirrorTenderKind | null): { tender: MirrorTenderKind } | Record<string, never> {
  return tender ? { tender } : {}
}

function payingTender(input: BuildMirrorSnapshotInput): MirrorTenderKind | null {
  return (
    mirrorTenderKind(input.activeTenderMode) ??
    mirrorTenderKind(input.tenders?.[input.tenders.length - 1]?.mode)
  )
}

export function buildMirrorSnapshot(input: BuildMirrorSnapshotInput): MirrorSnapshot {
  const { store, lastSale } = input
  if (input.completedOpen && lastSale && lastSale.saleStatus !== 'voided') {
    const paid = (lastSale.payments ?? []).reduce((sum, payment) => sum + payment.amount, 0)
    return {
      v: 1,
      phase: 'done',
      store,
      receiptNo: lastSale.receiptNo,
      nett: round2(lastSale.total),
      memberName: toMember(input.franSession, null)?.name ?? namedMember(input.memberName),
      pointsEarned: lastSale.pointsEarned > 0 ? lastSale.pointsEarned : null,
      ...changeField(round2(Math.max(0, paid - lastSale.total))),
      ...giftField(input.giftCard),
    }
  }
  if (input.cart.length === 0) return { v: 1, phase: 'idle', store, promos: input.promos }
  const basket = toBasket(input)
  if (input.paymentOpen) {
    return {
      v: 1,
      phase: 'paying',
      store,
      basket,
      amountDue: round2(Math.max(0, input.totals.balance)),
      ...tenderField(payingTender(input)),
      ...changeField(round2(Math.max(0, -input.totals.balance))),
      ...giftField(input.giftCard),
    }
  }
  return { v: 1, phase: 'cart', store, basket }
}

export function mirrorSnapshotKey(snapshot: MirrorSnapshot) {
  return JSON.stringify(snapshot)
}

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isNum = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isStr = (value: unknown): value is string => typeof value === 'string'
const isNullable = <T>(value: unknown, check: (v: unknown) => v is T) => value === null || check(value)

function isStore(value: unknown): value is MirrorStore {
  return isObject(value) && isStr(value.name) && isStr(value.code) && isStr(value.currency)
}

function isLine(value: unknown): value is MirrorLine {
  if (!isObject(value) || !isStr(value.id) || !isStr(value.name) || !isNum(value.qty) || !isNum(value.net)) return false
  const listSet = value.list != null
  const discountSet = value.discount != null
  const labelSet = value.discountLabel != null
  if (!listSet && !discountSet && !labelSet) return true
  return isNum(value.list) && isNum(value.discount) && (value.discountLabel == null || isStr(value.discountLabel))
}

function isReward(value: unknown): value is MirrorReward {
  return isObject(value) && isStr(value.id) && isStr(value.label) && isNum(value.amount)
}

function isMember(value: unknown): value is MirrorMember {
  return (
    isObject(value) &&
    isStr(value.name) &&
    isNullable(value.tierLabel, isStr) &&
    isNullable(value.pointsToEarn, isNum)
  )
}

function isBasket(value: unknown): value is MirrorBasket {
  return (
    isObject(value) &&
    Array.isArray(value.lines) &&
    value.lines.every(isLine) &&
    isNum(value.itemCount) &&
    isNum(value.subtotal) &&
    Array.isArray(value.rewards) &&
    value.rewards.every(isReward) &&
    isNum(value.nett) &&
    isNullable(value.member, isMember) &&
    isNullable(value.tierNudge, isStr)
  )
}

function isPromo(value: unknown): value is MirrorPromo {
  return isObject(value) && isStr(value.id) && isStr(value.eyebrow) && isStr(value.title) && isStr(value.body)
}

function isGiftCard(value: unknown): value is MirrorGiftCard {
  return isObject(value) && isNum(value.redeemed) && isNum(value.remaining)
}

function giftCardFrom(value: Json): MirrorGiftCard | null | undefined {
  if (!('giftCard' in value) || value.giftCard == null) return undefined
  return isGiftCard(value.giftCard) ? value.giftCard : null
}

const TENDER_KINDS = ['cash', 'paynow', 'card', 'gift', 'store-credit', 'wechat', 'misc'] as const

function isTenderKind(value: unknown): value is MirrorTenderKind {
  return TENDER_KINDS.some((kind) => kind === value)
}

function changeDueFrom(value: Json): number | undefined | null {
  if (!('changeDue' in value) || value.changeDue == null) return undefined
  if (!isNum(value.changeDue) || value.changeDue < 0) return null
  return value.changeDue > 0 ? value.changeDue : undefined
}

function tenderFrom(value: Json): MirrorTenderKind | undefined | null {
  if (!('tender' in value) || value.tender == null) return undefined
  return isTenderKind(value.tender) ? value.tender : null
}

export function parseMirrorSnapshot(value: unknown): MirrorSnapshot | null {
  if (!isObject(value) || value.v !== MIRROR_SNAPSHOT_VERSION || !isStore(value.store)) return null
  switch (value.phase) {
    case 'idle':
      return Array.isArray(value.promos) && value.promos.every(isPromo) ? (value as MirrorSnapshot) : null
    case 'cart':
      return isBasket(value.basket) ? (value as MirrorSnapshot) : null
    case 'paying': {
      const basket = value.basket
      const amountDue = value.amountDue
      if (!isBasket(basket) || !isNum(amountDue)) return null
      const giftCard = giftCardFrom(value)
      const changeDue = changeDueFrom(value)
      const tender = tenderFrom(value)
      if (giftCard === null || changeDue === null || tender === null) return null
      const snapshot: MirrorSnapshot = {
        v: 1,
        phase: 'paying',
        store: value.store,
        basket,
        amountDue,
        ...tenderField(tender ?? null),
        ...changeField(changeDue ?? 0),
      }
      return giftCard ? { ...snapshot, giftCard } : snapshot
    }
    case 'done': {
      const receiptNo = value.receiptNo
      const nett = value.nett
      const memberName = value.memberName === null || isStr(value.memberName) ? value.memberName : undefined
      const pointsEarned = value.pointsEarned === null || isNum(value.pointsEarned) ? value.pointsEarned : undefined
      if (!isStr(receiptNo) || !isNum(nett) || memberName === undefined || pointsEarned === undefined) return null
      const giftCard = giftCardFrom(value)
      const changeDue = changeDueFrom(value)
      if (giftCard === null || changeDue === null) return null
      const snapshot: MirrorSnapshot = {
        v: 1,
        phase: 'done',
        store: value.store,
        receiptNo,
        nett,
        memberName,
        pointsEarned,
        ...changeField(changeDue ?? 0),
      }
      return giftCard ? { ...snapshot, giftCard } : snapshot
    }
    default:
      return null
  }
}
