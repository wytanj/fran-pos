# Fran CRM Handoff Summary

This handoff summarizes what `fran-crm` must implement to support the current `fran-pos` loyalty checkout flow. The POS should stay cashier-native and consume compact JSON decision packets. Fran CRM owns customer, member, tier, points, rewards, expiry, and reconciliation decisions.

## Ownership Boundary

- Fran POS owns checkout execution: scan/search, basket state, payment, receipts, local source-event outbox, and cashier prompts.
- Fran CRM owns customer identity, member lookup, counter-safe profile projection, active perks, tier progress, point balances, reward eligibility, reward quote/commit/reversal, expiry alerts, and offline reconciliation.
- Fran SKUMS owns product identity, catalog, stock, cart valuation, and earn policy calculation inputs/results. Fran CRM may call Fran SKUMS during preview, but POS must not calculate loyalty truth locally.

## POS-Facing Endpoints

Fran POS expects these live endpoints behind the Fran CRM client:

- `POST /fran/pos/member/resolve`
  - Input: raw QR/barcode/member number/mobile/manual lookup and lookup method.
  - Output: exact or candidate member matches with POS-safe fields only.

- `POST /fran/pos/counter-session`
  - Starts one of: existing member, new member sign-up, non-member, or tourist.
  - Returns the final counter session projection used by the open basket.

- `POST /fran/pos/basket/preview`
  - Input: current POS cart object with line id, SKU, name, quantity, unit price, line total, subtotal, discount total, total, currency, and timestamp.
  - Output: earn projection, projected points balance, tier progress, points redemption offer, redeemable reward catalogue, and warnings.

- `POST /fran/pos/rewards/quote`
  - Quotes a cashier-selected reward or partial points redemption.
  - Must return short-lived quote details, line label, points cost, dollar amount, balance after redemption, and confirmation text.

- `POST /fran/pos/rewards/commit`
  - Called only after payment confirmation.
  - Deducts points or marks reward redeemed using an idempotency key.

- `POST /fran/pos/rewards/reverse`
  - Reverses a committed reward on payment failure after commit or transaction void.
  - Must restore points and return reward availability status.

- `POST /api/v1/events`
  - Accepts replay-safe POS source events from the local POS outbox.

## Counter Session Projection

Fran CRM should return a `FranCounterSession` shape with:

- `sessionId`
- `mode`: `member`, `non_member`, or `tourist`
- `member`: null for non-member/tourist, otherwise a POS-safe member object
- `activePerks`
- `pointsExpiryAlert`
- `startedAt`
- `expiresAt`
- `prompts`
- `warnings`

Member tiers are currently only:

- `Base`
- `Silver`
- `Gold`

The profile card needs:

- Customer name
- Member number
- Phone
- Tier
- Current points balance
- Member since
- Birthday
- Points expiry
- Rewards available count
- Warnings safe for cashier display

## Active Perks

On successful lookup, Fran CRM must notify POS of active perks in the counter session. Current perk kinds:

- `free_sample_threshold`
- `birthday_discount`
- `tier_specific_offer`

Each perk should include:

- Stable id
- Kind
- Title
- Description
- Value label
- Threshold amount if applicable
- Currency
- Tier if tier-specific
- Expiry if time-limited

POS only renders these. CRM owns eligibility and expiry.

## Earn Projection

POS submits the current cart object to the preview endpoint whenever the basket changes. CRM must return the projected earn response, using Fran SKUMS where required for cart valuation and earn-policy calculation.

The returned earn projection should include:

- `sourceSystem: "fran_skums"`
- Earn policy basis: `pre_discount` or `post_discount`
- Base amount
- Subtotal
- Discount total
- Total after discount
- Points per currency unit
- Tier multiplier
- Birthday multiplier
- Campaign multiplier
- Total multiplier
- Projected earn points
- Calculation timestamp

POS may display loading or unavailable states, but it must not silently become the loyalty source of truth.

## Tier Progress

Fran CRM owns tier calculation. The preview response must include tier progress using the same trailing 12-month window as the actual tier logic.

Return:

- Current tier
- Next tier
- Measurement window: `trailing_12_months`
- Window start and end
- Current trailing 12-month spend
- Current transaction value
- Projected trailing 12-month spend
- Next tier threshold
- Spend required for next tier
- Gap before transaction
- Gap remaining after transaction
- Whether the current basket crosses a threshold
- Upgrade alert text when applicable
- Progress percent

