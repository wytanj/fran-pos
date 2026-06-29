# POS Phase 2: Live Operations And Payment Adapter Readiness

## Purpose

Phase 2 assumes Phase 1 has made the POS a reliable SKUMS-connected register with scan resolution, sale idempotency, inventory event sync, saved baskets, partial returns, and provider-neutral receipt delivery.

Phase 2 turns the POS into a real live-operations client: register sessions, server-backed register state, pending sync recovery, inventory workflows, proposal visibility, and optional Square-style payment handoff.

Core principle:

```text
The cashier flow stays fast.
Operational truth flows back to SKUMS.
Payment, email, and hardware remain replaceable adapters.
```

## Phase 2 Outcome

By the end of Phase 2, the POS should be able to:

1. Resume register state across refreshes, devices, and network interruptions.
2. Keep saved baskets and pending sale writes server-backed in live mode.
3. Surface SKUMS attention/proposal status in manager-friendly POS screens.
4. Support optional Square-style payment handoff without making Square required.
5. Show reliable inventory event lifecycle from cashier action to SKUMS approval or execution.
6. Support register sessions, staff actions, manager approvals, and closing reports.
7. Prepare for mobile/tablet install and offline-first behavior without a native rewrite.

## Workstream 1: Server-Backed Register State

Move live-mode operational state out of browser-only storage.

Files to focus:

```text
supabase/migrations/
packages/shared/src/types/database.ts
dashboard/src/pos/lib/pos-context.tsx
dashboard/src/pos/pages/sale.tsx
dashboard/src/pos/pos-shell.tsx
tests/live-demo-mode.test.mjs
```

Suggested tables:

```text
pos_register_state
  id
  company_id
  register_code
  staff_user_id
  state_type
  status
  payload
  skums_refs
  created_at
  updated_at

pos_pending_sync
  id
  company_id
  register_code
  sync_type
  idempotency_key
  payload
  status
  attempt_count
  last_error
  next_retry_at
  created_at
  updated_at
```

State types:

```text
saved_basket
pending_sale
pending_inventory_event
register_draft
```

Acceptance checks:

- Demo mode can still use localStorage.
- Live mode can persist saved baskets server-side.
- Pending SKUMS writes survive refresh.
- Retry queue dedupes by idempotency key.

## Workstream 2: Register Sessions And Closing

Make live POS usage auditable by register and staff session.

Files to focus:

```text
dashboard/src/pos/pages/pos-login.tsx
dashboard/src/pos/pos-shell.tsx
dashboard/src/pos/pages/reports.tsx
dashboard/src/pages/settings/staff.tsx
packages/shared/src/types/database.ts
```

Changes:

- Add explicit open/close register session flow.
- Store opening float, closing cash count, staff user, register code, and device ref.
- Attach register session IDs to sale payloads and inventory event payloads.
- Add closing summary by payment method, returns, discounts, overrides, and pending sync.
- Require manager approval for closing mismatch over threshold.

Acceptance checks:

- A live sale has register and session metadata.
- Reports separate demo data from live session data.
- Closing can flag unresolved pending sync.
- Manager approval state is test-covered.

## Workstream 3: SKUMS Attention And Proposal Surfaces

Show the POS user enough operational state without turning POS into the full SKUMS back office.

Files to focus:

```text
dashboard/src/pos/pages/stock.tsx
dashboard/src/pos/pages/transfers.tsx
dashboard/src/pos/pages/reports.tsx
dashboard/src/pages/dashboard.tsx
dashboard/src/pos/lib/skums-client.ts
packages/shared/src/types/skums.ts
```

Add client calls:

```text
GET /api/v1/attention-items?source_app_key=pos
GET /api/v1/agent-proposals?app_key=pos
POST /api/v1/agent-proposals/:id/decision
```

POS surfaces:

- Stock page: unresolved damage/found-stock attention items.
- Transfers page: transfer receipt proposals.
- Reports page: pending sync and pending approval summary.
- Dashboard: live operations queue.

Acceptance checks:

- Cashiers see simple status.
- Managers can open details and approve/reject where allowed.
- POS does not expose raw graph internals to cashier-only users.

## Workstream 4: Payment Adapter Readiness

Prepare Square-style handoff while keeping the payment layer provider-neutral.

Files to focus:

```text
dashboard/src/pos/components/payment-modal.tsx
dashboard/src/pos/lib/pos-context.tsx
dashboard/src/pos/lib/skums-sale-adapter.ts
dashboard/src/pages/settings/payments.tsx
dashboard/src/pages/settings/integrations.tsx
packages/shared/src/types/database.ts
tests/live-demo-mode.test.mjs
```

Suggested payment provider model:

```text
pos_payment_providers
  company_id
  provider_key
  provider_label
  enabled
  config
  created_at
  updated_at
```

Initial provider keys:

