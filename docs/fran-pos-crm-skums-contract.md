# Fran POS CRM and SKUMS Contract

## Ownership

Fran POS owns physical checkout: scan/search, basket state, cashier prompts, payment capture, receipt rendering, local audit trail, and replay-safe outbox events.

Fran CRM owns customer identity, counter-safe member profile, loyalty account state, tier progress, reward eligibility, reward quote, reward commit, and reward reversal.

SKUMS owns product identity, POS-enabled catalog, stock availability, cart valuation, projected earn calculation, sale sync, return sync, inventory events, and fulfillment/store-ops handoff.

## Runtime Shape

The first build uses `dashboard/src/pos/fran/mock-crm.ts` through `dashboard/src/pos/fran/lib/fran-crm-client.ts`. The sale page does not iframe CRM screens and does not calculate loyalty economics beyond rendering CRM decisions.

Live Fran CRM can replace the mock by setting `VITE_FRAN_CRM_URL` or by disabling mock mode in Settings > Integrations > Fran CRM. Browser code must call a POS-safe endpoint or proxy. Do not expose CRM, loyalty, SKUMS, Supabase service-role, or database credentials through `VITE_` variables.

## POS to Fran CRM Methods

Initial POS-side client methods:

- `resolveMember(input)`: scan/search QR, barcode, member number, or mobile.
- `getCounterSession(input)`: starts a member, non-member, or tourist counter session.
- `previewBasket(input)`: submits the current POS cart object and returns Fran SKUMS projected earn, projected points balance, tier progress, reward decisions, and warnings.
- `quoteRewardRedemption(input)`: returns a short-lived quote for a selected reward or cashier-entered partial points redemption.
- `commitRewardRedemption(input)`: commits the quote after payment confirmation.
- `reverseRewardRedemption(input)`: reverses a committed reward on transaction void or payment failure after commit.
- `sendEvent(input)`: sends generic CRM events once the live route exists.

Suggested live endpoints:

- `POST /fran/pos/member/resolve`
- `POST /fran/pos/counter-session`
- `POST /fran/pos/basket/preview`
- `POST /fran/pos/rewards/quote`
- `POST /fran/pos/rewards/commit`
- `POST /fran/pos/rewards/reverse`
- `POST /api/v1/events`

## Start-of-Transaction Identity Tagging

Each sale starts unresolved. The cashier must explicitly tag the open basket before payment can begin.

Allowed start states:

- Existing member: cashier scans a QR code, scans a barcode, types a member number, or enters a mobile number. POS calls `resolveMember(input)`, shows exact matches or candidates, then calls `getCounterSession({ mode: 'member', memberId, lookup })`.
- New member sign-up: cashier enters the customer's mobile number and minimum counter-safe details. POS calls `getCounterSession({ mode: 'member', registration, lookup })`; Fran CRM creates or links the starter member profile and returns the session.
- Non-member: cashier chooses the explicit `non_member` exception. POS calls `getCounterSession({ mode: 'non_member' })`; no points or member rewards are offered.
- Tourist: cashier chooses the explicit `tourist` exception. POS calls `getCounterSession({ mode: 'tourist' })`; tourist handling remains visible on the receipt/event payload.

The POS stores only the final counter-safe session on the completed sale. Fran CRM remains the source of truth for identity, member status, tier, rewards, points, expiry, consent, and merge/link decisions.

## Counter Profile Card

On successful member lookup, the sale screen renders a compact counter profile card in a responsive Fran member dialog, opened from the persistent member strip before reward selection and payment.

The card is a POS-safe projection from Fran CRM and should show:

- Customer name.
- Tier badge. Fran CRM currently returns `Base`, `Silver`, or `Gold`.
- Current points balance.
- Projected earn from the current basket.
- Earn policy basis, either pre-discount or post-discount.
- Applied tier, birthday, and campaign multipliers.
- Member since date.
- Birthday.
- Points expiry.
- Expiring points alert when a portion of the balance is at risk inside the CRM lookahead window.
- Rewards available.
- Spend towards next tier.
- Pre-payment tier upgrade alert when the current basket crosses a threshold.
- YTD spend progress using the same trailing 12-month window as the tier calculation.

## Active Perks on Lookup

When Fran CRM resolves a member and opens a counter session, it notifies Fran POS of currently active perks. POS displays those perks immediately after lookup, before basket preview or reward quote.

The counter session response includes `activePerks` rows for:

- Free sample threshold.
- Birthday discount.
- Tier-specific offer.

Fran CRM owns perk eligibility. POS must not infer birthday eligibility, tier offer rules, or sample thresholds locally; POS only displays the CRM-supplied active perks and carries them into `fran.member.resolved` as `active_perks`.

## Points Expiry Alert

Fran CRM calculates whether any portion of a member's points balance expires inside the configured lookahead window. The default lookahead is 30 days unless Fran CRM returns a different policy value for the counter session.

