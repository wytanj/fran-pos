# POS Customer, CRM, And Loyalty Buildout

## Purpose

This document defines how POS should support three merchant modes without forking the register workflow:

1. Shops that do not want a CRM and only need customer details plus points.
2. Shops that connect an external SaaS CRM.
3. Shops that use Open Spine CRM as the customer data spine.

The common thread across all three modes is simple:

```text
customer identifiers + purchase history + replay-safe sale and return facts
```

Everything else, including loyalty points, tiers, segments, VIP labels, lifecycle stage, churn risk, and campaign eligibility, should be a projection over those facts. POS should make purchases and customer attachment reliable first, then let each CRM or loyalty layer decide how rich the customer program becomes.

## Core Position

POS owns:

- Cashier-facing lookup and customer attachment.
- Sale and return execution.
- Receipt attribution.
- Local customer shadow records needed for speed and offline fallback.
- Durable sale and return ledgers.
- Idempotent outbox events.
- Optional POS-native loyalty ledger for small shops.

CRM owns, when enabled:

- Rich customer graph.
- Identity resolution beyond the POS context.
- Consent, preferences, segments, computed profiles, and campaign context.
- Customer memory across ecommerce, support, marketing, partner channels, and POS.

Loyalty owns, when enabled:

- Program policy.
- Earn, burn, adjustment, expiry, refund reversal, and tier progression rules.
- Published policy versions and audit history.

POS must not depend on one specific CRM or loyalty engine to finish checkout. A sale should complete if payment is valid; CRM and loyalty writes can queue and retry.

## Current Repo Anchors

Existing POS anchors:

- `supabase/migrations/00002_create_customers.sql`
- `supabase/migrations/00007_create_pos_source_outbox.sql`
- `packages/shared/src/types/database.ts`
- `dashboard/src/hooks/use-customers.ts`
- `dashboard/src/pos/components/customer-modal.tsx`
- `dashboard/src/pos/lib/customer-profile.ts`
- `dashboard/src/pos/lib/pos-context.tsx`
- `dashboard/src/pos/lib/pos-outbox.ts`
- `dashboard/src/pos/pages/sale.tsx`
- `dashboard/src/pages/customers.tsx`

Existing Open Spine anchors:

- `C:/Users/Jeremy Tan/CodeProjects/crm/docs/architecture.md`
- `C:/Users/Jeremy Tan/CodeProjects/crm/docs/agents/API_CONTRACT.md`
- `C:/Users/Jeremy Tan/CodeProjects/crm/docs/agents/DATA_MODEL.md`
- `C:/Users/Jeremy Tan/CodeProjects/crm/server/api/v1/events/index.post.ts`
- `C:/Users/Jeremy Tan/CodeProjects/crm/server/api/graph/search.get.ts`
- `C:/Users/Jeremy Tan/CodeProjects/crm/supabase/migrations/0002_customer_memory_foundation.sql`

The POS already has customer rows with `email`, `phone`, `external_id`, `source`, and `metadata`. That is enough for early customer lookup, but not enough for robust multi-CRM identity because one customer can have many identifiers and many external links.

The POS already emits replay-safe source event envelopes in `pos_outbox_events`. That should become the common delivery mechanism for Open Spine CRM, external SaaS CRMs, and loyalty systems.

## Register Experience

The cashier should get one consistent customer flow in all modes.

```text
staff enters email, phone, name, member number, QR, or card number
-> POS resolves local and configured external sources
-> POS shows exact match or candidates
-> staff attaches customer to basket or completed receipt
-> POS previews purchase history and earnable points when available
-> payment completes
-> POS writes sale locally
-> POS queues CRM and loyalty sync events
```

Lookup must support both before-sale and after-sale attachment because staff often remember customer crediting only after payment.

Required register affordances:

- One search input that accepts email, phone, name, member number, QR, or external customer ID.
- Candidate list that shows name, phone, email, source, tier or label, points or balance, and last purchase.
- Add minimal customer inline when no match exists.
- Attach customer to an open basket.
- Attach or correct customer on a completed receipt with manager/audit controls.
- Show whether points were credited, queued, failed, or not applicable.
- Never block receipt display on CRM sync.

## Operating Mode 1: POS Lite

POS Lite is for merchants that will not operate a CRM.

Behavior:

- POS stores customers locally.
- POS accepts minimal identity: name, email, phone, birthday, note, tags, member number.
- POS stores purchase history locally.
- POS stores points in a dedicated ledger, not only in `customers.metadata`.
- POS can support simple tiers as a local projection, for example `Silver`, `Gold`, or `VIP`.
- POS still emits outbox events, even if no external connector is enabled.

