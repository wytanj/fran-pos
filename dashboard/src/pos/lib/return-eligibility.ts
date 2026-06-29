import { supabase } from '@/lib/supabase'
import { CUSTOMERS, PAST_TRANSACTIONS, PRODUCTS, STORE, type Product } from '@/pos/data/mock'
import type {
  PosReturnAllowedAction,
  PosReturnEligibilityDecision,
  PosReturnEligibilityRequest,
  PosReturnEligibilityResponse,
  PosReturnProductRef,
  PosReturnRequestedAction,
} from '@pos/shared'

export const pendingReturnChecksStorageKey = 'pos_pending_return_checks'

const DEMO_POLICY_VERSION = 1
const DEMO_RETURN_WINDOW_DAYS = 45

export interface ReturnEligibilityInput {
  companyId: string | null | undefined
  staffId?: string | null
  customerEmail: string
  product: Product
  orderDateHint?: string | null
  receiptOrOrderHint?: string | null
  quantity: number
  requestedAction: PosReturnRequestedAction
}

interface PersistedReturnCheck {
  id: string
  storage: 'supabase' | 'local'
}

interface MatchedLine {
  transaction: (typeof PAST_TRANSACTIONS)[number]
  item: (typeof PAST_TRANSACTIONS)[number]['items'][number]
  orderDate: Date
}

