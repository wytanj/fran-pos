# Fran POS Genesis

## Source Fork

Start this repo by copying or forking:

```text
C:\Users\Jeremy Tan\CodeProjects\pos
```

Fran POS is the opinionated cashier application for Fran. It should keep the generic POS strengths from upstream, but it is allowed to encode Fran's store workflow, member prompts, reward confirmation flow, and beauty-retail counter experience directly.

## Product Role

Fran POS owns the physical transaction.

It owns:

- cashier screen flow
- basket state
- member lookup placement and enforcement
- non-member or tourist exception path
- payment collection
- discount and reward lines on the sale
- receipt rendering
- refund, exchange, void, and failed-payment handling
- local audit trail and POS outbox

It does not own:

- long-term customer graph
- loyalty policy truth
- points ledger truth, unless a temporary offline/local mode is explicitly enabled
- reward catalogue truth
- product taxonomy truth
- fulfillment approval and 3PL execution

## Integration Shape

Fran POS should render native UI. It should not iframe Fran CRM or any loyalty screen.

Use JSON decision contracts:

```text
POS scans or searches member
-> Fran CRM resolves member and returns counter-safe profile
-> POS renders profile card
-> POS sends basket preview request
-> Fran CRM returns earn, tier, reward, expiry, and warning decisions
-> POS renders prompts and applies selected discount/reward lines
-> payment succeeds or fails
-> POS commits or reverses with idempotent events
```

SKUMS remains the product, stock, and fulfillment source. Fran CRM remains the customer and loyalty decision source.

## Existing Upstream Anchors

Keep and extend these areas from upstream POS:

- `dashboard/src/pos/pages/sale.tsx`
- `dashboard/src/pos/components/customer-modal.tsx`
- `dashboard/src/pos/components/payment-modal.tsx`
- `dashboard/src/pos/components/sale-complete-modal.tsx`
- `dashboard/src/pos/components/receipt-preview.tsx`
- `dashboard/src/pos/lib/customer-profile.ts`
- `dashboard/src/pos/lib/pos-outbox.ts`
- `dashboard/src/pos/lib/return-eligibility.ts`
- `dashboard/src/pos/lib/skums-client.ts`
- `dashboard/src/pos/lib/skums-sale-adapter.ts`
- `dashboard/src/pos/lib/skums-sale-sync.ts`
- `dashboard/src/hooks/use-customers.ts`
- `dashboard/src/hooks/use-skums-connector.ts`
- `packages/shared/src/types/database.ts`
- `supabase/migrations/00007_create_pos_source_outbox.sql`
- `supabase/migrations/00009_create_customer_identity_links.sql`
- `supabase/migrations/00011_create_pos_return_checks.sql`

## Fran-Specific Code Placement

Put Fran-only code in clearly named surfaces:

```text
dashboard/src/pos/fran/
dashboard/src/pos/fran/components/
dashboard/src/pos/fran/lib/
dashboard/src/pos/fran/types.ts
dashboard/src/pos/fran/mock-crm.ts
docs/fran-pos-crm-skums-contract.md
```

Use shared generic POS primitives where possible, but do not hide Fran-specific workflow behind vague generic names.

Good:

```text
fran-member-strip.tsx
fran-counter-profile-card.tsx
fran-reward-redemption-panel.tsx
fran-loyalty-preview.ts
fran-crm-client.ts
```

Avoid:

```text
customer-v2.tsx
loyalty-helper.ts
new-profile-card.tsx
```

## Required First Experience

The first usable Fran POS screen should support:

1. Basket scanning/search from SKUMS or local catalogue.
2. Persistent member strip at the top of the sale screen.
3. Scan QR, barcode, member number, or mobile number.
4. Inline no-match registration.
5. Explicit non-member or tourist path.
6. Compact member card with name, tier, points, birthday, expiry, and rewards available.
7. Basket-aware earn preview.
8. Tier progress and upgrade alert when applicable.
9. Reward or points redemption prompt.
10. Two-step reward confirmation.
11. Reward/points applied as distinct sale lines.
12. Payment success commit.
13. Payment failure or void reversal.
14. Receipt showing reward and point summary.
15. Outbox events for CRM, loyalty, SKUMS, and receipt sync.

## Contract With Fran CRM

Fran POS should call Fran CRM through a POS-side client wrapper:

```text
dashboard/src/pos/fran/lib/fran-crm-client.ts
```

Initial methods:

```text
resolveMember(input)
getCounterSession(input)
previewBasket(input)
quoteRewardRedemption(input)
commitRewardRedemption(input)
reverseRewardRedemption(input)
sendEvent(input)
```

Suggested API contracts:

```text
POST /fran/pos/member/resolve
POST /fran/pos/counter-session
POST /fran/pos/basket/preview
POST /fran/pos/rewards/quote
POST /fran/pos/rewards/commit
POST /fran/pos/rewards/reverse
POST /api/v1/events
```

Fran POS should start with mocked Fran CRM responses so the cashier workflow can be designed before the CRM fork is complete.

## Contract With Fran SKUMS

Fran POS should continue to use SKUMS for:

- product scan resolution
- POS catalogue
- stock availability
- sale sync
- return sync
- inventory events
- fulfillment/store-ops handoff

Do not put product taxonomy or fulfillment policy into Fran POS.

## Event Rules

Every external write must be idempotent.

Keep the existing POS event envelope pattern and add Fran-specific events only when needed:

```text
pos.customer.attached
pos.sale.completed
pos.return.completed
fran.member.resolved
fran.counter_session.previewed
fran.reward.quoted
fran.reward.committed
fran.reward.reversed
fran.reward.commit_failed
```

Payment lifecycle rule:

```text
before payment = quote only
payment confirmed = commit
payment failed = no commit, release reservation if any
void after commit = reverse
```

## Non-Goals

- Do not iframe CRM or loyalty screens.
- Do not make POS calculate loyalty economics beyond rendering a CRM-provided quote.
- Do not store points truth only in POS customer metadata.
- Do not block receipt rendering on CRM or SKUMS sync.
- Do not auto-apply rewards.
- Do not silently redeem without cashier confirmation.
- Do not expose CRM, loyalty, or SKUMS secrets to the browser.

## Build Order

1. Copy upstream POS into this folder and confirm `npm install`, `npm test`, and `npm run build`.
2. Rename package/app labels to Fran POS.
3. Add `docs/fran-pos-crm-skums-contract.md`.
4. Add Fran mock CRM client and static response fixtures.
5. Replace the sale page customer button area with a persistent Fran member strip.
6. Rework the customer modal into scan/search/register/non-member flow.
7. Add Fran counter profile card rendered from mocked `counterSession`.
8. Add basket preview call and display earn/tier progress.
9. Add reward redemption panel with two-step confirmation.
10. Apply reward/points as distinct sale lines.
11. Commit/reverse rewards through mocked CRM client after payment lifecycle events.
12. Extend POS outbox payloads with Fran CRM references.
13. Add settings for Fran CRM endpoint, SKUMS endpoint, and offline behavior.
14. Replace mocked CRM calls with live Fran CRM routes.
15. Add tests for member required flow, non-member path, reward quote/commit/reverse, and outbox event shape.

## Acceptance Checks

- Cashier can complete a member sale without leaving the sale screen.
- Cashier can complete a tourist/non-member sale through an explicit path.
- Reward redemption cannot happen in one tap.
- Points/rewards are committed only after payment confirmation.
- Voids and payment failures do not leak committed rewards.
- Receipt separates product discounts, reward redemption, points earned, and points balance.
- CRM or SKUMS outage shows queued/degraded state without crashing the sale screen.