The counter session response includes `pointsExpiryAlert` when points are at risk. The alert includes:

- Amount at risk.
- Expiry date.
- Lookahead window in days.
- Calculation timestamp.

Fran POS displays this alert on the cashier profile card as a warning with the amount at risk and expiry date. POS does not calculate point-lot expiry locally; it only renders the CRM-supplied projection and carries it into `fran.member.resolved` as `points_expiry_alert`.

## Projected Earn Preview

Projected earn is not calculated from local POS display state alone. When the cart changes, Fran POS submits the current cart object to the preview path. The live implementation should route the cart valuation to Fran SKUMS and return a `fran_skums` earn projection.

The cart object includes:

- Product lines with `lineId`, SKU, name, quantity, unit price, line total, and line kind.
- Basket subtotal.
- Discount total.
- Total after discount.
- Currency.
- Cart update timestamp.

The returned earn projection includes:

- Source system: `fran_skums`.
- Earn policy basis: `pre_discount` or `post_discount`.
- Earn base amount.
- Points per currency unit.
- Tier multiplier.
- Birthday multiplier.
- Campaign multiplier.
- Total multiplier.
- Projected earn points.

Fran POS displays the returned projection live as items, discounts, and reward lines change. POS may show loading or unavailable state, but it should not silently calculate final earn truth when Fran SKUMS is configured.

## CRM Unreachable and Offline Loyalty Queue

Loyalty is secondary to completing the transaction. If Fran CRM is unreachable, Fran POS must never block payment or sale completion solely because loyalty services are down.

Rules:

- If a member was already identified, POS continues checkout with a clear `CRM offline - earn queued` indicator.
- If lookup or counter-session creation fails before a member profile is returned, POS allows a local offline member session from the scanned identifier or an explicit non-member/tourist exception.
- POS clears stale CRM preview decisions when preview fails. Reward redemption and catalogue reward actions require a live CRM quote and must not be inferred offline.
- POS may calculate a provisional earn amount for the queued event, but the event must be marked as POS fallback when no Fran CRM preview exists.
- On payment completion, POS emits `fran.points_earn.queued` with the receipt, member identifier, queued points, reason, and `sync_on_reconnect: true`.
- The local POS outbox keeps the event when Supabase or Fran CRM sync is unavailable and retries on browser reconnect, focus, or visibility return.
- The post-transaction screen and receipt preview must show loyalty as queued when earn was not confirmed live.

## Tier Progress Preview

Tier progress is supplied by Fran CRM in the basket preview response. Fran POS does not calculate tier qualification locally.

The tier projection must use the same trailing 12-month spend window as the membership tier logic. When Fran CRM adds the current transaction value to the member's trailing 12-month spend, it returns whether the projected value crosses the next threshold.

The returned tier projection includes:

- Current tier.
- Next tier.
- Measurement window: `trailing_12_months`.
- Window start and end timestamps.
- Current trailing 12-month spend.
- Current transaction value.
- Projected trailing 12-month spend after this basket.
- Spend required for the next tier.
- Gap before this transaction.
- Gap remaining after this transaction.
- Whether the current transaction crosses the next tier threshold.
- Upgrade alert text when the threshold is crossed.

Fran POS displays the upgrade alert before payment and shows the progress bar with current trailing 12-month spend, next-tier required spend, and remaining gap. The progress display updates live as items are added or removed because the preview request is re-run for every basket change.

## Points Redemption Prompt

Points redemption is supplied by Fran CRM in the basket preview response. Fran POS renders the prompt automatically only when the member has at least the CRM minimum redemption threshold.

The returned points redemption offer includes:

- Available points balance.
- Minimum redemption threshold in points.
- Maximum redeemable points, normally the current redeemable balance.
- Points-to-currency conversion rate.
- Available balance dollar equivalent.
- Minimum redemption dollar equivalent.
- Eligibility and reason text.
- Redeemable rewards catalogue filtered from the full CRM catalogue by current points balance.
- Full reward catalogue size for audit/debug comparison.

When eligible, POS displays: `Member has X pts available (worth $Y). Apply redemption?`

Rules:

- POS must not auto-apply points.
- Cashier must actively enter or accept a points value and select redemption.
- Customer confirmation is required before the redemption line is added.
- Partial redemption is supported.
- The entered points value must be a whole number between the minimum threshold and the redeemable balance.
- Dollar equivalent updates live as the cashier types.
- Below-threshold redemption is blocked.
- The selected redemption is recorded as a distinct negative cart line with `lineKind: 'fran_points'`.
- The points redemption line keeps its own label and quote metadata. It must not be combined with promotional discounts or manual discount labels.
- Points are deducted only when payment is confirmed and `commitRewardRedemption(input)` succeeds, not when the cashier selects or quotes redemption.

