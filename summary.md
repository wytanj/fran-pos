# Fran POS Summary

This summary is the handoff artifact for the Fran POS fork. It explains what the
POS currently owns, what it already implements, and what Fran CRM and Fran SKUMS
must provide so the checkout stays cashier-native while customer, loyalty,
reward, product, stock, and provenance truth stay outside the register.

Fran POS is the physical checkout client. It should feel like a register, not a
CRM screen. The POS should consume compact decision packets from Fran CRM and
SKUMS, render those decisions clearly for the cashier, and emit replay-safe POS
facts after checkout.

## Executive Summary

- Fran POS owns the transaction surface: basket scanning/search, cashier prompts,
  payment, receipt rendering, void/failure handling, and local source-event
  outbox.
- Fran CRM owns the customer and loyalty decision spine: member identity, safe
  counter profile, tier, points balance, active perks, point expiry, reward
  eligibility, reward quote/commit/reversal, and offline reconciliation.
- Fran SKUMS owns product and inventory truth: POS catalog, scan resolution, stock
  availability, cart valuation inputs, sale sync, return sync, inventory events,
  and fulfillment/store-ops handoff.
- The current Fran POS build has Fran-specific POS surfaces under
  `dashboard/src/pos/fran/**`, a mock-first Fran CRM client, a cashier-facing
  member/exception workflow, basket preview, reward redemption, receipt reward
  sections, and replay-safe outbox events.
- Payment is blocked until the cashier resolves one of three checkout identities:
  existing/new member, explicit non-member, or tourist.
- Rewards and points are never auto-applied. The cashier quotes and confirms
  before payment; points are deducted only after payment confirmation; committed
  rewards are reversed on payment failure after commit or transaction void.
- Fran CRM outages do not block sales. POS falls back to queued loyalty earn
  events and stores replay-safe outbox rows for reconciliation.

## Implemented Fran POS Surfaces

Fran-specific workflow is intentionally isolated from generic POS helpers:

- `dashboard/src/pos/fran/types.ts`
  - Defines the contract types for member resolution, counter sessions, active
    perks, point expiry alerts, basket preview, earn projection, tier progress,
    reward catalogue rows, points redemption, quote/commit/reversal, loyalty sync,
    and final sale context.
- `dashboard/src/pos/fran/mock-crm.ts`
  - Supplies a mock Fran CRM decision service with Base/Silver/Gold members,
    active perks, point expiry lookahead, earn projections, tier progress,
    points redemption, redeemable rewards, quotes, commits, reversals, and event
    acknowledgements.
- `dashboard/src/pos/fran/lib/fran-crm-client.ts`
  - Exposes the POS-facing CRM methods and switches between mock and live mode.
  - Uses live HTTP calls when `VITE_FRAN_CRM_URL` or a register-local endpoint is
    configured.
  - Falls back to mock mode when offline mode is enabled.
- `dashboard/src/pos/fran/components/fran-member-strip.tsx`
  - Renders the persistent member or exception strip at the top of the sale flow.
- `dashboard/src/pos/fran/components/fran-customer-modal.tsx`
  - Handles scan/search/manual lookup, member selection, new member registration,
    offline member fallback, non-member, and tourist paths.
- `dashboard/src/pos/fran/components/fran-counter-profile-card.tsx`
  - Shows the safe counter profile, active perks, point expiry warning, projected
    earn, multipliers, rewards available, and tier progress.
- `dashboard/src/pos/fran/components/fran-reward-redemption-panel.tsx`
  - Handles threshold-gated points redemption, balance-filtered catalogue rewards,
    two-step customer confirmation, and quoted reward display.
- `dashboard/src/pos/pages/sale.tsx`
  - Integrates the Fran strip/modal/profile/reward panel into the checkout.
  - Sends basket preview requests when cart lines change.
  - Applies Fran reward or points redemptions as read-only cart adjustment lines.
  - Commits rewards after payment confirmation and reverses committed rewards on
    failure or void.
  - Stores the final Fran sale context on completed sale records.
- `dashboard/src/pos/lib/pos-outbox.ts`
  - Builds replay-safe Fran and generic POS source events with stable idempotency
    keys.