This mode should feel like a simple member lookup and crediting tool, not a CRM.

Minimum POS Lite rule model:

```text
program
  id
  company_id
  name
  status

policy_version
  id
  program_id
  version
  status draft|active|retired
  earn_rules
  tier_rules
  expiry_rules
  refund_rules

ledger_entry
  id
  company_id
  customer_id
  source_receipt_number
  entry_type earn|redeem|adjust|expire|reverse
  points_delta
  balance_after
  idempotency_key
  policy_version_id
  created_at
```

Important: local tiers should be derived from ledger and purchases. They should not be the only source of customer truth.

## Operating Mode 2: External SaaS CRM

External SaaS CRMs should be connectors, not alternate POS implementations.

Connector capabilities should be explicit:

```text
customer.lookup
customer.create
customer.update
purchase.ingest
purchase.history
loyalty.balance
loyalty.preview_earn
loyalty.credit_sale
loyalty.reverse_sale
consent.read
consent.write
```

Each connector declares supported capabilities. POS only calls supported capabilities and falls back to local behavior where needed.

Examples:

- If the CRM supports lookup but not loyalty, POS resolves the customer externally and credits points locally.
- If the CRM owns loyalty, POS calls `loyalty.preview_earn` before payment and `loyalty.credit_sale` after payment.
- If the CRM only accepts webhooks, POS sends `purchase.ingest` from the outbox and shows credit status as queued.
- If the CRM is down, POS uses local shadow records and retries later.

External CRM tokens must be server-side. The browser should call POS APIs; it should never call HubSpot, Salesforce, Klaviyo, or another CRM directly.

## Operating Mode 3: Open Spine CRM

Open Spine CRM is the customer graph and memory spine.

POS should integrate with Open Spine through two layers:

1. A POS-side Open Spine connector that reads/writes through stable Open Spine APIs.
2. An Open Spine-side event projector that turns POS events into people, external links, facts, and profiles.

Current Open Spine already accepts idempotent source events through `POST /api/v1/events`. POS events need an adapter because POS envelopes are snake_case and Open Spine event payloads are camelCase.

Mapping:

```text
POS envelope                   Open Spine event
event_id                    -> eventId
event_type                  -> eventType
workspace_id                -> workspaceId
source_system               -> sourceSystem
occurred_at                 -> occurredAt
idempotency_key             -> idempotencyKey
schema_version              -> schemaVersion
subject.customer_key        -> subject.customerKey
subject.external_customer_refs -> subject.externalCustomerRefs
context                     -> context
payload                     -> payload
actor                       -> actor
```

Open Spine should add:

```text
GET /api/v1/people/resolve
POST /api/v1/people/resolve
```

Resolver input:

```json
{
  "workspaceId": "crm workspace id",
  "identifiers": [
    { "type": "email", "value": "customer@example.com" },
    { "type": "phone", "value": "+65 9123 4567" },
    { "type": "external_ref", "system": "pos", "value": "customer uuid" }
  ],
  "sourceSystem": "pos"
}
```

Resolver output:

```json
{
  "status": "exact|candidates|none|ambiguous",
  "person": null,
  "candidates": [],
  "warnings": [],
  "proposedActions": []
}
```

Open Spine projector responsibilities:

- Create or update `crm_entities` with type `person`.
- Link POS customer IDs in `crm_external_links`.
- Store raw POS facts in `crm_events`.
- Normalize receipt and return facts into `crm_customer_facts`.
- Update `crm_customer_profiles` with display name, email, phone, activity profile, value profile, and metric values.
- Preserve provenance for every derived field.
- Stage merge proposals rather than auto-merging ambiguous people.

Open Spine should not own POS execution or receipt truth. It should be able to say, "This person has these purchases and profile signals," not, "This POS sale is complete."

## Loyalty Extensibility

Loyalty must be designed as a policy layer over purchases, not as a fixed `points` column.

The common base facts are:

- Customer identity.
- Receipt number.
- Sale timestamp.
- Sale total and currency.
- Return/refund facts.
- Line items and product refs.
- Payment status.
- Store, register, and cashier context.
- Idempotency key.

Possible projections:

- Points balance.
- Lifetime spend.
- Visit count.
- Tier status.
- Tier progress.
- Product affinities.
- Return rate.
- Campaign eligibility.
- Churn risk.
- Birthday or anniversary reward eligibility.

