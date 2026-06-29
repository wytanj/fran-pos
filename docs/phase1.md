# POS Phase 1: Headless Register App Over SKUMS

## Purpose

Phase 1 makes the POS app a practical execution client over SKUMS, not a separate product database.

The POS should stay fast for cashiers, but every sale, scan, basket, return, and floor inventory event should preserve enough SKUMS graph context for agents to reason over it later.

Core principle:

```text
POS handles the counter.
SKUMS owns product meaning.
Agents handle operational follow-through.
```

## Reference Inputs

- Local POS foundations:
  - React, Vite, Tailwind register UI
  - demo and live mode split
  - SKUMS connector settings
  - cursor-based SKUMS catalog import
  - graph refs on cart lines
  - sale write to SKUMS
  - inventory event write to SKUMS
  - saved baskets
  - partial returns
  - provider-neutral receipt email connector
- Local SKUMS foundations:
  - POS catalog, scan, sale, and inventory-event APIs
  - identity graph references
  - domain events, agent proposals, approvals, execution logs
  - planned attention item queue
- Square reference model:
  - Square POS API opens Square POS for hardware-backed payments
  - Square Catalog is item/variation/modifier/tax/discount centered
  - Square payment/hardware can be an adapter, not the canonical catalog

## Phase 1 Outcome

By the end of Phase 1, the POS app should be able to:

1. Run as a SKUMS-connected register.
2. Load and refresh POS-ready catalog projections from SKUMS.
3. Resolve scans through SKUMS when local lookup is insufficient.
4. Keep cart lines tied to SKUMS graph references.
5. Complete sales with stable idempotency and retry behavior.
6. Record floor inventory events to SKUMS and surface pending approval state.
7. Preserve saved baskets and partial returns in a way that can become server-backed.
8. Keep payment and receipt delivery provider-neutral, including optional Square payment handoff later.

## Workstream 1: Register Contract Hardening

Strengthen the SKUMS contract in the shared package and register code.

Files to focus:

```text
packages/shared/src/types/skums.ts
dashboard/src/pos/lib/skums-client.ts
dashboard/src/pos/lib/skums-connector.ts
dashboard/src/pos/pages/sale.tsx
tests/skums-pos-contract.test.mjs
```

Changes:

- Add explicit response types for attention/proposal states once SKUMS exposes them.
- Add catalog row revision metadata when SKUMS provides it.
- Add sale response type with sale ID, line IDs, and execution/domain event references.
- Make `createSkumsPosSale` safe for retry by requiring an idempotency key.
- Keep `limit <= 250` and incremental paging.

Acceptance checks:

- Shared types match SKUMS OpenAPI expectations.
- Tests assert `has_more` and `next_offset` remain supported.
- Tests assert sale payloads include graph refs and idempotency.

## Workstream 2: Scan Resolution UX

Use SKUMS scan resolution when a barcode/SKU search does not produce a confident local result.

Files to focus:

```text
dashboard/src/pos/pages/sale.tsx
dashboard/src/pos/lib/skums-client.ts
dashboard/src/pos/components/line-action-modal.tsx
tests/live-demo-mode.test.mjs
```

Behavior:

- Local exact match remains instant.
- If local search misses in live mode, call `POST /api/v1/pos/scan`.
- If SKUMS returns `single`, add the resolved product.
- If SKUMS returns `ambiguous`, show a compact selection dialog.
- If SKUMS returns `none`, show a cashier-safe message and let SKUMS create an attention item server-side.

Acceptance checks:

- Demo mode still works without SKUMS.
- Live mode does not block the cashier on network failure.
- Ambiguous scan does not auto-add the wrong product.
- Unknown scan does not create a fake product locally.

## Workstream 3: Sale Write Reliability

Make completed-sale writes reliable enough for real register use.

Files to focus:

```text
dashboard/src/pos/lib/pos-context.tsx
dashboard/src/pos/lib/skums-sale-adapter.ts
dashboard/src/pos/pages/sale.tsx
dashboard/src/pos/components/sale-complete-modal.tsx
```

Changes:

- Generate stable idempotency keys from receipt number, store code, register code, and completed timestamp.
- Store pending SKUMS sale writes locally if the network fails.
- Add a small sync status surface after checkout.
- Retry pending writes on focus or when returning to the POS shell.
- Persist SKUMS response IDs on the completed sale state when available.

Acceptance checks:

- Completing a sale never blocks receipt display.
- A failed SKUMS write is visible and retryable.
- Duplicate submit does not create duplicate SKUMS sales.
- Tests cover idempotency key creation and retry queue state.

## Workstream 4: Inventory Event Queue