POS renders the pre-payment upgrade banner and progress bar from this payload.

## Points Expiry Alert

Fran CRM must calculate whether any portion of the member balance expires inside a configurable lookahead window. Default lookahead is 30 days.

If points are at risk, return:

- Amount at risk
- Expiry date
- Lookahead days
- Calculation timestamp

POS displays this as a warning on the cashier profile card. POS does not inspect point lots locally.

## Points Redemption

Fran CRM must return a `pointsRedemption` offer only when appropriate:

- Available points
- Minimum redemption threshold
- Maximum redeemable points
- Points-to-currency rate
- Available dollar equivalent
- Minimum dollar equivalent
- Currency
- Eligibility
- Reason if ineligible

Rules:

- POS must never auto-apply points.
- Cashier enters or accepts a partial points value.
- Customer confirmation is required.
- Points are deducted only on payment-confirmed commit.
- Redemption is recorded as a distinct line-item discount, separate from promotional discounts.

## Reward Catalogue

Preview must return `redeemableRewards`, filtered to rewards the member can redeem right now.

Each reward needs:

- Reward id
- Name
- Description
- Value type: dollar or product
- Points cost
- Value
- Value label
- Expiry date if applicable
- Currency
- Eligibility
- Reason if ineligible

Expired rewards should be hidden by CRM before returning the catalogue. Time-limited rewards should include expiry so POS can show labels like `expires 30 Jun`.

Selection is two-step:

1. Cashier selects the customer-chosen reward.
2. POS confirms `Apply [Reward Name] (X pts)?`

CRM should only quote after explicit confirmation.

## Reward Commit and Reversal

Quote, commit, and reverse must be idempotent.

Commit:

- Runs only after payment confirmation.
- Deducts points or marks the reward redeemed.
- Returns commit id, event id, status, and points balance after.

Reverse:

- Runs automatically if payment fails after commit or a completed transaction is voided.
- Restores points.
- Reverts reward availability.
- Returns reverse id, commit id, event id, reason, points restored, points balance after, and reward availability.

## Offline and Reconnect Behavior

Fran CRM being unreachable must never block the POS sale.

Expected CRM-side support:

- Accept queued POS source events after reconnect.
- Reconcile offline member identifiers such as member number or mobile.
- Accept `fran.points_earn.queued` and credit earn idempotently.
- Treat POS-provisional earn as fallback input when no CRM/SKUMS preview exists.
- Recompute or validate final earn server-side before crediting if policy requires.
- Preserve receipt number, session id, member identifier, queued points, reason, and idempotency key.

POS emits the queued earn event with:

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

## POS Source Events to Consume

Fran CRM should accept and deduplicate these events:

- `fran.member.resolved`
- `fran.counter_session.previewed`
- `fran.reward.quoted`
- `fran.reward.committed`
- `fran.reward.reversed`
- `fran.reward.commit_failed`
- `fran.points_earn.queued`

Generic POS events may also accompany the sale:

- `pos.customer.attached`
- `pos.sale.completed`
- `pos.return.completed`
- `pos.reward.redeem_requested`
- `pos.reward.refund_requested`

All events include POS-generated idempotency keys. CRM should never double-credit points, double-deduct points, or double-restore rewards when events are replayed.

## Data Model Areas Needed in Fran CRM

Fran CRM needs storage or projections for:

- Member profile and POS-safe counter profile.
- Lookup identifiers: QR, barcode, member number, mobile.
- Tier definitions and trailing 12-month spend windows.
- Point ledger and expiring point lots.
- Active perks.
- Reward catalogue, reward eligibility, reward expiry, and redemption ledger.
- Reward quote lifecycle.
- Reward commit lifecycle.
- Reward reversal lifecycle.
- POS source-event inbox with idempotency tracking.
- Offline queued earn reconciliation records.

## Acceptance Checklist

- Member lookup returns Base/Silver/Gold tier members and safe counter profile fields.
- Counter session supports member, sign-up, non-member, and tourist modes.
- Active perks return on lookup.
- Points expiry alert is returned when points expire inside the lookahead window.
- Basket preview returns earn, tier progress, points redemption, and filtered reward catalogue.
- Reward redemption supports partial points values and two-step confirmation.
- Reward commit deducts points only after payment confirmation.
- Reward reversal restores points on payment failure after commit or void.
- Receipts can show rewards and points summary from the final event payloads.
- CRM outage does not block POS checkout.
- Queued earn events sync on reconnect and are idempotent.
