import type { CompanySettings, StripeTerminalSettings } from '@pos/shared'

export type StripeTerminalConfig = StripeTerminalSettings

const defaultPosConfig = {
  quick_sale_mode: false,
  require_customer: false,
  allow_negative_inventory: false,
  default_tax_rate_id: null,
}

export function toStripeTerminalConfig(
  settings: Pick<CompanySettings, 'pos_config'> | null | undefined,
): StripeTerminalConfig | null {
  const connector = settings?.pos_config?.stripe_terminal
  if (!connector?.enabled) return null
  return {
    enabled: true,
    simulated: Boolean(connector.simulated),
    location_id: (connector.location_id || '').trim(),
    s700_reader_id: (connector.s700_reader_id || '').trim(),
    merchant_display_name: (connector.merchant_display_name || 'Fran POS').trim() || 'Fran POS',
    default_reader: connector.default_reader || 's700',
    updated_at: connector.updated_at,
  }
}

export function buildStripeTerminalSettings(input: Partial<StripeTerminalSettings> & { enabled?: boolean }): StripeTerminalSettings {
  return {
    enabled: input.enabled ?? true,
    simulated: Boolean(input.simulated),
    location_id: (input.location_id || '').trim(),
    s700_reader_id: (input.s700_reader_id || '').trim(),
    merchant_display_name: (input.merchant_display_name || 'Fran POS').trim() || 'Fran POS',
    default_reader: input.default_reader || 's700',
    updated_at: new Date().toISOString(),
  }
}

export function mergePosConfigWithStripe(
  current: CompanySettings['pos_config'] | null | undefined,
  stripe: StripeTerminalSettings,
) {
  return {
    ...defaultPosConfig,
    ...(current || {}),
    stripe_terminal: stripe,
  }
}

export function stripeS700Ready(config: StripeTerminalConfig | null | undefined) {
  return Boolean(config?.enabled && config.s700_reader_id)
}

export function stripeLocationReady(config: StripeTerminalConfig | null | undefined) {
  return Boolean(config?.enabled && config.location_id)
}

export function preferredStoreChargeMode(
  config: StripeTerminalConfig | null | undefined,
  tapReady: boolean,
): 'stripe_s700' | 'stripe_tap' | null {
  if (config?.enabled) {
    if (config.default_reader === 'tap_to_pay' && tapReady) return 'stripe_tap'
    if (config.s700_reader_id) return 'stripe_s700'
    if (tapReady) return 'stripe_tap'
    return null
  }
  return tapReady ? 'stripe_tap' : null
}

export function visiblePaymentModes(input: {
  stripeEnabled: boolean
  s700Ready: boolean
  tapReady: boolean
}) {
  const modes = ['cash', 'stripe_s700', 'stripe_tap', 'card', 'square_pos', 'paynow', 'wechat', 'store-credit', 'gift-card', 'misc'] as const
  return modes.filter((id) => {
    if (id === 'stripe_s700') return input.stripeEnabled && input.s700Ready
    if (id === 'stripe_tap') return input.tapReady
    if (id === 'card') return !input.stripeEnabled && !input.tapReady
    return true
  })
}
