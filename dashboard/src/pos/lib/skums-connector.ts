import type { CompanySettings, SkumsConnectorSettings } from '@pos/shared'

export interface SkumsConnectorConfig {
  apiUrl: string
  apiKey: string
}

export const SKUMS_CONNECTOR_MISSING_MESSAGE =
  'Add the SKUMS API URL and account key before importing from SKUMS.'

export function normalizeSkumsApiUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  return withProtocol.replace(/\/+$/, '')
}

export function toSkumsConnectorConfig(
  settings: Pick<CompanySettings, 'pos_config'> | null | undefined
): SkumsConnectorConfig | null {
  const connector = settings?.pos_config?.skums_connector
  if (!connector?.enabled) return null

  const apiUrl = normalizeSkumsApiUrl(connector.api_url || '')
  const apiKey = (connector.api_key || '').trim()
  if (!apiUrl || !apiKey) return null

  return { apiUrl, apiKey }
}

export function buildSkumsConnectorSettings(input: {
  api_url: string
  api_key: string
  enabled?: boolean
}): SkumsConnectorSettings {
  return {
    enabled: input.enabled ?? true,
    api_url: normalizeSkumsApiUrl(input.api_url),
    api_key: input.api_key.trim(),
    updated_at: new Date().toISOString(),
  }
}

export function maskSkumsApiKey(value: string) {
  const trimmed = value.trim()
  if (trimmed.length <= 12) return trimmed ? 'Configured' : ''
  return `${trimmed.slice(0, 8)}...${trimmed.slice(-4)}`
}