- `dashboard/src/pos/lib/reward-receipt.ts`
  - Separates Fran reward/points lines from product lines for printed and digital
    receipt payloads.
- `dashboard/src/pages/settings/integrations.tsx`
  - Provides register-local Fran CRM settings for endpoint URL and offline mode.

## Runtime Configuration

Fran POS can run fully in mock mode while Fran CRM is incomplete.

Live CRM mode is enabled by either:

- Setting `VITE_FRAN_CRM_URL` for the dashboard build.
- Saving a Fran CRM API URL in Settings > Integrations > Fran CRM and turning off
  offline mode for that register.

Register-local browser keys:

- `fran_crm_endpoint_url`
- `fran_crm_offline_mode`

Important runtime rule:

- Browser code must call a POS-safe Fran CRM endpoint or proxy. Do not expose CRM,
  loyalty, SKUMS, Supabase service-role, or database credentials through `VITE_`
  variables.

## Ownership Boundary

Fran POS owns checkout execution:

- Product scan/search entry point.
- Basket state.
- Cashier prompts.
- Payment collection.
- Distinct sale, reward, points, refund, void, and receipt lines.
- Local source-event outbox.
- Register-local degraded/offline messaging.

Fran CRM owns customer and loyalty decisions:

- Customer identity and merge/link decisions.
- Member lookup and POS-safe member projection.
- Counter session lifecycle.
- Active perks.
- Tier state and tier progress.
- Point balance and point lots.
- Point expiry warnings.
- Points redemption eligibility.
- Reward catalogue, eligibility, quote, commit, reversal, and reconciliation.
- POS source event inbox and deduplication.

Fran SKUMS owns product and inventory decisions:

- Product identity.
- POS-enabled catalogue.
- Scan resolution.
- Stock availability.
- Cart valuation inputs.
- Sale sync.
- Return sync.
- Inventory events.
- Fulfillment/store-ops handoff.

Boundary rule:

- Fran POS may render CRM and SKUMS decisions, but it must not become the source
  of truth for loyalty economics, customer graph decisions, product taxonomy, or
  fulfillment policy.

## Cashier Workflow

The sale screen starts unresolved. The cashier must identify the basket before
payment:

1. Scan/search member by QR, barcode, member number, mobile number, or manual
   lookup.
2. Select an exact/candidate member, register a new member, choose non-member, or
   choose tourist.
3. POS opens a Fran counter session and stores the returned safe projection on the
   open basket.
4. POS sends basket preview requests as cart lines change.
5. POS renders projected earn, tier progress, active perks, expiry warnings,
   points redemption, and redeemable rewards.
6. Cashier can quote points or a catalogue reward only after the customer chooses
   it.
7. POS asks for explicit confirmation before adding a Fran reward/points line.
8. Payment confirmation commits the quoted reward.
9. Payment failure before commit removes the quote line and leaves the reward
   available.
10. Payment failure after commit or transaction void sends a reversal.
11. Completed sale events and Fran events are persisted through the POS outbox.

Payment button behavior:

- Disabled when the basket is empty.
- Disabled when total is zero or below.
- Disabled until there is a Fran counter session for member, non-member, or
  tourist.

## Identity Modes

Fran POS supports three explicit counter-session modes:

- `member`
  - Existing resolved member or newly registered counter member.
  - Eligible for member profile projection, points earn, tier progress, expiry
    alert, and reward decisions.
- `non_member`
  - Explicit no-loyalty sale.
  - No points or member rewards should be offered.
- `tourist`
  - Explicit tourist exception.
  - Receipt/event payload should preserve tourist handling, but member loyalty
    decisions should not run unless Fran CRM later defines a tourist policy.

Open-basket retagging:

- Retagging is allowed before payment completion.
- Retagging starts a new counter session.
- POS clears stale basket preview decisions.
- POS removes any uncommitted Fran reward or points line.
- Only the final tag at payment completion should be treated as the committed sale
  identity.

After payment completion:

- Customer correction is a separate receipt action.
- High-value, credited, or reward-committed corrections should require
  manager/audit controls.
- Loyalty correction should happen through idempotent CRM adjustment/reversal
  events, not by editing the closed sale in place.

