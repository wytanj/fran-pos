# POS To crmOS Return Eligibility Handoff

## Purpose

This document defines the handoff from POS to crmOS for return and exchange eligibility.

The staff workflow should stay simple:

```text
product + customer email + optional order date or receipt
-> POS asks crmOS whether return or exchange is valid
-> POS shows the allowed action
-> POS executes the refund, exchange, store credit, or manager-review flow
```

crmOS is the canonical name going forward. Older docs and code may still say Open Spine CRM, but this handoff uses `crmOS`.

## Product Position

POS should not ask floor staff to reason through customer history, graph identity, order provenance, or return policy. Staff only need to answer:

```text
Who is asking?      email
What came back?     product scan/search
When was it bought? optional order date, receipt, or order number
What do they want?  refund, exchange, or either
```

crmOS should answer:

```text
eligible
exchange_only
store_credit_only
manager_review
ineligible
not_found
insufficient_context
```

The key boundary stays the same as the sale/return foundation:

- POS owns return execution, tender, receipt truth, inventory disposition, register audit, and outbox events.
- crmOS owns identity resolution, cross-channel purchase memory, return policy evaluation, matched-order evidence, and counter-safe eligibility decisions.
- Loyalty or rewards reversal follows the policy version that governed the original earn event.

crmOS can say a return is allowed. POS is still the system that completes the refund or exchange.

## Existing POS Anchors

Current POS already has the right return primitives:

```text
dashboard/src/pos/pages/returns.tsx
dashboard/src/pos/lib/pos-context.tsx
dashboard/src/pos/lib/pos-outbox.ts
packages/shared/src/types/database.ts
tests/live-demo-mode.test.mjs
tests/pos-source-outbox.test.mjs
```

Important current behavior:

- Return lines are negative cart lines.
- Partial returns start from original receipt lines instead of auto-staging a whole receipt.
- Return payloads carry `source_receipt_number`, `original_qty`, `original_line_ref`, and `skums_original_line_id`.
- Completed exchanges may emit both `pos.sale.completed` and `pos.return.completed`.
- POS outbox persistence is idempotent by `company_id` and `idempotency_key`.

## Staff UI Model

Replace the current return entry point with a `Check return` workflow.

### Step 1: Identify

Fields:

```text
Product
  scan barcode, QR, SKU, or search product

Customer email
  required for crmOS eligibility check

Order date
  optional, but shown as a compact date picker

Receipt or order number
  optional, useful for exact matches

Quantity
  defaults to 1

Requested action
  refund, exchange, store credit, either
```

Staff should not see a large CRM search screen here. The UI is a return-check form, not a customer profile browser.

### Step 2: Eligibility Result

POS should show one prominent decision:

```text
Eligible
Exchange only
Store credit only
Manager review
Not found
Ineligible
Need more details
```

Show only counter-safe supporting details:

```text
Matched order date
Matched channel or source
Purchased quantity
Already returned quantity
Still returnable quantity
Return deadline
Allowed actions
Reason
Manager approval requirement
```

Do not expose the full customer graph, sensitive attributes, campaign data, or unrelated purchase history.

### Step 3: Complete

If the decision allows action:

```text
select refund, exchange, or store credit
select reason
select item condition
select inventory disposition
collect manager approval if required
complete POS return or exchange
emit pos.return.completed
```

If the decision is `not_found`, POS should follow the crmOS fallback:

```text
exchange_only
store_credit_only
manager_review
ineligible
```

POS should not invent local policy when crmOS is enabled and returns an authoritative decision.

## POS Data Model

Add a return-check layer before final return execution.

```text
pos_return_checks
  id uuid primary key
  company_id uuid not null
  crmos_decision_id text null
  crmos_authorization_id text null
  email_hint text not null
  order_date_hint date null
  receipt_or_order_hint text null
  product_ref jsonb not null
  sku text null
  requested_qty numeric not null default 1
  requested_action text not null
  decision text not null
  allowed_actions jsonb not null default '[]'
  reason_codes text[] not null default '{}'
  manager_required boolean not null default false
  matched_source_system text null
  matched_order_ref text null
  matched_order_line_ref text null
  raw_decision jsonb not null default '{}'
  checked_by_staff_id uuid null
  checked_at timestamptz not null default now()
  expires_at timestamptz null
```