Make damage, found-stock, and transfer-receive events operationally visible.

Files to focus:

```text
dashboard/src/pos/lib/stock-movement.ts
dashboard/src/pos/pages/stock.tsx
dashboard/src/pos/pages/transfers.tsx
supabase/migrations/00005_create_pos_inventory_events.sql
tests/live-demo-mode.test.mjs
```

Changes:

- Store every POS inventory event locally before sending to SKUMS.
- Show status: queued, sent, synced, pending_approval, failed.
- If SKUMS returns `pending_approval`, show that it was received but requires back-office approval.
- Allow retry for failed events.
- Keep graph refs and SKU/product fallback fields in every payload.

Acceptance checks:

- Damage and found-stock do not directly mutate local inventory without SKUMS confirmation.
- Transfer receive can be pending if SKUMS cannot resolve transfer lines.
- Tests cover the local event record and SKUMS payload.

## Workstream 5: Saved Baskets And Partial Returns

Keep the cashier flow practical while preparing for SKUMS-backed operational memory.

Files to focus:

```text
dashboard/src/pos/lib/pos-context.tsx
dashboard/src/pos/pages/sale.tsx
dashboard/src/pos/pages/returns.tsx
tests/live-demo-mode.test.mjs
```

Changes:

- Keep localStorage saved baskets for demo mode.
- Add a live-mode abstraction so saved baskets can later be stored server-side.
- Preserve graph refs on saved basket lines.
- Preserve `sourceReceiptNo`, original quantity, and original line refs for returns.
- Prepare for SKUMS receipt lookup once SKUMS exposes POS sale search APIs.

Acceptance checks:

- Saved basket restore keeps graph refs.
- Return staging remains partial by default.
- Returns do not auto-return the whole receipt.

## Workstream 6: Provider-Neutral Payment And Receipt Path

Keep Square as an optional payment/hardware adapter, not the product architecture.

Files to focus:

```text
dashboard/src/pos/components/payment-modal.tsx
dashboard/src/pos/components/sale-complete-modal.tsx
dashboard/src/pos/lib/customer-email-connector.ts
dashboard/src/pages/settings/integrations.tsx
packages/shared/src/types/database.ts
tests/customer-email-connector.test.mjs
```

Changes:

- Keep current manual/split payment flow working.
- Add payment provider metadata fields that can later store Square transaction IDs.
- Add a planned `square_pos` payment mode but do not require Square.
- Keep receipt email as merchant-owned API configuration.
- Do not hardcode a mail provider.

Optional Square handoff design:

```text
POS builds cart total
-> opens Square POS for tender collection
-> receives Square transaction ID
-> records local payment line with provider metadata
-> submits sale to SKUMS with Square payment reference
```

Acceptance checks:

- Existing split payment behavior remains.
- Receipt email connector stays provider-neutral.
- Square fields can be stored as metadata without changing the core sale model.

## Workstream 7: Operator Feedback

Show enough sync state that cashiers and managers know what happened.

Surfaces:

- Sale complete modal: SKUMS sale sync status.
- Stock page: inventory event status.
- Transfers page: transfer receipt sync status.
- Settings integrations: connector health and last successful check.

Acceptance checks:

- Register UX stays fast.
- Back-office issues are visible without exposing technical errors to cashiers.
- Failures provide enough detail for retry or manager escalation.

## Execution Order

1. Update shared SKUMS types for idempotency, sale response, and future attention/proposal status.
2. Add sale idempotency and pending-write retry queue.
3. Add scan-resolution fallback to SKUMS.
4. Add inventory event local queue and status display.
5. Harden saved baskets and returns so graph refs survive.
6. Add provider-neutral payment metadata for future Square handoff.
7. Add operator sync status surfaces.
8. Run `npm test`.
9. Run `npm run build`.
10. Smoke test `/pos?mode=demo` and `/pos?mode=live` through the app shell.

## Non-Goals

- Do not rewrite the POS as native mobile in Phase 1.
- Do not require Square for payments.
- Do not make POS the canonical catalog.
- Do not silently create products from unknown scans.
- Do not hardcode receipt email delivery to one vendor.
- Do not remove demo mode.

## Done Definition

Phase 1 is done when the POS can complete this loop:

```text
SKUMS catalog projection
-> scan/search
-> cart with graph refs
-> saved basket or sale
-> SKUMS sale write with idempotency
-> inventory event write when needed
-> visible sync/approval status
```

The demo path should show:

```text
Live register uses SKUMS catalog
-> cashier completes sale
-> SKUMS sale is written or queued for retry
-> damage/found-stock event is sent to SKUMS
-> pending approval state is visible
```