## POS-Facing Fran CRM Client

Fran POS expects these client methods:

- `resolveMember(input)`
- `getCounterSession(input)`
- `previewBasket(input)`
- `quoteRewardRedemption(input)`
- `commitRewardRedemption(input)`
- `reverseRewardRedemption(input)`
- `sendEvent(input)`

Suggested live endpoints:

- `POST /fran/pos/member/resolve`
- `POST /fran/pos/counter-session`
- `POST /fran/pos/basket/preview`
- `POST /fran/pos/rewards/quote`
- `POST /fran/pos/rewards/commit`
- `POST /fran/pos/rewards/reverse`
- `POST /api/v1/events`

Live HTTP expectations:

- Requests are JSON.
- POS sends `x-pos-client: fran-pos`.
- The client times out quickly enough for the cashier to continue checkout.
- CRM errors should be explicit and safe to render as cashier-facing degraded
  state.
- Writes must be idempotent by POS-provided idempotency key.

## Member Resolution

Endpoint:

- `POST /fran/pos/member/resolve`

Input:

- Raw lookup value.
- Lookup method: `qr`, `barcode`, `member_number`, `mobile`, or `manual`.

Output:

- `status`: `matched` or `none`.
- The original input.
- Candidate member matches.
- Warnings safe for cashier display.

Member matches must be POS-safe. Do not return CRM-only private notes, merge
history, full provenance internals, sensitive identifiers, or write-capable
tokens.

## Counter Session

Endpoint:

- `POST /fran/pos/counter-session`

Starts one of:

- Existing member session.
- New member sign-up session.
- Non-member exception.
- Tourist exception.

Required response shape:

- `sessionId`
- `mode`: `member`, `non_member`, or `tourist`
- `member`: null for non-member/tourist, otherwise a POS-safe member object
- `activePerks`
- `pointsExpiryAlert`
- `startedAt`
- `expiresAt`
- `prompts`
- `warnings`

Current member tiers:

- `Base`
- `Silver`
- `Gold`

POS-safe member profile fields:

- Customer/member id.
- CRM customer id.
- Member number.
- Name.
- Phone.
- Email if safe for counter display.
- Tier.
- Current points balance.
- Member since.
- Birthday.
- Point expiry date.
- Reward count.
- Tourist flag.
- Warnings safe for cashier display.

## Active Perks

Fran CRM should return active perks at counter-session start. POS renders these
only; POS does not calculate eligibility.

Current perk kinds:

- `free_sample_threshold`
- `birthday_discount`
- `tier_specific_offer`

Each perk should include:

- Stable id.
- Kind.
- Title.
- Description.
- Value label.
- Threshold amount when applicable.
- Currency.
- Tier when tier-specific.
- Expiry when time-limited.

## Points Expiry Alert

Fran CRM owns point lots and expiry calculation.

Default lookahead:

- 30 days unless CRM returns another policy value.

Alert payload:

- Amount at risk.
- Expiry date.
- Lookahead days.
- Calculation timestamp.

POS behavior:

- Display alert on the counter profile card.
- Carry alert into `fran.member.resolved`.
- Do not inspect point lots locally.

## Basket Preview

Endpoint:

- `POST /fran/pos/basket/preview`

Called whenever the open basket changes.

Input cart fields:

- `cartId`
- Lines with `lineId`, SKU, name, quantity, unit price, line total, and optional
  line kind.
- Subtotal.
- Discount total.
- Total after discount.
- Currency.
- Cart update timestamp.

Output should include:

- Preview id.
- Session id.
- Member id when applicable.
- Earn points.
- Projected points balance.
- Earn projection.
- Tier progress.
- Points redemption offer.
- Redeemable rewards.
- Full reward catalogue size for audit/debug comparison.
- Additional reward decisions when applicable.
- Warnings.
- Expiry timestamp for the preview decision.

POS behavior:

- Render preview decisions live.
- Clear preview on CRM failure.
- Clear uncommitted reward/points lines when the basket changes after quote.
- Do not silently promote local display state to loyalty truth.

## Earn Projection

Earn projection should come from CRM/SKUMS decision logic, not from POS alone.

The returned earn projection should include:

