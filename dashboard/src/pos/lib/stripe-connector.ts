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
