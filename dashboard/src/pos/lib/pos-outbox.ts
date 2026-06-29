import type { PosSourceEventEnvelope, PosSourceEventType } from '@pos/shared'
import { supabase } from '@/lib/supabase'
import { STORE } from '@/pos/data/mock'
import type { CartLine, CompletedSale } from '@/pos/lib/pos-context'

export const POS_OUTBOX_SCHEMA_VERSION = 1
export const pendingPosOutboxStorageKey = 'pos_pending_source_events'

export interface PosOutboxBuildOptions {
  workspaceId: string
  actorId?: string | null
}

export interface PosOutboxPersistResult {
  status: 'not_required' | 'queued' | 'persisted'
  count: number
  error?: string
}

interface ReturnLineMetadata {
  reason?: string
  sourceReceiptNo?: string
  originalQty?: number
  authorizedReturnQty?: number
  originalLineRef?: string | null
  skumsOriginalLineId?: string | null
  crmosDecisionId?: string | null
  crmosAuthorizationId?: string | null
  crmosDecision?: string | null
  crmosOrderLineId?: string | null
  crmosAllowedActions?: string[]
  crmosManagerRequired?: boolean
  eligibilityReasonCodes?: string[]
  sourceSystem?: string | null
  sourceOrderRef?: string | null
  matchType?: string | null
  disposition?: string | null
  managerOverrideBy?: string | null
  managerOverrideReason?: string | null
}