- `sourceSystem: "fran_skums"`
- Earn policy basis: `pre_discount` or `post_discount`
- Base amount.
- Subtotal.
- Discount total.
- Total after discount.
- Points per currency unit.
- Tier multiplier.
- Birthday multiplier.
- Campaign multiplier.
- Total multiplier.
- Projected earn points.
- Calculation timestamp.

POS fallback:

- If CRM preview is unavailable but a member was identified, POS may queue a
  provisional earn event.
- The event must be marked as `source: "pos_fallback"` when no CRM preview exists.
- CRM must recompute or validate final earn during reconciliation.

## Tier Progress

Fran CRM owns tier calculation.

Tier progress must use the same trailing 12-month spend window as actual tier
logic.

Return:

- Current tier.
- Next tier.
- Measurement window: `trailing_12_months`.
- Window start and end.
- Current trailing 12-month spend.
- Current transaction value.
- Projected trailing 12-month spend.
- Next tier threshold.
- Spend required for next tier.
- Gap before transaction.
- Gap remaining after transaction.
- Whether the current basket crosses a threshold.
- Upgrade alert text when applicable.
- Progress percent.

POS behavior:

- Render pre-payment upgrade alert.
- Render progress bar/details.
- Refresh when items, discounts, or reward lines change.

## Points Redemption

Points redemption is CRM-owned and threshold-gated.

CRM should return a `pointsRedemption` offer only when appropriate:

- Available points.
- Minimum redemption threshold.
- Maximum redeemable points.
- Points-to-currency rate.
- Available dollar equivalent.
- Minimum dollar equivalent.
- Currency.
- Eligibility.
- Reason if ineligible.

Rules:

- POS must never auto-apply points.
- Cashier enters or accepts a partial points value.
- Points value must be a whole number inside the CRM-provided range.
- Customer confirmation is required.
- Quote is requested after explicit selection.
- Points are deducted only on payment-confirmed commit.
- Redemption is recorded as a distinct negative cart line with
  `lineKind: "fran_points"`.
- The points line keeps quote metadata and must not be merged into promotional
  discounts.

## Reward Catalogue

Preview should return `redeemableRewards`, already filtered to rewards the member
can redeem now.

Each reward row needs:

- Reward id.
- Name.
- Description.
- Value type: dollar value or product value.
- Points cost.
- Value.
- Value label.
- Expiry date when applicable.
- Currency.
- Eligibility.
- Reason if ineligible.

Rules:

- Expired rewards should be hidden before POS receives the filtered list.
- Time-limited rewards should include expiry so POS can show labels such as
  `expires 30 Jun`.
- The rewards indicator is informational.
- Selection is two-step:
  - Cashier selects the customer-chosen reward.
  - POS confirms `Apply [Reward Name] (X pts)?`.
- CRM quote is requested only after explicit confirmation.
- The resulting cart line uses `lineKind: "fran_reward"` when it is not a points
  redemption line.

## Reward Quote, Commit, and Reversal

Quote endpoint:

- `POST /fran/pos/rewards/quote`

Quote input:

- Counter session.
- Basket preview.
- Reward id.
- Optional points-to-redeem value.
- Basket total.
- Currency.

Quote output:

- Quote id.
- Preview id.
- Reward id.
- Member id.
- Redemption kind.
- Title.
- Line label.
- Amount.
- Points cost.
- Minimum points when relevant.
- Points value rate when relevant.
- Points balance before.
- Points balance after redemption.
- Currency.
- Quote expiry.
- Confirmation text.
- Decision reference.

Commit endpoint:

- `POST /fran/pos/rewards/commit`

Commit rules:

- Called only after payment confirmation.
- Must use POS idempotency key.
- Deducts points or marks reward redeemed.
- Returns commit id, quote id, status, CRM event id, and points balance after.

Reverse endpoint:

- `POST /fran/pos/rewards/reverse`

Reverse rules:

- Called when payment fails after commit or a completed transaction is voided.
- Must use POS idempotency key.
- Restores points.
- Reverts reward availability.
- Returns reverse id, commit id, status, CRM event id, reason, points restored,
  points balance after, and reward availability.

Failure behavior:

