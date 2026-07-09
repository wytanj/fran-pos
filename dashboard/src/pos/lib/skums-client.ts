import type {
  SkumsPosBasketQuoteInput,
  SkumsPosBasketQuoteResponse,
  SkumsPosCatalogResponse,
  SkumsPosInventoryEventInput,
  SkumsPosInventoryEventResponse,
  SkumsPosReservationInput,
  SkumsPosReservationMutationInput,
  SkumsPosReservationResponse,
  SkumsPosSaleInput,
  SkumsPosSaleResponse,
  SkumsPosScanResolution,
} from '@pos/shared'
import type { SkumsConnectorConfig } from './skums-connector'
import { SKUMS_CONNECTOR_MISSING_MESSAGE } from './skums-connector'

function configOrThrow(config?: SkumsConnectorConfig): SkumsConnectorConfig {
  const apiUrl = config?.apiUrl || import.meta.env.VITE_SKUMS_API_URL || ''
  const apiKey = config?.apiKey || import.meta.env.VITE_SKUMS_API_KEY || ''

  if (!apiUrl || !apiKey) {
    throw new Error(SKUMS_CONNECTOR_MISSING_MESSAGE)
  }

  return {
    apiUrl: apiUrl.replace(/\/+$/, ''),
    apiKey: apiKey.trim(),
  }
}

function headers(config: SkumsConnectorConfig) {
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${config.apiKey}`,
    'x-api-key': config.apiKey,
  }
}

async function skumsError(res: Response) {
  const text = await res.text()
  let message = text || res.statusText || 'Request failed'

  if (text) {
    try {
      const parsed = JSON.parse(text) as { statusMessage?: string; message?: string }
      message = parsed.statusMessage || parsed.message || message
    } catch {
      // Keep the raw text when SKUMS returns a non-JSON error.
    }
  }

  return new Error(`SKUMS request failed (${res.status}): ${message}`)
}

export async function resolveSkumsPosScan(
  identifier: string,
  context: { channel_id?: string | null; location_id?: string | null } = {},
  connector?: SkumsConnectorConfig
) {
  const config = configOrThrow(connector)
  const res = await fetch(`${config.apiUrl}/api/v1/pos/scan`, {
    method: 'POST',
    headers: headers(config),
    body: JSON.stringify({ identifier, ...context }),
  })
  if (!res.ok) throw await skumsError(res)
  return (await res.json()) as { data: SkumsPosScanResolution }
}

export async function listSkumsPosCatalog(params: {
  search?: string;
  limit?: number;
  offset?: number;
  include_disabled?: boolean;
} = {}, connector?: SkumsConnectorConfig) {
  const config = configOrThrow(connector)
  const qs = new URLSearchParams()
  const cappedLimit = params.limit === undefined ? undefined : Math.min(Math.max(params.limit, 1), 250)
  if (params.search) qs.set('search', params.search)
  if (cappedLimit !== undefined) qs.set('limit', String(cappedLimit))
  if (params.offset !== undefined) qs.set('offset', String(params.offset))
  if (params.include_disabled !== undefined) qs.set('include_disabled', String(params.include_disabled))

  const query = qs.toString()
  const url = `${config.apiUrl}/api/v1/pos/catalog${query ? `?${query}` : ''}`
  const res = await fetch(url, { headers: headers(config) })
  if (!res.ok) throw await skumsError(res)
  return (await res.json()) as SkumsPosCatalogResponse
}

export async function quoteSkumsPosBasket(input: SkumsPosBasketQuoteInput, connector?: SkumsConnectorConfig) {
  if (!input.idempotency_key?.trim()) {
    throw new Error('SKUMS basket quotes require an idempotency key')
  }

  const config = configOrThrow(connector)
  const res = await fetch(`${config.apiUrl}/fran/pos/basket/quote`, {
    method: 'POST',
    headers: headers(config),
    body: JSON.stringify(input),
  })
  if (!res.ok) throw await skumsError(res)
  return (await res.json()) as SkumsPosBasketQuoteResponse
}

export async function createSkumsPosReservation(input: SkumsPosReservationInput, connector?: SkumsConnectorConfig) {
  if (!input.idempotency_key?.trim()) {
    throw new Error('SKUMS reservations require an idempotency key')
  }

  const config = configOrThrow(connector)
  const res = await fetch(`${config.apiUrl}/fran/pos/reservation/create`, {
    method: 'POST',
    headers: headers(config),
    body: JSON.stringify(input),
  })
  if (!res.ok) throw await skumsError(res)
  return (await res.json()) as SkumsPosReservationResponse
}

export async function commitSkumsPosReservation(
  input: SkumsPosReservationMutationInput,
  connector?: SkumsConnectorConfig
) {
  if (!input.idempotency_key?.trim()) {
    throw new Error('SKUMS reservation commits require an idempotency key')
  }

  const config = configOrThrow(connector)
  const res = await fetch(`${config.apiUrl}/fran/pos/reservation/commit`, {
    method: 'POST',
    headers: headers(config),
    body: JSON.stringify(input),
  })
  if (!res.ok) throw await skumsError(res)
  return (await res.json()) as SkumsPosReservationResponse
}

export async function releaseSkumsPosReservation(
  input: SkumsPosReservationMutationInput,
  connector?: SkumsConnectorConfig
) {
  if (!input.idempotency_key?.trim()) {
    throw new Error('SKUMS reservation releases require an idempotency key')
  }

  const config = configOrThrow(connector)
  const res = await fetch(`${config.apiUrl}/fran/pos/reservation/release`, {
    method: 'POST',
    headers: headers(config),
    body: JSON.stringify(input),
  })
  if (!res.ok) throw await skumsError(res)
  return (await res.json()) as SkumsPosReservationResponse
}

export async function createSkumsPosSale(input: SkumsPosSaleInput, connector?: SkumsConnectorConfig) {
  if (!input.idempotency_key?.trim()) {
    throw new Error('SKUMS POS sale writes require an idempotency key')
  }

  const config = configOrThrow(connector)
  const res = await fetch(`${config.apiUrl}/api/v1/pos/sales`, {
    method: 'POST',
    headers: headers(config),
    body: JSON.stringify(input),
  })
  if (!res.ok) throw await skumsError(res)
  return (await res.json()) as SkumsPosSaleResponse
}

export async function createSkumsPosInventoryEvent(
  input: SkumsPosInventoryEventInput,
  connector?: SkumsConnectorConfig
) {
  const config = configOrThrow(connector)
  const res = await fetch(`${config.apiUrl}/api/v1/pos/inventory-events`, {
    method: 'POST',
    headers: headers(config),
    body: JSON.stringify(input),
  })
  if (!res.ok) throw await skumsError(res)
  return (await res.json()) as SkumsPosInventoryEventResponse
}