Purpose:

- Preserve exactly what the staff checked.
- Preserve crmOS decision and authorization references.
- Let POS complete a return later without asking staff to re-run the lookup.
- Keep audit evidence when a manager overrides or accepts a fallback.

Extend durable returns:

```text
pos_returns
  crmos_decision_id text null
  crmos_authorization_id text null
  return_check_id uuid null references pos_return_checks(id)
  eligibility_decision text null
  manager_ref uuid null
  manager_reason text null
```

Extend return lines:

```text
pos_return_lines
  crmos_order_line_id text null
  source_system text null
  source_order_ref text null
  source_receipt_number text null
  original_line_ref text null
  match_type text not null default 'no_matched_sale'
  eligibility_reason_codes text[] not null default '{}'
  disposition text null
```

Suggested `match_type` values:

```text
exact_order_line
customer_history
same_email_product_date
no_matched_sale
manager_override
```

## crmOS Data Model

crmOS needs a commerce memory layer that can answer return checks without exposing the whole graph to POS.

```text
crm_commerce_orders
  id uuid primary key
  workspace_id uuid not null
  person_id uuid null
  source_system text not null
  external_order_ref text not null
  order_number text null
  receipt_number text null
  email_at_purchase text null
  occurred_at timestamptz not null
  status text not null
  currency text not null
  subtotal numeric null
  discount_total numeric null
  tax_total numeric null
  total numeric null
  raw_event_id uuid null
  metadata jsonb not null default '{}'
  unique(workspace_id, source_system, external_order_ref)
```

```text
crm_commerce_order_lines
  id uuid primary key
  workspace_id uuid not null
  order_id uuid not null references crm_commerce_orders(id)
  external_line_ref text null
  product_identity_id text null
  product_ref jsonb not null default '{}'
  sku text null
  product_name text null
  quantity_purchased numeric not null
  quantity_already_returned numeric not null default 0
  unit_price numeric null
  final_line_total numeric null
  returnable_until timestamptz null
  policy_snapshot jsonb not null default '{}'
  metadata jsonb not null default '{}'
```

```text
crm_return_policies
  id uuid primary key
  workspace_id uuid not null
  version integer not null
  status text not null
  effective_from timestamptz not null
  effective_until timestamptz null
  rules jsonb not null default '{}'
  created_at timestamptz not null default now()
  published_at timestamptz null
  unique(workspace_id, version)
```

```text
crm_return_eligibility_checks
  id uuid primary key
  workspace_id uuid not null
  request_hash text not null
  email_hint text not null
  order_date_hint date null
  receipt_or_order_hint text null
  product_ref jsonb not null
  sku text null
  requested_qty numeric not null
  requested_action text not null
  matched_person_id uuid null
  matched_order_id uuid null
  matched_order_line_id uuid null
  decision text not null
  allowed_actions jsonb not null default '[]'
  reason_codes text[] not null default '{}'
  manager_required boolean not null default false
  policy_version_id uuid null
  evidence jsonb not null default '{}'
  created_at timestamptz not null default now()
  expires_at timestamptz null
  unique(workspace_id, request_hash)
```

```text
crm_return_authorizations
  id uuid primary key
  workspace_id uuid not null
  eligibility_check_id uuid not null references crm_return_eligibility_checks(id)
  matched_order_line_id uuid null
  product_ref jsonb not null
  approved_qty numeric not null
  allowed_actions jsonb not null default '[]'
  status text not null
  valid_until timestamptz not null
  consumed_by_source_system text null
  consumed_by_return_ref text null
  consumed_at timestamptz null
  metadata jsonb not null default '{}'
```

Why authorization is separate from eligibility:

- Eligibility can be recomputed or cached.
- Authorization is what POS consumes when a return is completed.
- A consumed authorization prevents repeated refunds against the same allowed quantity.
- Manager overrides can still create an authorization with explicit override provenance.

## crmOS Eligibility API

Add a POS-facing route:

```text
POST /api/v1/pos/returns/eligibility
```

Request:

