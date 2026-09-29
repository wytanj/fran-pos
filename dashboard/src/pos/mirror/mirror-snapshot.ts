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

export type MirrorSnapshot =
  | { v: 1; phase: 'idle'; store: MirrorStore; promos: MirrorPromo[] }
  | { v: 1; phase: 'cart'; store: MirrorStore; basket: MirrorBasket }
  | { v: 1; phase: 'paying'; store: MirrorStore; basket: MirrorBasket; amountDue: number }
  | {
      v: 1
      phase: 'done'
      store: MirrorStore
      receiptNo: string
      nett: number
      memberName: string | null
      pointsEarned: number | null
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

export interface MirrorLastSaleInput {
  receiptNo: string
  total: number
  saleStatus: 'completed' | 'voided'
  pointsEarned: number
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
      lines.push({ id: line.lineId, name: line.name, qty: line.qty, net: lineNet(line) })
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

export function buildMirrorSnapshot(input: BuildMirrorSnapshotInput): MirrorSnapshot {
  const { store, lastSale } = input
  if (input.completedOpen && lastSale && lastSale.saleStatus !== 'voided') {
    return {
      v: 1,
      phase: 'done',
      store,
      receiptNo: lastSale.receiptNo,
      nett: round2(lastSale.total),
      memberName: toMember(input.franSession, null)?.name ?? null,
      pointsEarned: lastSale.pointsEarned > 0 ? lastSale.pointsEarned : null,
    }
  }
  if (input.cart.length === 0) return { v: 1, phase: 'idle', store, promos: input.promos }
  const basket = toBasket(input)
  if (input.paymentOpen) {
    return { v: 1, phase: 'paying', store, basket, amountDue: round2(Math.max(0, input.totals.balance)) }
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
  return isObject(value) && isStr(value.id) && isStr(value.name) && isNum(value.qty) && isNum(value.net)
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

export function parseMirrorSnapshot(value: unknown): MirrorSnapshot | null {
  if (!isObject(value) || value.v !== MIRROR_SNAPSHOT_VERSION || !isStore(value.store)) return null
  switch (value.phase) {
    case 'idle':
      return Array.isArray(value.promos) && value.promos.every(isPromo) ? (value as MirrorSnapshot) : null
    case 'cart':
      return isBasket(value.basket) ? (value as MirrorSnapshot) : null
    case 'paying':
      return isBasket(value.basket) && isNum(value.amountDue) ? (value as MirrorSnapshot) : null
    case 'done':
      return isStr(value.receiptNo) &&
        isNum(value.nett) &&
        isNullable(value.memberName, isStr) &&
        isNullable(value.pointsEarned, isNum)
        ? (value as MirrorSnapshot)
        : null
    default:
      return null
  }
}
