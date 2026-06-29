import { STORE } from '@/pos/data/mock'
import type { CompletedSale } from '@/pos/lib/pos-context'
import type { CompanySettings, CustomerEmailConnectorSettings, CustomerEmailReceiptPayload } from '@pos/shared'

export interface CustomerEmailConnectorConfig {
  providerLabel: string
  endpointUrl: string
  authType: 'none' | 'bearer'
  authToken: string
  fromEmail: string | null
  replyToEmail: string | null
}

export const CUSTOMER_EMAIL_CONNECTOR_MISSING_MESSAGE =
  'Add a customer email connector before sending receipts by email.'

export function normalizeCustomerEmailEndpoint(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  return withProtocol.replace(/\/+$/, '')
}

export function toCustomerEmailConnectorConfig(
  settings: Pick<CompanySettings, 'pos_config'> | null | undefined
): CustomerEmailConnectorConfig | null {
  const connector = settings?.pos_config?.customer_email_connector
  if (!connector?.enabled) return null

  const endpointUrl = normalizeCustomerEmailEndpoint(connector.endpoint_url || '')
  if (!endpointUrl) return null

  const authType = connector.auth_type === 'bearer' ? 'bearer' : 'none'
  const authToken = (connector.auth_token || '').trim()

  return {
    providerLabel: (connector.provider_label || 'Customer email API').trim(),
    endpointUrl,
    authType,
    authToken,
    fromEmail: connector.from_email?.trim() || null,
    replyToEmail: connector.reply_to_email?.trim() || null,
  }
}

export function buildCustomerEmailConnectorSettings(input: {
  enabled?: boolean
  provider_label: string
  endpoint_url: string
  auth_type?: 'none' | 'bearer'
  auth_token?: string
  from_email?: string
  reply_to_email?: string
}): CustomerEmailConnectorSettings {
  return {
    enabled: input.enabled ?? true,
    provider_label: input.provider_label.trim() || 'Customer email API',
    endpoint_url: normalizeCustomerEmailEndpoint(input.endpoint_url),
    auth_type: input.auth_type === 'bearer' ? 'bearer' : 'none',
    auth_token: input.auth_token?.trim() || '',
    from_email: input.from_email?.trim() || null,
    reply_to_email: input.reply_to_email?.trim() || null,
    updated_at: new Date().toISOString(),
  }
}