```json
{
  "workspaceId": "workspace uuid",
  "sourceSystem": "pos",
  "store": {
    "id": "store id",
    "registerId": "register id"
  },
  "staff": {
    "id": "staff id"
  },
  "customer": {
    "email": "customer@example.com"
  },
  "product": {
    "sku": "SKU-123",
    "barcode": "8888888888888",
    "productIdentityId": "optional product identity id",
    "name": "Product name"
  },
  "purchaseHint": {
    "orderDate": "2026-06-01",
    "receiptOrOrderNumber": "optional"
  },
  "requested": {
    "quantity": 1,
    "action": "either"
  }
}
```

Response:

```json
{
  "decisionId": "return check uuid",
  "authorizationId": "return authorization uuid or null",
  "decision": "eligible",
  "allowedActions": ["refund", "exchange", "store_credit"],
  "managerRequired": false,
  "expiresAt": "2026-06-24T09:30:00.000Z",
  "reasonCodes": ["within_window", "quantity_available"],
  "message": "Return is eligible.",
  "matchedPurchase": {
    "sourceSystem": "pos",
    "orderRef": "POS-000123",
    "orderDate": "2026-06-01",
    "orderLineRef": "line-1",
    "productName": "Product name",
    "sku": "SKU-123",
    "quantityPurchased": 1,
    "quantityAlreadyReturned": 0,
    "quantityReturnable": 1,
    "returnableUntil": "2026-06-30T15:59:59.999Z"
  },
  "policy": {
    "version": 4,
    "label": "Standard 30 day return policy"
  },
  "counterEvidence": [
    {
      "label": "Order date",
      "value": "2026-06-01"
    },
    {
      "label": "Returnable quantity",
      "value": "1"
    }
  ]
}
```

The response should be deliberately compact. POS does not need the full person graph.

## Decision Semantics

Use stable decision strings.

```text
eligible
  Refund and exchange may proceed according to allowedActions.

exchange_only
  Refund is blocked, but exchange is allowed.

store_credit_only
  Original tender refund is blocked, but store credit is allowed.

manager_review
  POS may proceed only after manager approval.

ineligible
  Policy blocks return or exchange.

not_found
  No matching sale/order line was found.

insufficient_context
  crmOS needs more input, usually order date, receipt, or clearer product identity.
```

Use reason codes for machine behavior:

```text
within_window
outside_window
quantity_available
quantity_already_returned
non_returnable_product
final_sale
email_order_match
email_product_match_no_order
receipt_match
order_date_required
policy_fallback
manager_override_available
manager_override_required
unknown_product
identity_ambiguous
connector_unavailable
```

POS can map these to short cashier copy.

## Return Without Matched Sale

The user requirement explicitly allows product checks where the product may not resolve to a known sale.

crmOS should handle this as a policy decision, not a POS guess.

Examples:

```text
email + product + no exact order
  -> exchange_only if policy allows goodwill exchange
  -> store_credit_only if policy allows customer-service credit
  -> manager_review if value or fraud risk is high
  -> ineligible if policy requires matched receipt
```

For these cases:

- `matchedPurchase` can be null.
- `authorizationId` may still be present if policy allows the fallback.
- POS stores `match_type = no_matched_sale` or `manager_override`.
- crmOS stores the eligibility check with evidence and reason codes.
- POS return completion still emits `pos.return.completed`.

## POS Completion Contract

When POS completes a return, include crmOS references in the event payload.

```json
{
  "return_number": "VAN-000456",
  "currency": "SGD",
  "refund_total": 49,
  "crmos": {
    "decision_id": "return check uuid",
    "authorization_id": "return authorization uuid",
    "decision": "eligible"
  },
  "lines": [
    {
      "line_type": "return",
      "sku": "SKU-123",
      "quantity": -1,
      "return": {
        "reason_code": "wrong_size",
        "source_receipt_number": "POS-000123",
        "original_qty": 1,
        "original_line_ref": "line-1",
        "crmos_order_line_id": "crm order line uuid",
        "match_type": "exact_order_line",
        "disposition": "resell"
      }
    }
  ]
}
```

crmOS should consume the completed event and mark the authorization consumed:

```text
crm_return_authorizations.status = consumed
crm_return_authorizations.consumed_by_source_system = pos
crm_return_authorizations.consumed_by_return_ref = return_number
crm_return_authorizations.consumed_at = event occurred_at
```

If the outbox retries, idempotency should make this safe.

## UI States

The return page should have these states:

