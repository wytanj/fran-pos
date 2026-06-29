import type { SkumsPosSaleInput, SkumsPosSaleResponse } from '@pos/shared'
import type { CompletedSale, PosSaleSyncState } from '@/pos/lib/pos-context'
import type { SkumsConnectorConfig } from './skums-connector'
import { createSkumsPosSale } from './skums-client'
import { toSkumsPosSaleInput } from './skums-sale-adapter'

const pendingSkumsSaleStorageKey = 'pos_pending_skums_sales'

export interface PendingSkumsSaleWrite {
  idempotencyKey: string
  receiptNo: string
  sale: CompletedSale
  payload: SkumsPosSaleInput
  status: 'queued' | 'syncing' | 'failed'
  attempts: number
  lastError: string | null
  createdAt: string
  updatedAt: string
}

function nowIso() {
  return new Date().toISOString()
}

function readQueue(): PendingSkumsSaleWrite[] {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(localStorage.getItem(pendingSkumsSaleStorageKey) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeQueue(queue: PendingSkumsSaleWrite[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(pendingSkumsSaleStorageKey, JSON.stringify(queue))
}

function removeQueuedWrite(idempotencyKey: string) {
  writeQueue(readQueue().filter((item) => item.idempotencyKey !== idempotencyKey))
}

function upsertQueuedWrite(
  sale: CompletedSale,
  payload: SkumsPosSaleInput,
  status: PendingSkumsSaleWrite['status'],
  error: string | null
) {
  const queue = readQueue()
  const existing = queue.find((item) => item.idempotencyKey === payload.idempotency_key)
  const updatedAt = nowIso()
  const next: PendingSkumsSaleWrite = {
    idempotencyKey: payload.idempotency_key,
    receiptNo: sale.receiptNo,
    sale,
    payload,
    status,
    attempts: status === 'failed' ? (existing?.attempts ?? 0) + 1 : existing?.attempts ?? 0,
    lastError: error,
    createdAt: existing?.createdAt ?? updatedAt,
    updatedAt,
  }

  writeQueue([next, ...queue.filter((item) => item.idempotencyKey !== payload.idempotency_key)].slice(0, 50))
  return next
}

export function pendingSkumsSaleWriteCount() {
  return readQueue().length
}

export function readPendingSkumsSaleWrites() {
  return readQueue()
}

export function saleSyncStateFromResponse(
  idempotencyKey: string,
  response: SkumsPosSaleResponse
): PosSaleSyncState {
  return {
    status: 'synced',
    idempotencyKey,
    saleId: response.data.id,
    domainEventIds: response.data.domain_event_ids,
    executionLogIds: response.data.execution_log_ids,
    updatedAt: nowIso(),
  }
}

export function queuedSaleSyncState(idempotencyKey: string, error: unknown): PosSaleSyncState {
  return {
    status: 'queued',
    idempotencyKey,
    error: error instanceof Error ? error.message : 'SKUMS sale write queued for retry',
    updatedAt: nowIso(),
  }
}

export async function syncSkumsSaleWrite(
  sale: CompletedSale,
  connector: SkumsConnectorConfig
): Promise<PosSaleSyncState> {
  const payload = toSkumsPosSaleInput(sale)
  upsertQueuedWrite(sale, payload, 'syncing', null)

  try {
    const response = await createSkumsPosSale(payload, connector)
    removeQueuedWrite(payload.idempotency_key)
    return saleSyncStateFromResponse(payload.idempotency_key, response)
  } catch (err) {
    upsertQueuedWrite(sale, payload, 'failed', err instanceof Error ? err.message : 'SKUMS sale write failed')
    return queuedSaleSyncState(payload.idempotency_key, err)
  }
}

export async function retryPendingSkumsSaleWrites(connector: SkumsConnectorConfig) {
  const queue = readQueue()
  let synced = 0
  let failed = 0

  for (const item of queue) {
    upsertQueuedWrite(item.sale, item.payload, 'syncing', null)
    try {
      await createSkumsPosSale(item.payload, connector)
      removeQueuedWrite(item.idempotencyKey)
      synced += 1
    } catch (err) {
      upsertQueuedWrite(item.sale, item.payload, 'failed', err instanceof Error ? err.message : 'SKUMS sale retry failed')
      failed += 1
    }
  }

  return {
    synced,
    failed,
    remaining: pendingSkumsSaleWriteCount(),
  }
}