POS Lite can ship simple built-in policies. Open Spine users should be able to extend tiers later without changing POS checkout. External SaaS CRM users can delegate loyalty policy to their provider if the provider supports it.

Rule:

```text
POS records purchases.
Policy computes rewards.
CRM presents customer memory.
```

## POS API Layer

Add a server/API boundary even if early implementation still uses Supabase directly in some screens. The UI should move toward this contract.

```text
GET /api/pos/customers/search
POST /api/pos/customers/resolve
POST /api/pos/customers
PATCH /api/pos/customers/:id
GET /api/pos/customers/:id
GET /api/pos/customers/:id/purchases
GET /api/pos/customers/:id/loyalty
POST /api/pos/sales/:sale_id/attach-customer
POST /api/pos/loyalty/preview-earned
POST /api/pos/loyalty/credit-sale
POST /api/pos/loyalty/reverse-sale
POST /api/pos/outbox/retry
```

`resolve` is the key route. It should query:

1. Local POS identifiers.
2. Local customers.
3. Configured CRM connector when enabled.
4. Open Spine resolver when enabled.
5. Optional loyalty provider when it owns member numbers or balances.

The response should be provider-neutral:

```json
{
  "status": "exact",
  "customer": {
    "id": "pos customer id",
    "displayName": "Ava Tan",
    "email": "ava@example.com",
    "phone": "+65 8123 4470",
    "source": "openspine",
    "externalRefs": [
      { "system": "openspine", "id": "person uuid" }
    ],
    "loyalty": {
      "mode": "local|external|none",
      "pointsBalance": 4280,
      "tier": "Gold",
      "tierProgress": {}
    },
    "lastPurchase": {}
  },
  "candidates": [],
  "sync": {
    "source": "local|cache|external",
    "freshness": "fresh|stale|offline"
  }
}
```

## POS Data Model Additions

Add these tables before deep CRM integration work.

```text
pos_customer_identifiers
  id
  company_id
  customer_id
  identifier_type email|phone|member_number|qr|external_ref|card
  normalized_value
  display_value
  provider
  verified_at
  metadata
  created_at
  updated_at
  unique(company_id, identifier_type, normalized_value)

pos_customer_external_links
  id
  company_id
  customer_id
  provider
  external_id
  external_ref
  is_primary
  last_seen_at
  metadata
  created_at
  updated_at
  unique(company_id, provider, external_id)

pos_loyalty_programs
  id
  company_id
  name
  mode local|external|none
  status
  metadata
  created_at
  updated_at

pos_loyalty_policy_versions
  id
  company_id
  program_id
  version
  status draft|active|retired
  earn_rules
  tier_rules
  expiry_rules
  refund_rules
  created_at
  published_at

pos_loyalty_accounts
  id
  company_id
  customer_id
  program_id
  external_account_ref
  points_balance
  tier_key
  tier_progress
  status
  computed_at
  metadata
  created_at
  updated_at

pos_loyalty_ledger
  id
  company_id
  customer_id
  account_id
  sale_id
  receipt_number
  entry_type earn|redeem|adjust|expire|reverse
  points_delta
  balance_after
  policy_version_id
  idempotency_key
  reason
  metadata
  created_at
  unique(company_id, idempotency_key)

pos_connector_accounts
  id
  company_id
  connector_type crm|loyalty|email|skums
  provider
  status
  capabilities
  config
  last_sync_at
  last_error
  created_at
  updated_at

pos_connector_deliveries
  id
  company_id
  connector_account_id
  outbox_event_id
  status queued|sent|acked|failed|dead_letter
  attempts
  next_retry_at
  last_error
  response_ref
  created_at
  updated_at
```

Implementation note: keep secrets out of browser-readable company settings. Any connector account that stores credentials should be server-only.

## Event Semantics

Required event types:

```text
pos.customer.created
pos.customer.updated
pos.customer.attached
pos.sale.completed
pos.return.completed
pos.loyalty.credit_requested
pos.loyalty.credit_applied
pos.loyalty.credit_failed
pos.loyalty.reversal_requested
pos.loyalty.reversal_applied
```

Current POS events already include:

```text
pos.customer.attached
pos.sale.completed
pos.return.completed
pos.reward.redeem_requested
pos.reward.refund_requested
```

Do not remove those. Add compatibility aliases only when needed, and version event payloads rather than silently changing shape.

Every event needs:

- `event_id`
- `event_type`
- `company_id`
- `workspace_id` when talking to Open Spine or another workspace system
- `source_system`
- `occurred_at`
- `idempotency_key`
- `actor`
- `subject`
- `context`
- `payload`
- `schema_version`

