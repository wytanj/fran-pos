import type { Customer as DbCustomer } from '@pos/shared'
import type { Customer as PosCustomer } from '@/pos/data/mock'

export interface CustomerNameParts {
  firstName: string
  lastName: string
}

export function splitCustomerFullName(fullName: string): CustomerNameParts {
  const parts = fullName.trim().replace(/\s+/g, ' ').split(' ').filter(Boolean)
  return {
    firstName: parts[0] ?? '',
    lastName: parts.slice(1).join(' '),
  }
}

export function dbCustomerDisplayName(customer: Pick<DbCustomer, 'first_name' | 'last_name' | 'email' | 'phone'>) {
  const fullName = [customer.first_name, customer.last_name].filter(Boolean).join(' ').trim()
  if (fullName) return fullName
  return customer.phone || customer.email || 'Unnamed Customer'
}

function metadataString(metadata: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = metadata[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function metadataNumber(metadata: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = metadata[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  }
  return 0
}

export function customerBirthday(customer: Pick<DbCustomer, 'birthday' | 'metadata'>) {
  if (customer.birthday) return customer.birthday
  return metadataString(customer.metadata ?? {}, ['birthday', 'birth_date', 'date_of_birth'])
}

export function toPosCustomer(customer: DbCustomer): PosCustomer {
  const metadata = customer.metadata ?? {}
  return {
    id: customer.id,
    name: dbCustomerDisplayName(customer),
    email: customer.email ?? '',
    phone: customer.phone ?? '',
    birthday: customerBirthday(customer),
    tier: metadataString(metadata, ['loyalty_tier', 'tier', 'member_tier']) ?? (customer.source === 'manual' ? 'Manual' : customer.source),
    points: metadataNumber(metadata, ['points', 'points_balance', 'loyalty_points']),
    storeCredit: metadataNumber(metadata, ['store_credit', 'storeCredit']),
    giftCardBalance: metadataNumber(metadata, ['gift_card_balance', 'giftCardBalance']),
    giftCardNo: metadataString(metadata, ['gift_card_no', 'giftCardNo']) ?? undefined,
    source: customer.source,
    externalId: customer.external_id,
  }
}

export function createManualPosCustomer(input: { fullName: string; phone: string; birthday?: string | null }): PosCustomer {
  return {
    id: `manual-${Date.now()}`,
    name: input.fullName.trim(),
    email: '',
    phone: input.phone.trim(),
    birthday: input.birthday || null,
    tier: 'Manual',
    points: 0,
    storeCredit: 0,
    giftCardBalance: 0,
    source: 'manual',
    externalId: null,
  }
}