```text
idle
  Empty check form.

checking
  Disable complete actions; show lookup progress.

eligible
  Show allowed actions and continue button.

blocked
  Show ineligible reason; allow manager path only if decision permits.

review_required
  Show manager approval control and reason.

connector_unavailable
  If crmOS is enabled, use configured offline policy.
  Do not silently switch to permissive local returns.

ready_to_complete
  Return or exchange basket has lines and crmOS authorization reference.

completed
  Show receipt and sync status separately.
```

Suggested page layout:

```text
Return check
  Product [scan/search]
  Customer email
  Order date
  Receipt/order number
  Quantity
  Requested action
  [Check return]

Decision
  Large decision badge
  Allowed actions
  Matched purchase summary
  Reason
  Manager requirement

Return details
  Reason
  Condition
  Disposition
  Refund/exchange method
  [Complete return] or [Start exchange]
```

## Settings

Add return eligibility settings under the crmOS connector setup.

```text
Return eligibility source
  Local POS policy
  crmOS
  External CRM connector

When crmOS is unavailable
  Block return checks
  Manager review only
  Store-credit fallback only

No matched sale behavior
  Ineligible
  Manager review
  Store credit only
  Exchange only

Decision cache duration
  e.g. 15 minutes
```

These settings should be server-side connector policy. Browser code should not store crmOS credentials.

## Security And Privacy

- POS browser calls POS server routes.
- POS server calls crmOS.
- crmOS credentials and tokens stay server-side.
- Eligibility response is counter-safe and narrow.
- Do not expose unrelated purchases.
- Do not expose customer graph relationships.
- Do not expose marketing segments or confidential profile fields unless the route is explicitly counter-visible.
- Email should be normalized for matching, but raw staff input should be preserved in the audit check.

## Build Order In POS

1. Add `pos_return_checks` migration and shared types.
2. Add POS server route `POST /api/pos/returns/eligibility`.
3. Add crmOS connector method for return eligibility.
4. Update returns page to start from `Check return`.
5. Store eligibility decision and authorization on the return basket/lines.
6. Require manager approval when crmOS decision says so.
7. Include crmOS references in `pos.return.completed`.
8. Add settings for return eligibility source and fallback behavior.
9. Add tests for decision mapping, no matched sale fallback, idempotent authorization use, and outbox payload shape.

## Build Order In crmOS

1. Add commerce order and order-line read models if not already present.
2. Project POS `pos.sale.completed` and ecommerce sale/order events into `crm_commerce_orders` and `crm_commerce_order_lines`.
3. Project `pos.return.completed` into returned quantity counters and return facts.
4. Add `crm_return_policies`.
5. Add `crm_return_eligibility_checks`.
6. Add `crm_return_authorizations`.
7. Add `POST /api/v1/pos/returns/eligibility`.
8. Add policy evaluator with explicit reason codes.
9. Add authorization consumption from `pos.return.completed`.
10. Add docs under crmOS API and data model docs.
11. Add tests for exact match, no matched sale, partial quantity, already returned, outside window, manager review, and idempotent checks.

## Acceptance Criteria

POS:

- Staff can check return eligibility with product plus email.
- Staff can optionally add order date or receipt number for stronger matching.
- POS shows one clear eligibility decision.
- POS does not expose full crmOS customer records.
- POS blocks or routes returns according to crmOS decision.
- POS can still complete valid refund, exchange, and store-credit flows.
- POS includes crmOS decision and authorization refs in `pos.return.completed`.
- POS handles crmOS unavailable according to configured fallback.

crmOS:

- Eligibility route resolves email, product, and optional order hints.
- Exact order-line matches return available quantity and policy evidence.
- No matched sale returns use explicit policy fallback.
- Decisions are idempotent by normalized request hash.
- Authorization cannot be consumed twice.
- Completed POS return events update returned quantity.
- Response is counter-safe and excludes unrelated customer data.
- Tests cover exact, partial, missing, ineligible, manager-review, and offline/error cases.

## Non-Goals

- Do not make POS browse the full crmOS graph for returns.
- Do not make crmOS execute refunds.
- Do not require staff to identify a CRM person manually.
- Do not hardcode one vertical return policy into POS.
- Do not silently allow local policy when crmOS is configured as authoritative.
- Do not expose crmOS secrets in browser-readable settings.