export function maskCustomerEmailToken(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed.length <= 12) return 'Configured'
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`
}

export function buildCustomerEmailReceiptPayload(sale: CompletedSale): CustomerEmailReceiptPayload {
  const recipientEmail = sale.customer?.email?.trim()
  if (!recipientEmail) throw new Error('Tag a customer with an email address before sending a receipt.')
  const cartOverride = sale.cartPriceOverride
    ? {
        id: sale.cartPriceOverride.id,
        reason: sale.cartPriceOverride.reason,
        original_total: sale.cartPriceOverride.originalTotal,
        target_total: sale.cartPriceOverride.targetTotal,
        adjustment: sale.cartPriceOverride.adjustment,
        applied_at: sale.cartPriceOverride.appliedAt,
      }
    : null
  const franRewardTotal = sale.lines
    .filter((line) => line.lineKind === 'fran_reward' || line.lineKind === 'fran_points')
    .reduce((sum, line) => sum + line.unitPrice * line.qty - line.lineDiscount * (line.qty < 0 ? -1 : 1), 0)

  const plainTextReceipt = [
    `${STORE.name}`,
    `Receipt ${sale.receiptNo}`,
    `Date ${sale.timestamp}`,
    `Cashier ${sale.cashier}`,
    '',
    ...sale.lines.map((line) => {
      const lineTotal = line.unitPrice * line.qty - line.lineDiscount * (line.qty < 0 ? -1 : 1)
      return `${line.qty} x ${line.name} (${line.sku}) ${formatAmount(lineTotal)}`
    }),
    '',
    `Subtotal ${formatAmount(sale.subtotal)}`,
    `Discount ${formatAmount(sale.discountTotal)}`,
    ...(cartOverride ? [`Cart override (${cartOverride.reason}) ${formatSignedAmount(cartOverride.adjustment)}`] : []),
    ...(Math.abs(franRewardTotal) > 0.005 ? [`Fran reward redemption ${formatSignedAmount(franRewardTotal)}`] : []),
    `GST ${formatAmount(sale.tax)}`,
    `Total ${formatAmount(sale.total)}`,
  ].join('\n')

  return {
    event: 'receipt.email.requested',
    source: 'vantage_pos',
    recipient: {
      email: recipientEmail,
      name: sale.customer?.name ?? null,
      phone: sale.customer?.phone ?? null,
    },
    customer: {
      id: sale.customer?.id ?? null,
      tier: sale.customer?.tier === 'Manual' ? null : sale.customer?.tier ?? null,
      points_balance: sale.customer && sale.customer.points > 0 ? sale.customer.points + sale.pointsEarned : null,
    },
    receipt: {
      number: sale.receiptNo,
      timestamp: sale.timestamp,
      cashier: sale.cashier,
      sale_type: sale.isExchange ? 'exchange' : 'sale',
      currency: STORE.currency,
      subtotal: sale.subtotal,
      discount_total: sale.discountTotal,
      tax_total: sale.tax,
      total: sale.total,
      points_earned: sale.pointsEarned,
      fran_reward_redemption: franRewardTotal,
    },
    lines: sale.lines.map((line) => ({
      sku: line.sku,
      name: line.name,
      line_kind: line.lineKind ?? 'product',
      quantity: line.qty,
      unit_price: line.unitPrice,
      line_discount: line.lineDiscount,
      line_total: line.unitPrice * line.qty - line.lineDiscount * (line.qty < 0 ? -1 : 1),
    })),
    payments: sale.payments.map((payment) => ({
      method: payment.mode,
      label: payment.label,
      amount: payment.amount,
      detail: payment.detail ?? null,
      provider: payment.provider ?? null,
      provider_ref: payment.providerRef ?? null,
      provider_metadata: payment.providerMetadata ?? {},
    })),
    message: {
      subject: `Receipt ${sale.receiptNo} from ${STORE.name}`,
      preview_text: `Your ${STORE.name} receipt total is ${formatAmount(sale.total)}.`,
      plain_text_receipt: plainTextReceipt,
    },
    metadata: {
      store_id: STORE.id,
      store_code: STORE.code,
      store_name: STORE.name,
      cart_price_override: cartOverride,
      fran: sale.fran
        ? {
            counter_session_id: sale.fran.counterSession?.sessionId ?? null,
            member_mode: sale.fran.memberMode,
            basket_preview_id: sale.fran.basketPreview?.previewId ?? null,
            reward_quote_id: sale.fran.appliedReward?.quote.quoteId ?? null,
            reward_status: sale.fran.appliedReward?.status ?? null,
          }
        : null,
    },
  }
}

export async function invokeCustomerEmailConnector(
  connector: CustomerEmailConnectorConfig,
  payload: CustomerEmailReceiptPayload
) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-pos-event': payload.event,
    'x-pos-receipt': payload.receipt.number,
  }

  if (connector.authType === 'bearer' && connector.authToken) {
    headers.authorization = `Bearer ${connector.authToken}`
  }

  const response = await fetch(connector.endpointUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ...payload,
      message: {
        ...payload.message,
        from_email: connector.fromEmail,
        reply_to_email: connector.replyToEmail,
      },
    }),
  })

  if (!response.ok) {
    throw new Error(`Email connector returned ${response.status}`)
  }
}

function formatAmount(value: number) {
  return `${STORE.currency} ${value.toFixed(2)}`
}

function formatSignedAmount(value: number) {
  if (Math.abs(value) < 0.005) return formatAmount(0)
  return `${value > 0 ? '+' : '-'}${formatAmount(Math.abs(value))}`
}