function keyPart(value: string | null | undefined) {
  return (value || 'unknown')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function buildPosOutboxIdempotencyKey(eventType: PosSourceEventType, sale: CompletedSale, suffix?: string) {
  return [
    'pos',
    keyPart(sale.storeCode || STORE.code),
    keyPart(sale.registerCode),
    keyPart(sale.receiptNo),
    keyPart(eventType),
    suffix ? keyPart(suffix) : null,
  ].filter(Boolean).join(':')
}

function eventIdFor(idempotencyKey: string) {
  return `evt_${keyPart(idempotencyKey)}`
}

function customerSubject(sale: CompletedSale): PosSourceEventEnvelope['subject'] {
  if (!sale.customer) {
    return {
      customer_key: null,
      external_customer_refs: [],
    }
  }

  return {
    customer_key: `pos:${sale.customer.id}`,
    external_customer_refs: [
      { system: 'pos', id: sale.customer.id },
      ...(sale.customer.externalId ? [{ system: sale.customer.source || 'external', id: sale.customer.externalId }] : []),
    ],
  }
}

function baseEnvelope(
  eventType: PosSourceEventType,
  sale: CompletedSale,
  options: PosOutboxBuildOptions,
  idempotencyKey: string,
  payload: Record<string, unknown>
): PosSourceEventEnvelope {
  return {
    event_id: eventIdFor(idempotencyKey),
    event_type: eventType,
    workspace_id: options.workspaceId,
    source_system: 'pos',
    occurred_at: sale.completedAtIso,
    idempotency_key: idempotencyKey,
    actor: {
      type: 'cashier',
      id: options.actorId ?? null,
      display_name: sale.cashier || null,
    },
    subject: customerSubject(sale),
    context: {
      channel: 'pos',
      country: 'SG',
      currency: STORE.currency,
      location_id: STORE.inventoryLocationId,
      register_id: sale.registerCode,
      listing_id: null,
    },
    payload,
    schema_version: POS_OUTBOX_SCHEMA_VERSION,
  }
}

function returnLineMetadata(line: CartLine): ReturnLineMetadata {
  return {
    reason: 'reason' in line && typeof line.reason === 'string' ? line.reason : undefined,
    sourceReceiptNo: 'sourceReceiptNo' in line && typeof line.sourceReceiptNo === 'string' ? line.sourceReceiptNo : undefined,
    originalQty: 'originalQty' in line && typeof line.originalQty === 'number' ? line.originalQty : undefined,
    authorizedReturnQty:
      'authorizedReturnQty' in line && typeof line.authorizedReturnQty === 'number'
        ? line.authorizedReturnQty
        : undefined,
    originalLineRef: 'originalLineRef' in line && typeof line.originalLineRef === 'string' ? line.originalLineRef : null,
    skumsOriginalLineId:
      'skumsOriginalLineId' in line && typeof line.skumsOriginalLineId === 'string' ? line.skumsOriginalLineId : null,
    crmosDecisionId: 'crmosDecisionId' in line && typeof line.crmosDecisionId === 'string' ? line.crmosDecisionId : null,
    crmosAuthorizationId:
      'crmosAuthorizationId' in line && typeof line.crmosAuthorizationId === 'string' ? line.crmosAuthorizationId : null,
    crmosDecision: 'crmosDecision' in line && typeof line.crmosDecision === 'string' ? line.crmosDecision : null,
    crmosOrderLineId: 'crmosOrderLineId' in line && typeof line.crmosOrderLineId === 'string' ? line.crmosOrderLineId : null,
    crmosAllowedActions:
      'crmosAllowedActions' in line && Array.isArray(line.crmosAllowedActions) ? line.crmosAllowedActions : [],
    crmosManagerRequired:
      'crmosManagerRequired' in line && typeof line.crmosManagerRequired === 'boolean'
        ? line.crmosManagerRequired
        : false,
    eligibilityReasonCodes:
      'eligibilityReasonCodes' in line && Array.isArray(line.eligibilityReasonCodes)
        ? line.eligibilityReasonCodes
        : [],
    sourceSystem: 'sourceSystem' in line && typeof line.sourceSystem === 'string' ? line.sourceSystem : null,
    sourceOrderRef: 'sourceOrderRef' in line && typeof line.sourceOrderRef === 'string' ? line.sourceOrderRef : null,
    matchType: 'matchType' in line && typeof line.matchType === 'string' ? line.matchType : null,
    disposition: 'disposition' in line && typeof line.disposition === 'string' ? line.disposition : null,
    managerOverrideBy:
      'managerOverrideBy' in line && typeof line.managerOverrideBy === 'string' ? line.managerOverrideBy : null,
    managerOverrideReason:
      'managerOverrideReason' in line && typeof line.managerOverrideReason === 'string'
        ? line.managerOverrideReason
        : null,
  }
}

function linePayload(line: CartLine, lineNumber: number) {
  const returnMetadata = returnLineMetadata(line)
  return {
    line_id: line.lineId,
    line_number: lineNumber,
    line_type: line.qty < 0 ? 'return' : 'sale',
    sku: line.sku,
    display_name: line.name,
    quantity: line.qty,
    unit_price: line.unitPrice,
    list_price: line.listPrice,
    discount_amount: line.lineDiscount,
    line_total: line.unitPrice * line.qty - line.lineDiscount * (line.qty < 0 ? -1 : 1),
    refs: {
      product_identity_id: line.product_identity_id ?? null,
      trade_unit_id: line.trade_unit_id ?? null,
      listing_id: line.listing_id ?? null,
      channel_id: line.channel_id ?? null,
      sku_assignment_id: line.sku_assignment_id ?? null,
      identifier_id: line.identifier_id ?? null,
      product_id: line.product_id ?? null,
      variant_id: line.variant_id ?? null,
      batch_id: line.batch_id ?? null,
      local_sku: line.sku,
      store_location_code: line.storeLocationCode ?? null,
    },
    return: line.qty < 0 ? {
      reason_code: returnMetadata.reason ?? null,
      source_receipt_number: returnMetadata.sourceReceiptNo ?? null,
      original_qty: returnMetadata.originalQty ?? null,
      authorized_qty: returnMetadata.authorizedReturnQty ?? Math.abs(line.qty),
      original_line_ref: returnMetadata.originalLineRef ?? null,
      skums_original_line_id: returnMetadata.skumsOriginalLineId ?? null,
      crmos_order_line_id: returnMetadata.crmosOrderLineId ?? null,
      source_system: returnMetadata.sourceSystem ?? null,
      source_order_ref: returnMetadata.sourceOrderRef ?? null,
      match_type: returnMetadata.matchType ?? 'no_matched_sale',
      disposition: returnMetadata.disposition ?? null,
      eligibility_reason_codes: returnMetadata.eligibilityReasonCodes ?? [],
      crmos: {
        decision_id: returnMetadata.crmosDecisionId ?? null,
        authorization_id: returnMetadata.crmosAuthorizationId ?? null,
        decision: returnMetadata.crmosDecision ?? null,
        allowed_actions: returnMetadata.crmosAllowedActions ?? [],
        manager_required: returnMetadata.crmosManagerRequired ?? false,
        manager_override_by: returnMetadata.managerOverrideBy ?? null,
        manager_override_reason: returnMetadata.managerOverrideReason ?? null,
      },
    } : null,
    metadata: {
      line_kind: line.lineKind ?? 'product',
      fran_reward_quote_id: line.franRewardQuoteId ?? null,
      fran_decision_ref: line.franDecisionRef ?? null,
      markdown: line.isMarkdown,
      overridden: line.overridden ?? false,
      override_reason: line.overrideReason ?? null,
      manager_override_by: returnMetadata.managerOverrideBy ?? null,
      manager_override_reason: returnMetadata.managerOverrideReason ?? null,
      discount_label: line.discountLabel ?? null,
      note: line.note ?? null,
    },
  }
}

function paymentPayload(sale: CompletedSale) {
  return sale.payments.map((payment) => ({
    payment_id: payment.id,
    payment_method: payment.mode,
    label: payment.label,
    amount: payment.amount,
    currency: STORE.currency,
    status: payment.status ?? 'captured',
    provider: payment.provider ?? null,
    provider_ref: payment.providerRef ?? null,
    detail: payment.detail ?? null,
    metadata: payment.providerMetadata ?? {},
  }))
}

function payloadString(payload: Record<string, unknown>, key: string) {
  const value = payload[key]
  return typeof value === 'string' && value.trim() ? value : null
}

function aggregateForEvent(event: PosSourceEventEnvelope) {
  if (event.event_type === 'pos.customer.attached') {
    const customer = event.payload.customer
    const customerId =
      customer && typeof customer === 'object' && 'id' in customer && typeof customer.id === 'string'
        ? customer.id
        : event.event_id
    return { aggregateType: 'customer', aggregateId: customerId }
  }

  if (event.event_type === 'pos.return.completed') {
    return { aggregateType: 'return', aggregateId: payloadString(event.payload, 'return_number') ?? event.event_id }
  }

  return { aggregateType: 'sale', aggregateId: payloadString(event.payload, 'receipt_number') ?? event.event_id }
}

export function toPosOutboxRow(companyId: string, event: PosSourceEventEnvelope) {
  const aggregate = aggregateForEvent(event)
  return {
    company_id: companyId,
    event_id: event.event_id,
    event_type: event.event_type,
    status: 'queued',
    source_system: event.source_system,
    idempotency_key: event.idempotency_key,
    aggregate_type: aggregate.aggregateType,
    aggregate_id: aggregate.aggregateId,
    workspace_id: event.workspace_id,
    occurred_at: event.occurred_at,
    payload: event,
  }
}

export function buildPosSaleCompletedEvent(
  sale: CompletedSale,
  options: PosOutboxBuildOptions
): PosSourceEventEnvelope {
  const idempotencyKey = buildPosOutboxIdempotencyKey('pos.sale.completed', sale)
  const saleLines = sale.lines.filter((line) => line.qty > 0)
  return baseEnvelope('pos.sale.completed', sale, options, idempotencyKey, {
    receipt_number: sale.receiptNo,
    sale_type: sale.isExchange ? 'exchange' : 'sale',
    currency: STORE.currency,
    subtotal: sale.subtotal,
    discount_total: sale.discountTotal,
    cart_adjustment: sale.cartPriceOverride?.adjustment ?? 0,
    cart_price_override: sale.cartPriceOverride
      ? {
          id: sale.cartPriceOverride.id,
          reason: sale.cartPriceOverride.reason,
          original_total: sale.cartPriceOverride.originalTotal,
          target_total: sale.cartPriceOverride.targetTotal,
          adjustment: sale.cartPriceOverride.adjustment,
          applied_at: sale.cartPriceOverride.appliedAt,
        }
      : null,
    tax_total: sale.tax,
    total: sale.total,
    points_earned: sale.pointsEarned,
    lines: saleLines.map((line, index) => linePayload(line, index + 1)),
    payments: paymentPayload(sale).filter((payment) => payment.amount >= 0),
    fran: sale.fran
      ? {
          counter_session_id: sale.fran.counterSession?.sessionId ?? null,
          member_mode: sale.fran.memberMode,
          member_id: sale.fran.counterSession?.member?.id ?? null,
          basket_preview_id: sale.fran.basketPreview?.previewId ?? null,
          reward_quote_id: sale.fran.appliedReward?.quote.quoteId ?? null,
          reward_commit_id: sale.fran.appliedReward?.commit?.commitId ?? null,
          reward_status: sale.fran.appliedReward?.status ?? null,
        }
      : null,
    source_sale_id: sale.idempotencyKey,
  })
}

export function buildPosReturnCompletedEvent(
  sale: CompletedSale,
  options: PosOutboxBuildOptions
): PosSourceEventEnvelope {
  const idempotencyKey = buildPosOutboxIdempotencyKey('pos.return.completed', sale)
  const returnLines = sale.lines.filter((line) => line.qty < 0)
  const refundTotal = Math.abs(returnLines.reduce((sum, line) => sum + linePayload(line, 1).line_total, 0))
  const returnMetadata = returnLines.map(returnLineMetadata)
  const crmosDecisionIds = [...new Set(returnMetadata.map((item) => item.crmosDecisionId).filter(Boolean))]
  const crmosAuthorizationIds = [...new Set(returnMetadata.map((item) => item.crmosAuthorizationId).filter(Boolean))]
  const managerOverrides = returnMetadata
    .filter((item) => item.managerOverrideBy)
    .map((item) => ({
      approved_by: item.managerOverrideBy,
      reason: item.managerOverrideReason ?? null,
    }))
  return baseEnvelope('pos.return.completed', sale, options, idempotencyKey, {
    return_number: sale.receiptNo,
    currency: STORE.currency,
    subtotal: sale.subtotal,
    refund_total: refundTotal,
    crmos: {
      decision_ids: crmosDecisionIds,
      authorization_ids: crmosAuthorizationIds,
      decisions: [...new Set(returnMetadata.map((item) => item.crmosDecision).filter(Boolean))],
      manager_required: returnMetadata.some((item) => item.crmosManagerRequired),
      manager_overrides: managerOverrides,
    },
    lines: returnLines.map((line, index) => linePayload(line, index + 1)),
    payments: paymentPayload(sale).filter((payment) => payment.amount <= 0),
    source_sale_id: sale.idempotencyKey,
  })
}

export function buildPosCustomerAttachedEvent(
  sale: CompletedSale,
  options: PosOutboxBuildOptions
): PosSourceEventEnvelope | null {
  if (!sale.customer) return null
  const idempotencyKey = buildPosOutboxIdempotencyKey('pos.customer.attached', sale, sale.customer.id)
  return baseEnvelope('pos.customer.attached', sale, options, idempotencyKey, {
    receipt_number: sale.receiptNo,
    customer: {
      id: sale.customer.id,
      name: sale.customer.name,
      phone: sale.customer.phone || null,
      email: sale.customer.email || null,
      birthday: sale.customer.birthday || null,
      source: sale.customer.source || 'pos',
      external_id: sale.customer.externalId ?? null,
    },
  })
}

export function buildFranOutboxEventsForCompletedSale(
  sale: CompletedSale,
  options: PosOutboxBuildOptions
): PosSourceEventEnvelope[] {
  const fran = sale.fran
  if (!fran?.counterSession) return []

  const events: PosSourceEventEnvelope[] = []
  const session = fran.counterSession
  const member = session.member

  if (member) {
    events.push(baseEnvelope(
      'fran.member.resolved',
      sale,
      options,
      buildPosOutboxIdempotencyKey('fran.member.resolved', sale, member.id),
      {
        receipt_number: sale.receiptNo,
        session_id: session.sessionId,
        member: {
          id: member.id,
          crm_customer_id: member.crmCustomerId,
          member_no: member.memberNo,
          tier: member.tier,
          tourist: member.tourist,
        },
      }
    ))
  }

  if (fran.basketPreview) {
    events.push(baseEnvelope(
      'fran.counter_session.previewed',
      sale,
      options,
      buildPosOutboxIdempotencyKey('fran.counter_session.previewed', sale, fran.basketPreview.previewId),
      {
        receipt_number: sale.receiptNo,
        session_id: session.sessionId,
        mode: session.mode,
        preview_id: fran.basketPreview.previewId,
        earn_points: fran.basketPreview.earnPoints,
        projected_points_balance: fran.basketPreview.projectedPointsBalance,
        reward_count: fran.basketPreview.rewardsAvailable.length,
        warnings: fran.basketPreview.warnings,
      }
    ))
  }

  const reward = fran.appliedReward
  if (!reward) return events

  events.push(baseEnvelope(
    'fran.reward.quoted',
    sale,
    options,
    buildPosOutboxIdempotencyKey('fran.reward.quoted', sale, reward.quote.quoteId),
    {
      receipt_number: sale.receiptNo,
      session_id: session.sessionId,
      quote_id: reward.quote.quoteId,
      reward_id: reward.quote.rewardId,
      decision_ref: reward.quote.decisionRef,
      amount: reward.quote.amount,
      points_cost: reward.quote.pointsCost,
      line_id: reward.lineId,
    }
  ))

  if (reward.status === 'committed' && reward.commit) {
    events.push(baseEnvelope(
      'fran.reward.committed',
      sale,
      options,
      buildPosOutboxIdempotencyKey('fran.reward.committed', sale, reward.commit.commitId),
      {
        receipt_number: sale.receiptNo,
        quote_id: reward.quote.quoteId,
        commit_id: reward.commit.commitId,
        crm_event_id: reward.commit.eventId,
        points_balance_after: reward.commit.pointsBalanceAfter,
      }
    ))
  }

  if (reward.status === 'failed') {
    events.push(baseEnvelope(
      'fran.reward.commit_failed',
      sale,
      options,
      buildPosOutboxIdempotencyKey('fran.reward.commit_failed', sale, reward.quote.quoteId),
      {
        receipt_number: sale.receiptNo,
        quote_id: reward.quote.quoteId,
        error: reward.error,
      }
    ))
  }

  if (reward.status === 'reversed' && reward.reverse) {
    events.push(baseEnvelope(
      'fran.reward.reversed',
      sale,
      options,
      buildPosOutboxIdempotencyKey('fran.reward.reversed', sale, reward.reverse.reverseId),
      {
        receipt_number: sale.receiptNo,
        quote_id: reward.quote.quoteId,
        reverse_id: reward.reverse.reverseId,
        crm_event_id: reward.reverse.eventId,
      }
    ))
  }

  return events
}

export function buildPosOutboxEventsForCompletedSale(
  sale: CompletedSale,
  options: PosOutboxBuildOptions
): PosSourceEventEnvelope[] {
  const events: PosSourceEventEnvelope[] = []
  const customerAttached = buildPosCustomerAttachedEvent(sale, options)
  if (customerAttached) events.push(customerAttached)
  events.push(...buildFranOutboxEventsForCompletedSale(sale, options))
  if (sale.lines.some((line) => line.qty > 0)) events.push(buildPosSaleCompletedEvent(sale, options))
  if (sale.lines.some((line) => line.qty < 0)) events.push(buildPosReturnCompletedEvent(sale, options))
  return events
}

function readPendingEvents(): PosSourceEventEnvelope[] {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(localStorage.getItem(pendingPosOutboxStorageKey) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writePendingEvents(events: PosSourceEventEnvelope[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(pendingPosOutboxStorageKey, JSON.stringify(events))
}

export function pendingPosOutboxEventCount() {
  return readPendingEvents().length
}

export function listPendingPosOutboxEvents() {
  return readPendingEvents()
}

export function enqueuePosOutboxEvents(events: PosSourceEventEnvelope[]) {
  if (events.length === 0) return []
  const existing = readPendingEvents()
  const byKey = new Map(existing.map((event) => [event.idempotency_key, event]))
  for (const event of events) {
    byKey.set(event.idempotency_key, event)
  }
  const next = [...byKey.values()].slice(-100)
  writePendingEvents(next)
  return next
}

export function removePendingPosOutboxEvent(idempotencyKey: string) {
  const next = readPendingEvents().filter((event) => event.idempotency_key !== idempotencyKey)
  writePendingEvents(next)
  return next
}

export async function persistPosOutboxEvents(companyId: string | null | undefined, events: PosSourceEventEnvelope[]): Promise<PosOutboxPersistResult> {
  if (events.length === 0) return { status: 'not_required', count: 0 }

  enqueuePosOutboxEvents(events)
  if (!companyId) return { status: 'queued', count: events.length }

  const { error } = await supabase
    .from('pos_outbox_events')
    .upsert(events.map((event) => toPosOutboxRow(companyId, event)), {
      onConflict: 'company_id,idempotency_key',
      ignoreDuplicates: true,
    })

  if (error) {
    return { status: 'queued', count: events.length, error: error.message }
  }

  for (const event of events) {
    removePendingPosOutboxEvent(event.idempotency_key)
  }
  return { status: 'persisted', count: events.length }
}

export async function retryPendingPosOutboxEvents(companyId: string | null | undefined) {
  return persistPosOutboxEvents(companyId, listPendingPosOutboxEvents())
}