- If payment fails before commit, POS removes the quoted line and sends no commit.
- If commit fails after payment confirmation, sale still completes and loyalty
  follow-up is queued for reconciliation.
- If reversal fails, POS shows the failure on sale completion/void state and
  emits enough event context for CRM operations to reconcile.

## Receipt Behavior

Receipts must keep rewards distinct from product discounts.

Printed and digital receipts should show:

- Points earned this transaction.
- Points redeemed.
- Updated balance when available.
- Reward name.
- Points used.
- Dollar equivalent when available.
- Net dollar value applied.
- Reward status: redeemed, reversed, failed, or quoted.

Product `lines` in receipt email payloads should exclude Fran reward and Fran
points adjustment rows so external email/template systems do not merge loyalty
redemptions into product discount sections.

## Offline and Reconnect Behavior

Fran CRM being unreachable must never block a sale.

Expected POS behavior:

- If a member was already identified, checkout continues with a visible
  `CRM offline - earn queued` state.
- If lookup fails before CRM returns a profile, POS can create an offline member
  session from the scanned identifier or use explicit non-member/tourist mode.
- Reward redemption and catalogue rewards require live CRM quote decisions.
- POS clears stale CRM preview decisions when preview fails.
- POS may calculate provisional earn only for queued reconciliation.
- Post-transaction and receipt surfaces show loyalty as queued when earn was not
  confirmed live.

Expected CRM support:

- Accept queued POS source events after reconnect.
- Reconcile offline member identifiers such as member number or mobile.
- Accept `fran.points_earn.queued`.
- Credit earn idempotently.
- Recompute or validate final earn server-side when policy requires.
- Preserve receipt number, session id, member identifier, queued points, reason,
  preview id, source, and idempotency key.

Queued earn event fields:

- `receipt_number`
- `session_id`
- `member_id`
- `crm_customer_id`
- `member_no`
- `points_earned`
- `sync_status: "queued"`
- `sync_on_reconnect: true`
- `queued_at`
- `reason`
- `preview_id`
- `source`: `fran_crm_preview` or `pos_fallback`

## Outbox and Source Events

POS outbox rules:

- Every external write must be idempotent.
- Idempotency keys are derived from store, register, receipt, event type, and a
  stable suffix.
- Events are first queued locally.
- Supabase persistence uses upsert on `company_id,idempotency_key`.
- Pending events are retried without blocking checkout.

Fran CRM should consume and deduplicate:

- `fran.member.resolved`
- `fran.counter_session.previewed`
- `fran.reward.quoted`
- `fran.reward.committed`
- `fran.reward.reversed`
- `fran.reward.commit_failed`
- `fran.points_earn.queued`

Generic POS events may accompany the sale:

- `pos.customer.attached`
- `pos.sale.completed`
- `pos.return.completed`
- `pos.reward.redeem_requested`
- `pos.reward.refund_requested`

CRM processing rules:

- Never double-credit points.
- Never double-deduct points.
- Never double-restore points.
- Treat replayed events as the same fact when idempotency keys match.
- Keep POS source facts as provenance, not as unchecked customer truth.

## SKUMS Boundary

Fran POS continues to use SKUMS for:

- Product scan resolution.
- POS catalogue.
- Stock availability.
- Sale sync.
- Return sync.
- Inventory events.
- Fulfillment/store-ops handoff.

Fran loyalty metadata may be sent to SKUMS as sale metadata. SKUMS should not
become the reward, points, tier, or member decision system.

Cart valuation relationship:

- POS submits cart structure to Fran CRM.
- Fran CRM may call Fran SKUMS to calculate earn policy inputs/results.
- POS renders the returned `fran_skums` projection.
- POS must not calculate final loyalty economics locally when live SKUMS/CRM is
  configured.

## Data Model Areas Needed in Fran CRM

Fran CRM needs storage or projections for:

- CRM workspace boundary for every POS-visible operation.
- Customer/member profile.
- POS-safe counter profile projection.
- Lookup identifiers: QR, barcode, member number, mobile, manual lookup aliases.
- Counter session lifecycle.
- Tier definitions.
- Trailing 12-month spend windows.
- Point ledger.
- Expiring point lots.
- Active perks.
- Reward catalogue.
- Reward eligibility.
- Reward expiry.
- Redemption ledger.
- Reward quote lifecycle.
- Reward commit lifecycle.
- Reward reversal lifecycle.
- POS source-event inbox with idempotency tracking.
- Offline queued earn reconciliation records.
- Audit events for identity, loyalty, reward, and reconciliation decisions.

