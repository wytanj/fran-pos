# Fran POS CRM and SKUMS Contract

## Ownership

Fran POS owns physical checkout: scan/search, basket state, cashier prompts, payment capture, receipt rendering, local audit trail, and replay-safe outbox events.

Fran CRM owns customer identity, counter-safe member profile, loyalty earn decisions, tier progress, reward eligibility, reward quote, reward commit, and reward reversal.

SKUMS owns product identity, POS-enabled catalog, stock availability, sale sync, return sync, inventory events, and fulfillment/store-ops handoff.

## Runtime Shape

The first build uses `dashboard/src/pos/fran/mock-crm.ts` through `dashboard/src/pos/fran/lib/fran-crm-client.ts`. The sale page does not iframe CRM screens and does not calculate loyalty economics beyond rendering CRM decisions.

Live Fran CRM can replace the mock by setting `VITE_FRAN_CRM_URL` or by disabling mock mode in Settings > Integrations > Fran CRM. Browser code must call a POS-safe endpoint or proxy. Do not expose CRM, loyalty, SKUMS, Supabase service-role, or database credentials through `VITE_` variables.

## POS to Fran CRM Methods

Initial POS-side client methods:

- `resolveMember(input)`: scan/search QR, barcode, member number, or mobile.
- `getCounterSession(input)`: starts a member, non-member, or tourist counter session.
- `previewBasket(input)`: returns earn points, projected points balance, tier progress, reward decisions, and warnings.
- `quoteRewardRedemption(input)`: returns a short-lived quote for a selected reward.
- `commitRewardRedemption(input)`: commits the quote after payment confirmation.
- `reverseRewardRedemption(input)`: reverses a committed reward when a void flow is implemented.
- `sendEvent(input)`: sends generic CRM events once the live route exists.

Suggested live endpoints:

- `POST /fran/pos/member/resolve`
- `POST /fran/pos/counter-session`
- `POST /fran/pos/basket/preview`
- `POST /fran/pos/rewards/quote`
- `POST /fran/pos/rewards/commit`
- `POST /fran/pos/rewards/reverse`
- `POST /api/v1/events`

## Payment Lifecycle

Reward lifecycle rules:

- Before payment: quote only.
- Cashier confirmation: applies a distinct negative cart line with Fran quote metadata.
- Payment confirmed: commit the Fran reward quote.
- Payment failed or modal closed: no commit is sent.
- Void after commit: call `reverseRewardRedemption` and emit `fran.reward.reversed` when the void UI is implemented.

Reward and points redemptions are represented as separate cart lines with `lineKind` values:

- `fran_reward`
- `fran_points`

These lines are read-only in the cart and carry `franRewardQuoteId` and `franDecisionRef` metadata.

## Outbox Events

The POS outbox remains the local source-event buffer. Fran-specific events are allowed in the initial schema:

- `fran.member.resolved`
- `fran.counter_session.previewed`
- `fran.reward.quoted`
- `fran.reward.committed`
- `fran.reward.reversed`
- `fran.reward.commit_failed`

Existing generic POS events remain:

- `pos.customer.attached`
- `pos.sale.completed`
- `pos.return.completed`
- `pos.reward.redeem_requested`
- `pos.reward.refund_requested`

Every event must have an idempotency key derived from store, register, receipt, event type, and a stable suffix.

## SKUMS Boundary

Fran POS continues to use SKUMS for product and stock decisions:

- Product scan resolution.
- POS catalog.
- Stock availability.
- Sale sync.
- Return sync.
- Inventory events.

Fran loyalty metadata is sent to SKUMS only as sale metadata. SKUMS should not become the reward or points decision system.

## Current First Build

Implemented surfaces:

- `dashboard/src/pos/fran/types.ts`
- `dashboard/src/pos/fran/mock-crm.ts`
- `dashboard/src/pos/fran/lib/fran-crm-client.ts`
- `dashboard/src/pos/fran/components/fran-member-strip.tsx`
- `dashboard/src/pos/fran/components/fran-customer-modal.tsx`
- `dashboard/src/pos/fran/components/fran-counter-profile-card.tsx`
- `dashboard/src/pos/fran/components/fran-reward-redemption-panel.tsx`

The sale screen now requires a resolved member, explicit non-member sale, or tourist exception before payment can begin.
