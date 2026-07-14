import type { SkumsPosSaleInput } from '@pos/shared'
import type { CompletedSale } from '@/pos/lib/pos-context'
import { getActiveStore } from '@/pos/lib/pos-store-config'

export function getPosRegisterCode() {
  return `${getActiveStore().code}-REG-01`
}

/** @deprecated use getPosRegisterCode() — kept for import stability */
export const POS_REGISTER_CODE = `${getActiveStore().code}-REG-01`

function keyPart(value: string | null | undefined) {
  return (value || 'unknown')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function buildSkumsSaleIdempotencyKey(sale: Pick<CompletedSale, 'receiptNo' | 'completedAtIso'>) {
  const store = getActiveStore()
  return [
    'vantage-pos-sale',
    keyPart(store.code),
    keyPart(getPosRegisterCode()),
    keyPart(sale.receiptNo),
    keyPart(sale.completedAtIso),
  ].join(':')
}

export function toSkumsPosSaleInput(sale: CompletedSale): SkumsPosSaleInput {
  const store = getActiveStore()
  const idempotencyKey = sale.idempotencyKey || buildSkumsSaleIdempotencyKey(sale)

  return {
    location_id: store.inventoryLocationId,
    register_id: getPosRegisterCode(),
    receipt_number: sale.receiptNo,
    sale_type: sale.isExchange ? 'exchange' : 'sale',
    status: 'completed',
    customer_ref: sale.customer?.id ?? null,
    currency: 'SGD',
    subtotal: sale.subtotal,
    discount_total: sale.discountTotal,
    tax_total: sale.tax,
    total: sale.total,
    source: 'pos',
    idempotency_key: idempotencyKey,
    completed_at: sale.completedAtIso,
    items: sale.lines.map((line, index) => ({
      line_number: index + 1,
      product_identity_id: line.product_identity_id ?? null,
      trade_unit_id: line.trade_unit_id ?? null,
      listing_id: line.listing_id ?? null,
      channel_id: line.channel_id ?? null,
      sku_assignment_id: line.sku_assignment_id ?? null,
      identifier_id: line.identifier_id ?? null,
      product_id: line.product_id ?? null,
      variant_id: line.variant_id ?? null,
      batch_id: line.batch_id ?? null,
      display_name: line.name,
      scanned_value: line.sku,
      quantity: line.qty,
      unit_price: line.unitPrice,
      list_price: line.listPrice,
      discount_amount: line.lineDiscount,
      tax_amount: 0,
      line_total: line.unitPrice * line.qty - line.lineDiscount * (line.qty < 0 ? -1 : 1),
      line_type: line.qty < 0 ? 'return' : 'sale',
      reason_code: line.note ?? null,
      metadata: {
        local_sku: line.sku,
        line_kind: line.lineKind ?? 'product',
        fran_reward_quote_id: line.franRewardQuoteId ?? null,
        fran_decision_ref: line.franDecisionRef ?? null,
        discount_label: line.discountLabel,
        markdown: line.isMarkdown,
        overridden: line.overridden ?? false,
        override_reason: line.overrideReason ?? null,
        store_location_code: line.storeLocationCode ?? null,
        source_receipt_no: 'sourceReceiptNo' in line ? line.sourceReceiptNo : null,
        original_qty: 'originalQty' in line ? line.originalQty : null,
        authorized_return_qty: 'authorizedReturnQty' in line ? line.authorizedReturnQty : null,
        original_line_ref: 'originalLineRef' in line ? line.originalLineRef : null,
        crmos_decision_id: 'crmosDecisionId' in line ? line.crmosDecisionId : null,
        crmos_authorization_id: 'crmosAuthorizationId' in line ? line.crmosAuthorizationId : null,
        crmos_decision: 'crmosDecision' in line ? line.crmosDecision : null,
        crmos_order_line_id: 'crmosOrderLineId' in line ? line.crmosOrderLineId : null,
        match_type: 'matchType' in line ? line.matchType : null,
        disposition: 'disposition' in line ? line.disposition : null,
        manager_override_by: 'managerOverrideBy' in line ? line.managerOverrideBy : null,
        manager_override_reason: 'managerOverrideReason' in line ? line.managerOverrideReason : null,
      },
    })),
    payments: sale.payments.map((payment) => ({
      payment_method: payment.mode,
      payment_ref: payment.providerRef ?? payment.detail ?? null,
      amount: payment.amount,
      currency: 'SGD',
      status: payment.status ?? 'captured',
      metadata: {
        label: payment.label,
        detail: payment.detail ?? null,
        provider: payment.provider ?? null,
        provider_ref: payment.providerRef ?? null,
        provider_metadata: payment.providerMetadata ?? {},
      },
    })),
    metadata: {
      cashier: sale.cashier,
      local_timestamp: sale.timestamp,
      completed_at_iso: sale.completedAtIso,
      sales_type: sale.salesType,
      points_earned: sale.pointsEarned,
      fran: sale.fran
        ? {
            counter_session_id: sale.fran.counterSession?.sessionId ?? null,
            member_mode: sale.fran.memberMode,
            member_id: sale.fran.counterSession?.member?.id ?? null,
            basket_preview_id: sale.fran.basketPreview?.previewId ?? null,
            policy_version_id: sale.fran.basketPreview?.policyVersionId ?? null,
            assignment_id: sale.fran.basketPreview?.assignmentId ?? null,
            skums_quote_id: sale.fran.basketPreview?.skumsQuoteId ?? null,
            reward_quote_id: sale.fran.appliedReward?.quote.quoteId ?? null,
            reward_commit_id: sale.fran.appliedReward?.commit?.commitId ?? null,
            reward_status: sale.fran.appliedReward?.status ?? null,
            evaluation_trace_id: sale.fran.basketPreview?.evaluationTrace?.traceId ?? null,
          }
        : null,
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
      store: {
        id: store.id,
        code: store.code,
        name: store.name,
        inventory_location_id: store.inventoryLocationId,
      },
      register: {
        code: getPosRegisterCode(),
      },
    },
  }
}