The post-transaction screen must show the loyalty summary values together:

- Points earned this transaction.
- Points redeemed.
- Updated running balance after redemption and earn.

## Rewards Available Catalogue

When a member has enough points for at least one catalogue reward, Fran POS displays a `Rewards Available` indicator in the Fran member dialog. The cashier can tap the indicator to open a compact catalogue filtered to only rewards the member can redeem immediately from the current points balance.

Fran CRM owns the full reward catalogue and returns the filtered `redeemableRewards` list in the basket preview response. Fran POS must not show ineligible catalogue rewards in this filtered view.

Each filtered catalogue row includes:

- Reward name.
- Expiry label next to the reward name when `expiresAt` is present, formatted like `expires 30 Jun`.
- Points cost.
- Dollar value or product value label.

Expired catalogue rewards must be hidden automatically before the POS renders the catalogue. Fran CRM should exclude expired rewards from `redeemableRewards`; POS treats the returned list as the active, currently redeemable catalogue and does not require admin/manual removal.

The catalogue indicator is informational and does not auto-apply a reward. Any points deduction still follows the quote, customer confirmation, and payment-confirmed commit lifecycle.

Catalogue reward selection is a two-step POS action:

- Step 1: cashier taps the reward the customer verbally chose.
- Step 2: POS shows `Apply [Reward Name] (X pts)?` with `Yes` and `Cancel`.

The confirmation step must show:

- Reward name.
- Points cost.
- Remaining points balance after redemption.

Selecting a catalogue reward must not apply the reward in one tap. POS only requests a CRM quote after the cashier explicitly selects `Yes`.

## Pre-Completion Retagging

Cashier mistakes and customer changes of mind are handled as open-basket retags until payment completion.

Rules:

- Retagging is allowed while the transaction is open, including after products, discounts, or an uncommitted reward quote have been added.
- Retagging starts a new Fran counter session. It does not mutate the old member or merge customers from POS.
- When the tag changes, POS clears the previous basket preview, removes any uncommitted Fran reward or points line, and requests a fresh preview for the new session.
- If the cashier changes from member to non-member or tourist, the sale continues without member earn or redemption decisions.
- If the cashier opened the payment modal but has not completed payment, they close payment, retag, then reopen payment with the refreshed session.
- Payment remains disabled whenever the basket has no member, non-member, or tourist session.

Only the final tag at payment completion should be treated as the sale's committed CRM identity. Earlier lookups and discarded reward quotes are operational attempts, not customer-truth facts.

After payment completion, customer correction is a separate receipt action. It should require manager/audit controls when the receipt is high-value, already credited, or has committed rewards, and should recompute, reverse, or adjust loyalty through idempotent CRM events instead of editing the closed sale in place.

## Payment Lifecycle

Reward lifecycle rules:

- Before payment: quote only.
- Cashier and customer confirmation: applies a distinct negative cart line with Fran quote metadata.
- Payment confirmed: commit the Fran reward quote.
- If reward commit fails because Fran CRM is unreachable, POS still completes the sale, marks the reward commit as failed, and leaves points earn queued for reconnect.
- Payment failed before commit: no commit is sent, the Fran reward line is removed, and the reward remains available.
- Payment failed after commit: POS calls `reverseRewardRedemption` automatically with reason `payment_failed`, restores the member points balance from Fran CRM's response, and shows the reward as available again.
- Transaction void after commit: POS calls `reverseRewardRedemption` automatically with reason `transaction_void`, restores points, marks the applied reward as reversed, and emits `fran.reward.reversed`.
- Points are deducted only when payment is confirmed; reversal is the only path that restores points after a committed redemption.

Reward and points redemptions are represented as separate cart lines with `lineKind` values:

- `fran_reward`
- `fran_points`

These lines are read-only in the cart and carry `franRewardQuoteId` and `franDecisionRef` metadata.

Fran CRM reversal response must include:

- `pointsRestored`
- `pointsBalanceAfter`
- `rewardAvailable`
- `reason`

## Receipt Rewards Section

Printed and digital receipts must render Fran reward redemptions in a dedicated rewards block, separate from promotional discounts and line-level markdowns.

For each redeemed reward, the receipt block must show:

- reward name
- points used
- dollar equivalent when there is a dollar value
- net dollar value applied to the transaction

Digital receipt payloads carry the same rows in `rewards_redeemed`. Product `lines` must exclude Fran reward and Fran points adjustment rows so email/template systems do not merge rewards into promotional discount sections.

## Outbox Events

The POS outbox remains the local source-event buffer. Fran-specific events are allowed in the initial schema:

- `fran.member.resolved`
- `fran.counter_session.previewed`
- `fran.reward.quoted`
- `fran.reward.committed`
- `fran.reward.reversed`
- `fran.reward.commit_failed`
- `fran.points_earn.queued`

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