## UI Surfaces

Customer modal:

- Replace direct table-only lookup with `resolve`.
- Show source badges: `Local`, `Open Spine`, `External CRM`, `Offline cache`.
- Show points/tier only when a loyalty source exists.
- Show stale/offline warning when the connector is unavailable.

Sale page:

- Show `earns +X` only after policy preview has run.
- If preview is unavailable, show `points pending` instead of guessing.
- Complete sale even if CRM/loyalty sync is queued.

Sale complete modal:

- Show receipt ready first.
- Show CRM sync status.
- Show loyalty credit status separately from CRM sync.
- Provide retry action for failed customer, CRM, or loyalty deliveries.

Transactions page:

- Allow customer attachment or correction after payment.
- Require manager approval for changing customer on a high-value or already-credited receipt.
- Recompute or reverse loyalty credit through idempotent events.

Customers page:

- Read local customer profile plus linked external refs.
- Show purchase history from POS durable sale tables.
- Show CRM profile summary only as a supplement.
- Show loyalty ledger and current policy version where local loyalty is enabled.

Settings:

- Add CRM connector setup separate from email connector.
- Add loyalty mode: `None`, `POS Lite`, `External`, `Open Spine profile only`.
- Show connector health, last delivery, pending queue, and dead letters.

## Failure Rules

- Checkout must not block on CRM.
- Receipt display must not block on CRM or loyalty.
- Customer attachment should be allowed offline and reconciled later.
- Points credit should be queued when policy or provider is unavailable.
- Idempotency must prevent duplicate points for the same receipt.
- Ambiguous customer identity should create a candidate/proposal, not auto-merge.
- Returns should reverse or adjust points based on the active policy version that governed the original earn event.

## Build Order

1. Persist sale and return rows in `pos_sales`, `pos_sale_lines`, `pos_returns`, and `pos_return_lines` from the register completion path.
2. Add `pos_customer_identifiers` and `pos_customer_external_links`.
3. Add POS customer resolver route and move customer modal lookup through it.
4. Add after-sale customer attach/correct route and transaction UI action.
5. Add local loyalty program, policy version, account, and ledger tables for POS Lite.
6. Add points preview and credit/reversal routes with idempotency.
7. Add connector account and delivery tables.
8. Refactor outbox delivery so SKUMS, external CRM, loyalty, and Open Spine are delivery targets rather than one-off browser calls.
9. Add Open Spine event adapter for `POST /api/v1/events`.
10. Add Open Spine `people/resolve` and event projector in the CRM repo.
11. Add settings UI for CRM mode and loyalty mode.
12. Add tests for resolver, idempotent crediting, queued connector delivery, Open Spine payload mapping, and after-sale attachment.

## Acceptance Checks

POS Lite:

- Staff can add customer by phone or email.
- Staff can attach customer before or after payment.
- Purchase history appears from POS sale tables.
- Points credit is idempotent by receipt/customer/policy.
- Tier display is derived from purchases or ledger entries.

External SaaS CRM:

- POS can resolve a customer from local cache or external CRM.
- POS can complete sale while CRM is unavailable.
- Outbox retries send the purchase later.
- External CRM loyalty credit does not double-credit on retry.
- Unsupported CRM capabilities fall back to local behavior.

Open Spine:

- POS can send `pos.sale.completed` to Open Spine through the adapter.
- Open Spine stores the event idempotently in `crm_events`.
- Open Spine links POS customer IDs through `crm_external_links`.
- Open Spine creates customer facts and profile projections without owning POS execution.
- Ambiguous identity creates a proposal or candidates response, not an automatic merge.

## Non-Goals

- Do not make POS a full CRM.
- Do not make Open Spine own POS checkout execution.
- Do not store loyalty only as a mutable points number on `customers.metadata`.
- Do not hardcode HubSpot, Salesforce, Klaviyo, or any CRM into the sale screen.
- Do not expose external CRM secrets to the browser.
- Do not require a customer for every sale unless merchant settings explicitly require it.
- Do not block payment completion on CRM or loyalty sync.

## Agent Notes

When implementing this buildout:

- Start with POS local persistence and resolver contracts.
- Keep connector logic behind typed adapters.
- Use outbox delivery and idempotency keys for every external write.
- Treat customer details and purchases as the stable common layer.
- Treat tiers, points, segments, and profiles as replaceable projections.
- Update this document, `docs/phase2.md`, shared types, migrations, and tests when contracts change.
