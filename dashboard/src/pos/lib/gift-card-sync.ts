import { supabase } from '@/lib/supabase'
import { settleGiftCard } from '@/pos/lib/gift-card'

interface GiftRedeemSale {
  customer: { id: string } | null
  idempotencyKey: string
  payments: Array<{ mode: string; amount: number; providerMetadata?: Record<string, unknown> | null }>
}

function rpcMissing(error: { code?: string; message?: string }) {
  const message = error.message ?? ''
  return (
    error.code === 'PGRST202' ||
    error.code === '42883' ||
    /could not find the function|schema cache|does not exist/i.test(message)
  )
}

function metadataObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value))
}

export type GiftRedeemWrite =
  | { status: 'skipped' }
  | { status: 'redeemed' }
  | { status: 'metadata' }
  | { status: 'failed'; message: string }

function errorMessage(error: unknown) {
  if (typeof error === 'string' && error.trim()) return error
  if (error instanceof Error && error.message.trim()) return error.message
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' && error.message.trim()) {
    return error.message
  }
  return 'gift card redeem failed'
}

export async function persistGiftCardRedeem(sale: GiftRedeemSale): Promise<GiftRedeemWrite> {
  const settlement = settleGiftCard(sale.payments)
  if (!sale.customer || !settlement || settlement.redeemed <= 0 || settlement.remaining === null) {
    return { status: 'skipped' }
  }
  const idempotencyKey = `${sale.idempotencyKey}:gift-card`
  try {
    const { error } = await supabase.rpc('pos_redeem_gift_card', {
      p_customer_id: sale.customer.id,
      p_amount: settlement.redeemed,
      p_idempotency_key: idempotencyKey,
    })
    if (!error) return { status: 'redeemed' }
    if (!rpcMissing(error)) return { status: 'failed', message: errorMessage(error) }
    const { data, error: readError } = await supabase
      .from('customers')
      .select('metadata')
      .eq('id', sale.customer.id)
      .maybeSingle()
    if (readError || !data) return { status: 'failed', message: errorMessage(readError ?? 'customer metadata missing') }
    const metadata = { ...metadataObject(data.metadata), gift_card_balance: settlement.remaining }
    const { error: updateError } = await supabase.from('customers').update({ metadata }).eq('id', sale.customer.id)
    if (updateError) return { status: 'failed', message: errorMessage(updateError) }
    return { status: 'metadata' }
  } catch (error) {
    return { status: 'failed', message: errorMessage(error) }
  }
}