Recommended provenance fields:

- Source system.
- External ids.
- POS receipt number.
- POS session id.
- POS idempotency key.
- CRM decision reference.
- CRM event id.
- Actor/cashier id when available.
- Register id.
- Store/location id.
- Occurred-at timestamp.

## Fran CRM Build Priorities

1. Implement POS-safe member lookup for QR, barcode, member number, mobile, and
   manual search.
2. Implement counter-session creation for member, new member, non-member, and
   tourist modes.
3. Return safe profile projection with Base/Silver/Gold tier, active perks, point
   balance, expiry alert, reward count, and warnings.
4. Implement basket preview with Fran SKUMS-backed earn projection, tier progress,
   points redemption, filtered reward catalogue, and warnings.
5. Implement reward quote with short expiry and decision reference.
6. Implement reward commit with idempotent points deduction or reward redemption.
7. Implement reward reversal for payment failure after commit and transaction
   void.
8. Implement POS source-event inbox and replay-safe deduplication.
9. Implement queued earn reconciliation for `fran.points_earn.queued`.
10. Add operational audit views for quote/commit/reversal/queued-earn mismatches.

## Acceptance Checklist

- Member lookup returns safe Base/Silver/Gold member projections.
- New member, non-member, and tourist paths can start counter sessions.
- Payment remains disabled until a member or explicit exception is selected.
- Active perks return on lookup and are rendered without POS-side eligibility
  inference.
- Points expiry alert returns when points expire inside the lookahead window.
- Basket preview returns earn, tier progress, points redemption, filtered reward
  catalogue, and warnings.
- Tier progress uses the same trailing 12-month window as live tier logic.
- Points redemption is threshold-gated, partial, and customer-confirmed.
- Catalogue rewards are filtered to currently redeemable rewards.
- Reward selection requires two steps.
- Reward quote does not deduct points.
- Reward commit deducts points only after payment confirmation.
- Payment failure before commit does not call commit.
- Payment failure after commit calls reversal.
- Transaction void after commit calls reversal.
- Receipts separate Fran reward/points redemptions from product discounts.
- CRM outage does not block checkout.
- Offline earn events queue and sync idempotently.
- CRM can replay and deduplicate all Fran POS events.

## Current Verification Coverage

The test suite contains contract-style checks for the current build:

- Fran-specific workflow stays under named Fran surfaces.
- The Fran CRM client exposes the genesis decision methods with mock fallback.
- The sale page requires explicit member or exception before payment.
- Rewards are quoted before payment and committed after payment.
- Pre-completion retagging clears stale rewards.
- The profile card shows lookup projection, active perks, point expiry, earn, and
  tier progress.
- Projected earn preview uses a Fran SKUMS cart projection shape.
- CRM outage queues loyalty earn without blocking checkout.
- Tier preview uses trailing 12-month spend and pre-payment upgrade alerts.
- Points redemption is threshold-gated, partial, and payment-committed.
- Rewards available opens a balance-filtered catalogue.
- Printed and digital receipts list rewards in a dedicated section.
- Committed rewards are automatically reversed on payment failure or void.
- Fran reward lines and events are replay-safe POS facts.

Run locally:

```bash
npm test
npm run build
```

## Open Follow-Ups

- Replace mock CRM responses with live Fran CRM routes when the CRM fork exposes
  the POS endpoints.
- Ensure live Fran CRM enforces workspace boundaries on every endpoint.
- Add CRM-side event inbox migrations and replay tests.
- Confirm whether tourist mode should remain no-loyalty or have a separate CRM
  policy.
- Decide whether `VITE_FRAN_CRM_URL` should be replaced by a backend POS proxy
  before real customer data is used.
- Add manager/audit controls for post-completion customer correction.
- Add reconciliation dashboard views for queued earn, commit failure, reversal
  failure, and duplicated replay attempts.
