# Fran POS Loyalty Policy Execution Plan

Fran POS is the cashier-native executor for Fran loyalty. It should not own policy authoring, member ledger truth, product truth, inventory truth, or canonical pricing. It should load approved CRM policy bundles, execute them against SKUMS basket quotes, and emit idempotent execution events back to CRM and SKUMS.

## Target Boundary

- Fran CRM owns policy version storage, member/account snapshots, loyalty ledger, reward audit, and reconciliation.
- Fran POS owns checkout sequencing, customer/member/tourist mode, local policy execution, payment timing, receipt presentation, and offline queueing.
- Fran SKUMS owns SKU identity, canonical prices, discounts/promotions, availability, reservations, sale inventory commit, and product reward stock.

## Required Build

1. Add a POS loyalty policy client.
   - Load `GET /api/fran/loyalty/policy-versions/active`.
   - Cache the policy bundle by `workspaceId`, `programKey`, `policyVersionId`, and `assignmentId`.
   - Show stale/offline state when the cached policy is past its allowed TTL.

2. Add a local policy evaluator.
   - Evaluate earn, tier progress, redemption eligibility, birthday/category/check-in bonuses, point expiry projection, and reward warnings.
   - Use dynamic tier keys and labels from the loaded policy; remove fixed `Base | Silver | Gold` assumptions.
   - Return an `evaluationTrace` that records rule ids, inputs, rounding, blocked reasons, and the final point/reward decisions.

3. Replace CRM basket preview as the checkout calculator.
   - Current flow calls `franCrm.previewBasket(...)`.
   - New flow should call SKUMS for a basket quote, then run the local evaluator with:
     - CRM policy bundle
     - CRM member/account snapshot
     - SKUMS quote lines
     - SKUMS product context
     - current POS counter session

4. Expand POS basket lines.
   - Include SKUMS product id, variant id, SKU, barcode, quote line id, price revision, category, brand, collection, reward eligibility, sample eligibility, restricted flags, and availability snapshot.
   - Do not rely on local `unitPrice` as final pricing truth when SKUMS is configured.

5. Add SKUMS quote and reservation calls.
   - Use `POST /fran/pos/basket/quote` before showing final earn/reward decisions.
   - Use reservation/create before payment when rewards or stock-sensitive items are involved.
   - Commit reservation and sale after payment succeeds.
   - Release reservation on cancel, failure, or void.

6. Commit loyalty after payment.
   - Send CRM an idempotent loyalty execution event containing:
     - policy version id
     - assignment id
     - member/account id
     - SKUMS quote id
     - SKUMS reservation id
     - POS sale id
     - reward quote/commit references
     - evaluation trace
   - CRM ledger remains economic truth after settlement.

7. Tighten offline behavior.
   - Offline earn can be shown as queued only when backed by a cached SKUMS price book and cached CRM policy bundle.
   - Redemption and product reward stock holds should require live CRM/SKUMS unless an explicit manager-approved offline policy exists.
   - Receipts must label queued/unverified loyalty outcomes clearly.

8. Update tests.
   - Policy evaluator fixtures for Fran v2.1.
   - SKUMS quote happy path, quote stale path, and reservation release path.
   - Dynamic tiers and seasonality policy swap.
   - Offline queued earn and blocked redemption.
   - Idempotent CRM execution event replay.

## First Implementation Slice

1. Add the SKUMS basket quote client method.
2. Add policy bundle loading from CRM.
3. Build a pure evaluator over the quote and policy JSON.
4. Replace `provisionalFranEarnPoints` with evaluator output when both CRM policy and SKUMS quote are present.
5. Keep the old mock path only as demo/offline fallback, never as final truth in live mode.