```text
manual
cash
card_manual
external_terminal
square_pos
custom
```

Square-style flow:

```text
POS builds payable total
-> payment adapter opens Square POS or external terminal handoff
-> callback stores provider transaction ID
-> POS completes local sale
-> sale payload sends provider metadata to SKUMS
```

Acceptance checks:

- Existing manual and split payments keep working.
- Square is optional.
- Payment metadata can include provider, transaction ID, terminal ID, status, and raw callback summary.
- Failed payment handoff does not create a completed sale.

## Workstream 5: Offline And Retry Behavior

Prepare the register for unstable store networks.

Scope:

- Detect online/offline state.
- Queue sale writes and inventory events locally first.
- Persist pending sync in live mode when authenticated.
- Retry with backoff.
- Keep receipt display available even when SKUMS is temporarily unreachable.
- Clearly mark sales as pending sync.

Acceptance checks:

- Offline sale completion creates a pending sync item, not a silent failure.
- Reconnect triggers retry.
- Duplicate retries do not duplicate SKUMS sales.
- Cashier sees sync status without technical stack traces.

## Workstream 6: Inventory Workflows

Promote stock and transfer flows from demo operations into live store workflows.

Files to focus:

```text
dashboard/src/pos/pages/stock.tsx
dashboard/src/pos/pages/transfers.tsx
dashboard/src/pos/lib/stock-movement.ts
supabase/migrations/00005_create_pos_inventory_events.sql
tests/live-demo-mode.test.mjs
```

Changes:

- Add event history by SKU, storage location, and status.
- Add manager review for damage and found stock before local adjustment.
- Add transfer receive line matching and unresolved-line status.
- Add SKUMS attention/proposal IDs to local records when returned.
- Show whether SKUMS applied, rejected, or needs approval.

Acceptance checks:

- Inventory actions do not vanish after submission.
- Pending approval is visible.
- Rejected events show reason.
- Transfer receive supports partial receipt.

## Workstream 7: Customer And Receipt Operations

Deepen customer and receipt actions without hardcoding vendors.

Detailed buildout reference: `docs/pos-customer-crm-loyalty-buildout.md`.

Files to focus:

```text
dashboard/src/pos/components/customer-modal.tsx
dashboard/src/pos/components/sale-complete-modal.tsx
dashboard/src/pos/lib/customer-email-connector.ts
dashboard/src/pages/customers.tsx
packages/shared/src/types/database.ts
tests/customer-email-connector.test.mjs
```

Changes:

- Store receipt email request history.
- Add receipt resend status.
- Add customer lookup from live customer table before demo fallback.
- Add customer consent metadata where needed.
- Keep the email endpoint merchant-owned.

Acceptance checks:

- Receipt resend can be audited.
- Failed receipt email request can be retried.
- No single email provider is hardcoded.

## Workstream 8: Tablet/PWA Hardening

Keep the current web stack, but make it behave like a store-floor register.

Scope:

- PWA install metadata.
- Touch-friendly register layout checks.
- Larger tap targets for checkout-critical actions.
- Route recovery after refresh.
- App shell status for online/offline, register, staff, and SKUMS sync.
- Browser smoke tests on desktop and tablet viewport.

Acceptance checks:

- `/pos?mode=demo` and `/pos?mode=live` remain usable at tablet width.
- Critical buttons do not shift layout.
- Refresh returns to the right shell state.

## Execution Order

1. Add live-mode server-backed saved baskets and pending sync tables.
2. Add sale write retry queue with idempotency.
3. Add register session open/close flow.
4. Add SKUMS attention/proposal client types and manager surfaces.
5. Add payment provider config model and optional Square-style metadata path.
6. Add offline/retry UI state.
7. Deepen inventory event history and transfer receipt statuses.
8. Add receipt email request history and retry.
9. Add tablet/PWA hardening.
10. Run `npm test`.
11. Run `npm run build`.
12. Smoke test `/pos?mode=demo` and `/pos?mode=live` on a fresh dev server.

## Non-Goals

- Do not rewrite the POS in React Native or Ionic in Phase 2.
- Do not make Square required.
- Do not make POS own canonical product identity.
- Do not bypass SKUMS approval for risky inventory corrections.
- Do not hardcode a customer email provider.
- Do not expose full SKUMS back-office complexity to cashier-only users.

## Done Definition

Phase 2 is done when a live register can complete this loop:

```text
open register session
-> load SKUMS catalog
-> scan/search and sell
-> complete payment through manual or provider adapter path
-> queue/write sale to SKUMS with idempotency
-> submit inventory events with visible status
-> show pending approvals and sync issues
-> close register with report
```

The demo path should show:

```text
Live POS completes a sale while SKUMS is unavailable
-> sale is queued
-> SKUMS reconnect retry succeeds
-> manager sees inventory event pending approval
-> closing report shows no unresolved critical sync
```
