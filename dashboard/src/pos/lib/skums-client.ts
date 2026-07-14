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
  /** Store-scoped ATS from SKUMS inventory_levels (TODO-LOFT A.4) */
  pos_location_code?: string;
  location_id?: string;
} = {}, connector?: SkumsConnectorConfig) {
  const config = configOrThrow(connector)
  const qs = new URLSearchParams()
  const cappedLimit = params.limit === undefined ? undefined : Math.min(Math.max(params.limit, 1), 250)
  if (params.search) qs.set('search', params.search)
  if (cappedLimit !== undefined) qs.set('limit', String(cappedLimit))
  if (params.offset !== undefined) qs.set('offset', String(params.offset))
  if (params.include_disabled !== undefined) qs.set('include_disabled', String(params.include_disabled))
  if (params.pos_location_code) qs.set('pos_location_code', params.pos_location_code)
  if (params.location_id) qs.set('location_id', params.location_id)

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

/** Expected deliveries for this store (Phase C receive list). */
export async function listSkumsExpectedDeliveries(
  params: { pos_location_code?: string; location_id?: string; workspace_id?: string } = {},
  connector?: SkumsConnectorConfig,
) {
  const config = configOrThrow(connector)
  const qs = new URLSearchParams()
  if (params.workspace_id) qs.set('workspace_id', params.workspace_id)
  if (params.pos_location_code) qs.set('pos_location_code', params.pos_location_code)
  if (params.location_id) qs.set('location_id', params.location_id)
  const res = await fetch(
    `${config.apiUrl}/api/store-ops/expected-deliveries?${qs.toString()}`,
    { headers: headers(config) },
  )
  if (!res.ok) throw await skumsError(res)
  return (await res.json()) as {
    data: Array<{
      id: string
      order_number: string
      status: string
      delivery_mode?: string | null
      lines: Array<{
        id: string
        sku: string
        expected_qty: number
        product_id?: string | null
      }>
    }>
  }
}

/** Submit store receive (good qty + exception report to HQ). */
export async function submitSkumsStoreReceive(
  input: {
    order_id: string
    idempotency_key: string
    pos_location_code?: string
    received_by_ref?: string
    collector_name?: string
    collector_note?: string
    lines: Array<{
      sku: string
      expected_qty: number
      received_qty: number
      damaged_qty?: number
      exception_type?: string | null
      note?: string | null
      replenishment_order_line_id?: string | null
      product_id?: string | null
    }>
  },
  connector?: SkumsConnectorConfig,
) {
  const config = configOrThrow(connector)
  // Prefer Fran route; falls back path is same body contract
  const res = await fetch(`${config.apiUrl}/fran/store-ops/receive`, {
    method: 'POST',
    headers: headers(config),
    body: JSON.stringify(input),
  })
  if (!res.ok) throw await skumsError(res)
  return (await res.json()) as {
    ok: boolean
    message?: string
    order_status?: string
    exceptions?: unknown[]
    applied?: unknown[]
    duplicate?: boolean
  }
}

/** Signal-only store replenishment request (HQ inbox — never Loft). */
export async function createSkumsStoreReplenishmentRequest(
  input: {
    idempotency_key: string
    priority?: string
    reason?: string
    needed_by?: string
    pos_location_code?: string
    store_location_id?: string
    inventory_location_id?: string
    lines: Array<{ sku: string; requested_qty: number; reason?: string }>
  },
  connector?: SkumsConnectorConfig,
) {
  const config = configOrThrow(connector)
  const res = await fetch(`${config.apiUrl}/fran/store-ops/requests`, {
    method: 'POST',
    headers: headers(config),
    body: JSON.stringify(input),
  })
  if (!res.ok) throw await skumsError(res)
  return (await res.json()) as {
    data: {
      request: Record<string, unknown>
      lines: unknown[]
      notification_id?: string | null
      hq_status?: string
      message?: string
    }
  }
}

export async function listSkumsStoreReplenishmentRequests(
  params: { workspace_id?: string; status?: string; limit?: number } = {},
  connector?: SkumsConnectorConfig,
) {
  const config = configOrThrow(connector)
  // workspace is implied by API key; optional filters only
  const qs = new URLSearchParams()
  if (params.workspace_id) qs.set('workspace_id', params.workspace_id)
  if (params.status) qs.set('status', params.status)
  if (params.limit) qs.set('limit', String(params.limit))
  // POS list requires workspace_id on SKUMS — callers pass company mapping if known
  const res = await fetch(
    `${config.apiUrl}/api/store-ops/requests?${qs.toString()}`,
    { headers: headers(config) },
  )
  if (!res.ok) throw await skumsError(res)
  return (await res.json()) as { data: unknown[] }
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