function keyPart(value: string | null | undefined) {
  return (value || 'unknown')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

function isoDateOnly(value: Date) {
  return value.toISOString().slice(0, 10)
}

function parseDemoTransactionDate(value: string) {
  return new Date(value.replace(' ', 'T') + ':00+08:00')
}

function addDays(value: Date, days: number) {
  const next = new Date(value)
  next.setDate(next.getDate() + days)
  return next
}

function isWithinReturnWindow(orderDate: Date, now = new Date()) {
  return now.getTime() <= addDays(orderDate, DEMO_RETURN_WINDOW_DAYS).getTime()
}

function productRef(product: Product): PosReturnProductRef {
  return {
    sku: product.sku,
    product_identity_id: product.skums?.product_identity_id ?? null,
    product_id: product.skums?.product_id ?? product.id,
    name: product.name,
  }
}

function requestHash(request: PosReturnEligibilityRequest) {
  return [
    request.workspaceId,
    normalizeEmail(request.customer.email),
    keyPart(request.product.sku),
    keyPart(request.product.product_identity_id),
    keyPart(request.purchaseHint.orderDate),
    keyPart(request.purchaseHint.receiptOrOrderNumber),
    request.requested.quantity,
    request.requested.action,
  ].join(':')
}

function customerNameForEmail(email: string) {
  const normalized = normalizeEmail(email)
  return CUSTOMERS.find((customer) => normalizeEmail(customer.email) === normalized)?.name ?? null
}

function findDemoPurchase(input: ReturnEligibilityInput): MatchedLine | null {
  const customerName = customerNameForEmail(input.customerEmail)
  if (!customerName) return null

  const receiptHint = input.receiptOrOrderHint?.trim().toLowerCase()
  const orderDateHint = input.orderDateHint?.trim()

  for (const transaction of PAST_TRANSACTIONS) {
    if (transaction.type === 'Refund') continue
    if (transaction.customer !== customerName) continue
    if (receiptHint && !transaction.receiptNo.toLowerCase().includes(receiptHint)) continue

    const orderDate = parseDemoTransactionDate(transaction.date)
    if (orderDateHint && isoDateOnly(orderDate) !== orderDateHint) continue

    const item = transaction.items.find((line) => line.sku === input.product.sku)
    if (item) return { transaction, item, orderDate }
  }

  return null
}

function decisionCopy(decision: PosReturnEligibilityDecision) {
  return {
    eligible: 'Return is eligible.',
    exchange_only: 'Exchange is allowed, but refund is blocked by policy.',
    store_credit_only: 'Store credit is allowed without a matched sale.',
    manager_review: 'Manager review is required before completing this return.',
    ineligible: 'This item is not eligible for return.',
    not_found: 'No matching purchase was found for this email and product.',
    insufficient_context: 'Enter a customer email and product before checking return eligibility.',
  }[decision]
}

function allowedActionsForDecision(decision: PosReturnEligibilityDecision): PosReturnAllowedAction[] {
  if (decision === 'eligible') return ['refund', 'exchange', 'store_credit']
  if (decision === 'exchange_only') return ['exchange']
  if (decision === 'store_credit_only') return ['store_credit']
  if (decision === 'manager_review') return ['exchange', 'store_credit']
  return []
}

function buildResponse(
  input: ReturnEligibilityInput,
  request: PosReturnEligibilityRequest,
  decision: PosReturnEligibilityDecision,
  reasonCodes: string[],
  match: MatchedLine | null
): PosReturnEligibilityResponse {
  const authorizationAllowed = ['eligible', 'exchange_only', 'store_credit_only', 'manager_review'].includes(decision)
  const idBase = requestHash(request)
  const returnableUntil = match ? addDays(match.orderDate, DEMO_RETURN_WINDOW_DAYS) : null
  const decisionId = `demo-retcheck-${keyPart(idBase)}`
  const authorizationId = authorizationAllowed ? `demo-ra-${keyPart(idBase)}` : null

  return {
    decisionId,
    authorizationId,
    decision,
    allowedActions: allowedActionsForDecision(decision),
    managerRequired: decision === 'manager_review',
    expiresAt: authorizationAllowed ? addDays(new Date(), 1).toISOString() : null,
    reasonCodes,
    message: decisionCopy(decision),
    matchedPurchase: match
      ? {
          sourceSystem: 'pos',
          orderRef: match.transaction.receiptNo,
          orderDate: isoDateOnly(match.orderDate),
          orderLineRef: `${match.transaction.receiptNo}:${match.item.sku}`,
          productName: match.item.name,
          sku: match.item.sku,
          quantityPurchased: match.item.qty,
          quantityAlreadyReturned: 0,
          quantityReturnable: Math.max(0, match.item.qty),
          returnableUntil: returnableUntil?.toISOString() ?? null,
          unitPrice: match.item.price,
        }
      : null,
    policy: {
      version: DEMO_POLICY_VERSION,
      label: `Demo ${DEMO_RETURN_WINDOW_DAYS} day return policy`,
    },
    counterEvidence: [
      { label: 'Email', value: normalizeEmail(input.customerEmail) },
      { label: 'Product', value: input.product.sku },
      ...(match
        ? [
            { label: 'Order date', value: isoDateOnly(match.orderDate) },
            { label: 'Returnable quantity', value: String(match.item.qty) },
          ]
        : [{ label: 'Matched purchase', value: 'No exact sale found' }]),
    ],
  }
}

function evaluateLocalEligibility(
  input: ReturnEligibilityInput,
  request: PosReturnEligibilityRequest
): PosReturnEligibilityResponse {
  if (!normalizeEmail(input.customerEmail) || !input.product.sku) {
    return buildResponse(input, request, 'insufficient_context', ['order_date_required'], null)
  }

  const match = findDemoPurchase(input)
  const product = PRODUCTS.find((item) => item.sku === input.product.sku) ?? input.product
  const requestedQty = Math.max(1, input.quantity)

  if (match) {
    if (!product.returnable) {
      return buildResponse(input, request, 'manager_review', ['non_returnable_product', 'manager_override_required'], match)
    }

    if (requestedQty > match.item.qty) {
      return buildResponse(input, request, 'manager_review', ['quantity_already_returned', 'manager_override_required'], match)
    }

    if (!isWithinReturnWindow(match.orderDate)) {
      return buildResponse(input, request, 'store_credit_only', ['outside_window', 'policy_fallback'], match)
    }

    return buildResponse(input, request, 'eligible', ['within_window', 'quantity_available', 'email_order_match'], match)
  }

  if (!product.returnable) {
    return buildResponse(input, request, 'ineligible', ['non_returnable_product', 'email_product_match_no_order'], null)
  }

  if (input.orderDateHint || input.receiptOrOrderHint) {
    return buildResponse(input, request, 'manager_review', ['not_found', 'manager_override_required'], null)
  }

  return buildResponse(input, request, 'store_credit_only', ['email_product_match_no_order', 'policy_fallback'], null)
}

function readPendingReturnChecks() {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(localStorage.getItem(pendingReturnChecksStorageKey) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writePendingReturnChecks(checks: unknown[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(pendingReturnChecksStorageKey, JSON.stringify(checks.slice(-50)))
}

async function persistReturnCheck(
  companyId: string | null | undefined,
  input: ReturnEligibilityInput,
  request: PosReturnEligibilityRequest,
  response: PosReturnEligibilityResponse
): Promise<PersistedReturnCheck> {
  const localId = `local-retcheck-${Date.now()}`
  const row = {
    company_id: companyId,
    crmos_decision_id: response.decisionId,
    crmos_authorization_id: response.authorizationId,
    email_hint: normalizeEmail(input.customerEmail),
    order_date_hint: input.orderDateHint || null,
    receipt_or_order_hint: input.receiptOrOrderHint?.trim() || null,
    product_ref: request.product,
    sku: input.product.sku,
    requested_qty: Math.max(1, input.quantity),
    requested_action: input.requestedAction,
    decision: response.decision,
    allowed_actions: response.allowedActions,
    reason_codes: response.reasonCodes,
    manager_required: response.managerRequired,
    matched_source_system: response.matchedPurchase?.sourceSystem ?? null,
    matched_order_ref: response.matchedPurchase?.orderRef ?? null,
    matched_order_line_ref: response.matchedPurchase?.orderLineRef ?? null,
    raw_decision: response,
    checked_by_staff_id: input.staffId ?? null,
    expires_at: response.expiresAt,
  }

  if (companyId) {
    try {
      const { data, error } = await supabase
        .from('pos_return_checks')
        .insert(row)
        .select('id')
        .single()

      if (!error && data?.id) return { id: data.id as string, storage: 'supabase' }
    } catch {
      // Fall through to local queue. The register should not block on check persistence.
    }
  }

  writePendingReturnChecks([
    ...readPendingReturnChecks(),
    {
      ...row,
      id: localId,
      company_id: companyId ?? 'demo',
      checked_at: new Date().toISOString(),
    },
  ])
  return { id: localId, storage: 'local' }
}

export async function checkReturnEligibility(input: ReturnEligibilityInput) {
  const workspaceId = input.companyId ?? 'demo'
  const request: PosReturnEligibilityRequest = {
    workspaceId,
    sourceSystem: 'pos',
    store: {
      id: STORE.id,
      registerId: `${STORE.code}-REG-01`,
    },
    staff: {
      id: input.staffId ?? null,
    },
    customer: {
      email: normalizeEmail(input.customerEmail),
    },
    product: productRef(input.product),
    purchaseHint: {
      orderDate: input.orderDateHint || null,
      receiptOrOrderNumber: input.receiptOrOrderHint?.trim() || null,
    },
    requested: {
      quantity: Math.max(1, input.quantity),
      action: input.requestedAction,
    },
  }

  const response = evaluateLocalEligibility(input, request)
  const persisted = await persistReturnCheck(input.companyId, input, request, response)

  return {
    ...response,
    localReturnCheckId: persisted.id,
    storage: persisted.storage,
  }
}

export function returnDecisionLabel(decision: PosReturnEligibilityDecision) {
  return decision
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function decisionAllowsReturn(decision: PosReturnEligibilityDecision) {
  return ['eligible', 'exchange_only', 'store_credit_only', 'manager_review'].includes(decision)
}
