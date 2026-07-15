import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const salePage = readFileSync(new URL('../dashboard/src/pos/pages/sale.tsx', import.meta.url), 'utf8')
const posContext = readFileSync(new URL('../dashboard/src/pos/lib/pos-context.tsx', import.meta.url), 'utf8')
const outbox = readFileSync(new URL('../dashboard/src/pos/lib/pos-outbox.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/00007_create_pos_source_outbox.sql', import.meta.url), 'utf8')
const franClient = readFileSync(new URL('../dashboard/src/pos/fran/lib/fran-crm-client.ts', import.meta.url), 'utf8')
const franEvaluator = readFileSync(
  new URL('../dashboard/src/pos/fran/lib/fran-policy-evaluator.ts', import.meta.url),
  'utf8',
)
const franMock = readFileSync(new URL('../dashboard/src/pos/fran/mock-crm.ts', import.meta.url), 'utf8')
const franTypes = readFileSync(new URL('../dashboard/src/pos/fran/types.ts', import.meta.url), 'utf8')
const franProfileCard = readFileSync(
  new URL('../dashboard/src/pos/fran/components/fran-counter-profile-card.tsx', import.meta.url),
  'utf8',
)
const franMemberStrip = readFileSync(
  new URL('../dashboard/src/pos/fran/components/fran-member-strip.tsx', import.meta.url),
  'utf8',
)
const franCustomerModal = readFileSync(
  new URL('../dashboard/src/pos/fran/components/fran-customer-modal.tsx', import.meta.url),
  'utf8',
)
const franRewardPanel = readFileSync(
  new URL('../dashboard/src/pos/fran/components/fran-reward-redemption-panel.tsx', import.meta.url),
  'utf8',
)
const saleCompleteModal = readFileSync(
  new URL('../dashboard/src/pos/components/sale-complete-modal.tsx', import.meta.url),
  'utf8',
)
const paymentModal = readFileSync(
  new URL('../dashboard/src/pos/components/payment-modal.tsx', import.meta.url),
  'utf8',
)
const receiptPreview = readFileSync(
  new URL('../dashboard/src/pos/components/receipt-preview.tsx', import.meta.url),
  'utf8',
)
const rewardReceipt = readFileSync(
  new URL('../dashboard/src/pos/lib/reward-receipt.ts', import.meta.url),
  'utf8',
)
const customerEmailConnector = readFileSync(
  new URL('../dashboard/src/pos/lib/customer-email-connector.ts', import.meta.url),
  'utf8',
)
const franContract = readFileSync(new URL('../docs/fran-pos-crm-skums-contract.md', import.meta.url), 'utf8')
const sharedTypes = readFileSync(new URL('../packages/shared/src/types/database.ts', import.meta.url), 'utf8')
const loyaltyExecutionMigration = readFileSync(
  new URL('../supabase/migrations/00013_allow_fran_loyalty_execution_outbox_event.sql', import.meta.url),
  'utf8',
)

test('Fran POS keeps Fran-specific workflow in named Fran surfaces', () => {
  for (const fragment of [
    'dashboard/src/pos/fran/types.ts',
    'dashboard/src/pos/fran/mock-crm.ts',
    'dashboard/src/pos/fran/lib/fran-crm-client.ts',
    'fran-policy-evaluator.ts',
    'fran-member-strip.tsx',
    'fran-customer-modal.tsx',
    'fran-counter-profile-card.tsx',
    'fran-reward-redemption-panel.tsx',
  ]) {
    assert.match(franContract, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
})

test('Fran CRM client exposes the genesis decision methods with mock fallback', () => {
  for (const method of [
    'resolveMember',
    'getCounterSession',
    'getActivePolicy',
    'previewBasket',
    'quoteRewardRedemption',
    'commitRewardRedemption',
    'reverseRewardRedemption',
    'sendEvent',
  ]) {
    assert.match(franClient, new RegExp(`${method}\\(`))
  }

  assert.match(franClient, /VITE_FRAN_CRM_URL/)
  assert.match(franClient, /\/api\/fran\/loyalty\/policy-versions\/active/)
  assert.match(franClient, /fran_loyalty_policy_cache:v1/)
  assert.match(franClient, /AbortController/)
  assert.match(franClient, /Fran CRM unreachable\. Continue checkout offline\./)
  assert.match(franClient, /mockResolveMember/)
  assert.match(franMock, /FRAN_MOCK_MEMBERS/)
  assert.match(franMock, /mockPreviewBasket/)
})

test('Fran sale page requires explicit member or exception and commits rewards after payment', () => {
  assert.match(salePage, /<FranMemberStrip/)
  assert.match(salePage, /<FranCustomerModal/)
  assert.match(salePage, /const \[franMemberDialogOpen, setFranMemberDialogOpen\]/)
  assert.match(salePage, /<Dialog open=\{franMemberDialogOpen\}/)
  assert.match(salePage, /Fran member & rewards/)
  assert.match(salePage, /max-h-\[92dvh\] w-\[calc\(100vw-1rem\)\]/)
  assert.match(salePage, /<FranRewardRedemptionPanel/)
  assert.match(salePage, /disabled=\{cart\.length === 0 \|\| totals\.total <= 0 \|\| !franSession\}/)
  assert.match(salePage, /quoteFranReward/)
  assert.match(salePage, /confirmFranRewardQuote/)
  assert.match(salePage, /addAdjustmentLine/)
  assert.match(salePage, /commitRewardRedemption/)
  assert.match(salePage, /onComplete=\{\(\) => \{ void completePaidSale\(\) \}\}/)
  assert.match(salePage, /const startNewSale = \(\) => \{/)
  assert.match(salePage, /onNewSale=\{startNewSale\}/)
  assert.match(salePage, /clearFranSession\(\)/)
  assert.match(salePage, /createFranCrmClient\(mode === 'demo' \? \{ mode: 'mock' \} : undefined\)/)
  assert.match(salePage, /mockPreviewBasket/)
  assert.match(salePage, /previewLoading=\{franPreviewLoading\}/)
  assert.match(salePage, /hasSaleItems=\{franBasketLines\.length > 0\}/)
  assert.match(franRewardPanel, /Loading earn and rewards preview/)
  assert.match(franRewardPanel, /Member resolved\. Add products to the cart to preview earn and rewards\./)
  assert.match(posContext, /saleSnapshotRef/)
  assert.match(posContext, /snapshot\.cart\.map/)
})

test('Fran identity tagging supports pre-completion retagging without stale rewards', () => {
  assert.match(franContract, /## Start-of-Transaction Identity Tagging/)
  assert.match(franContract, /Existing member/)
  assert.match(franContract, /New member sign-up/)
  assert.match(franContract, /Non-member/)
  assert.match(franContract, /Tourist/)
  assert.match(franContract, /## Pre-Completion Retagging/)
  assert.match(franContract, /Only the final tag at payment completion/)
  assert.match(franContract, /After payment completion, customer correction is a separate receipt action/)
  assert.match(salePage, /const clearFranSession = \(\) => \{[\s\S]*clearFranReward\(\)[\s\S]*setFranSession\(null\)[\s\S]*setCustomer\(null\)[\s\S]*\}/)
  assert.match(salePage, /onResolved=\{\(session, nextCustomer\) => \{[\s\S]*clearFranReward\(\)[\s\S]*setFranSession\(session\)[\s\S]*setCustomer\(nextCustomer\)[\s\S]*\}\}/)
})

test('Fran counter profile card shows the successful lookup projection', () => {
  assert.match(franContract, /## Counter Profile Card/)
  assert.match(franContract, /responsive Fran member dialog/)
  assert.match(franMemberStrip, /onOpenDetails/)
  assert.match(franMemberStrip, /Details/)
  assert.match(franContract, /## Active Perks on Lookup/)
  assert.match(franContract, /Free sample threshold/)
  assert.match(franContract, /Birthday discount/)
  assert.match(franContract, /Tier-specific offer/)
  assert.match(franContract, /active_perks/)
  assert.match(franContract, /## Points Expiry Alert/)
  assert.match(franContract, /default lookahead is 30 days/)
  assert.match(franContract, /pointsExpiryAlert/)
  assert.match(franContract, /points_expiry_alert/)
  assert.match(franTypes, /export type FranMembershipTier = string/)
  assert.match(franTypes, /export interface FranLoyaltyPolicyBundle/)
  assert.match(franTypes, /export interface FranEvaluationTrace/)
  assert.match(franTypes, /export type FranPolicyCacheStatus = 'fresh' \| 'stale' \| 'offline_fallback'/)
  assert.match(franTypes, /export type FranActivePerkKind = 'free_sample_threshold' \| 'birthday_discount' \| 'tier_specific_offer'/)
  assert.match(franTypes, /export interface FranActivePerk/)
  assert.match(franTypes, /activePerks: FranActivePerk\[\]/)
  assert.match(franTypes, /export interface FranPointsExpiryAlert/)
  assert.match(franTypes, /amountAtRisk: number/)
  assert.match(franTypes, /lookaheadDays: number/)
  assert.match(franTypes, /pointsExpiryAlert: FranPointsExpiryAlert \| null/)
  assert.match(franTypes, /memberSince: string \| null/)
  assert.match(franTypes, /pointsExpireAt: string \| null/)
  assert.match(franMock, /tier: 'Base'/)
  assert.match(franMock, /tier: 'Silver'/)
  assert.match(franMock, /tier: 'Gold'/)
  assert.match(franMock, /const pointsExpiryPolicy = \{[\s\S]*lookaheadDays: 30/)
  assert.match(franMock, /expiringPointLotsByMemberId/)
  assert.match(franMock, /function pointsExpiryAlertFor/)
  assert.match(franMock, /pointsExpiryAlert: pointsExpiryAlertFor\(member\)/)
  assert.match(franMock, /function activePerksFor/)
  assert.match(franMock, /kind: 'free_sample_threshold'/)
  assert.match(franMock, /kind: 'birthday_discount'/)
  assert.match(franMock, /kind: 'tier_specific_offer'/)
  assert.match(franMock, /activePerks: activePerksFor\(member\)/)
  assert.doesNotMatch(franMock, /tier: 'Glow'/)
  assert.doesNotMatch(franMock, /tier: 'Icon'/)

  for (const label of [
    'Can spend',
    'Earn after basket',
    'Post-discount earn',
    'Use now',
    'Member since',
    'Birthday',
    'Expiry',
    'Expiring soon',
    'Tier gap',
    'Tier upgrade available',
    'Tier spend progress',
    'Current T12 spend',
    'Gap after basket',
    'Trailing 12-month window',
    'Use now: active perks',
  ]) {
    assert.match(franProfileCard, new RegExp(label))
  }

  assert.match(franMemberStrip, /Active perks/)
  assert.match(franMemberStrip, /activePerks\.slice\(0, 3\)\.map/)
  assert.match(franMemberStrip, /Can spend \{member\.pointsBalance\.toLocaleString\(\)\} pts/)
  assert.match(franCustomerModal, /Can spend \{member\.pointsBalance\.toLocaleString\(\)\} pts/)
  assert.match(franCustomerModal, /Expires \{formatLookupDate\(member\.pointsExpireAt\)\}/)
  assert.match(franProfileCard, /border-emerald-200 bg-emerald-50/)
  assert.match(franProfileCard, /border-teal-200 bg-teal-50/)
  assert.match(franProfileCard, /border-amber-200 bg-amber-50/)
  assert.match(franProfileCard, /border-blue-200 bg-blue-50/)
  assert.match(franProfileCard, /member\.name/)
  assert.match(franProfileCard, /member\.tier/)
  assert.match(franProfileCard, /tierLabel\(member\.tier, member\.tierLabel\)/)
  assert.match(franProfileCard, /member\.pointsBalance/)
  assert.match(franProfileCard, /member\.memberSince/)
  assert.match(franProfileCard, /member\.pointsExpireAt/)
  assert.match(franProfileCard, /member\.rewardCount/)
  assert.match(franProfileCard, /pointsExpiryAlert\.amountAtRisk/)
  assert.match(franProfileCard, /pointsExpiryAlert\.lookaheadDays/)
  assert.match(franProfileCard, /activePerks\.map/)
  assert.match(franProfileCard, /perk\.valueLabel/)
  assert.match(franProfileCard, /perk\.thresholdAmount/)
  assert.match(franProfileCard, /earnProjection\.projectedEarnPoints/)
  assert.match(franProfileCard, /earnProjection\.multipliers\.map/)
  assert.match(franProfileCard, /nextTierSpendLabel/)
  assert.match(outbox, /active_perks: session\.activePerks \?\? \[\]/)
  assert.match(outbox, /points_expiry_alert: session\.pointsExpiryAlert \?\? null/)
})

test('Fran projected earn preview comes from a Fran SKUMS cart projection', () => {
  assert.match(franContract, /## Projected Earn Preview/)
  assert.match(franContract, /loads the active CRM policy bundle/)
  assert.match(franContract, /`POST \/fran\/pos\/basket\/quote`/)
  assert.match(franContract, /Source system: `fran_skums`/)
  assert.match(franTypes, /export type FranEarnPolicyBasis = 'pre_discount' \| 'post_discount'/)
  assert.match(franTypes, /export type FranEarnMultiplierKind = 'tier' \| 'birthday' \| 'campaign'/)
  assert.match(franTypes, /export interface FranSkumsCartInput/)
  assert.match(franTypes, /skumsProductId\?: string \| null/)
  assert.match(franTypes, /quoteLineId\?: string \| null/)
  assert.match(franTypes, /restrictedFlags\?: string\[\]/)
  assert.match(franTypes, /availability\?: SkumsPosAvailabilitySnapshot \| null/)
  assert.match(franTypes, /sourceSystem: 'fran_skums'/)
  assert.match(franTypes, /earnProjection: FranEarnProjection/)
  assert.match(salePage, /quoteSkumsPosBasket\(quoteInput, skumsConnector\)/)
  assert.match(salePage, /evaluateFranPolicy\(\{[\s\S]*policyBundle[\s\S]*quote: quoteResponse\.data[\s\S]*session: activeFranSession/)
  assert.match(franEvaluator, /export function evaluateFranPolicy/)
  assert.match(franEvaluator, /evaluationTrace/)
  assert.match(franEvaluator, /policy\.bonuses\.categoryMultipliers/)
  assert.match(franEvaluator, /policy\.bonuses\.checkInPoints/)
  assert.match(franEvaluator, /policy\.cache\.status === 'stale'/)
  assert.match(franMock, /function buildEarnProjection/)
  assert.match(franMock, /mockGetActivePolicy/)
  assert.match(franMock, /sourceSystem: 'fran_skums'/)
  assert.match(franMock, /basis: 'post_discount'/)
  assert.match(franMock, /kind: 'tier'/)
  assert.match(franMock, /kind: 'birthday'/)
  assert.match(franMock, /kind: 'campaign'/)
  assert.match(franMock, /projectedEarnPoints/)
  assert.match(franMemberStrip, /Loading earn from Fran CRM/)
  assert.match(franMemberStrip, /Customer will earn \{earnPoints\.toLocaleString\(\)\} points on this order\./)
  assert.match(franMemberStrip, /Loaded from Fran CRM\./)
  assert.match(outbox, /earn_projection: fran\.basketPreview\.earnProjection/)
})

test('Fran CRM outage queues loyalty earn without blocking checkout', () => {
  assert.match(franContract, /## CRM Unreachable and Offline Loyalty Queue/)
  assert.match(franContract, /must never block payment or sale completion/)
  assert.match(franContract, /CRM offline - earn queued/)
  assert.match(franContract, /fran\.points_earn\.queued/)
  assert.match(franTypes, /export type FranLoyaltySyncStatus = 'online' \| 'queued' \| 'unavailable'/)
  assert.match(franTypes, /export interface FranLoyaltySyncState/)
  assert.match(franTypes, /pointsEarnQueued: number/)
  assert.match(franTypes, /syncOnReconnect: boolean/)
  assert.match(franTypes, /loyaltySync: FranLoyaltySyncState \| null/)
  assert.match(sharedTypes, /'fran\.points_earn\.queued'/)
  assert.match(franCustomerModal, /function offlineMemberSession/)
  assert.match(franCustomerModal, /function offlineExceptionSession/)
  assert.match(franCustomerModal, /Continue offline with identifier/)
  assert.match(franCustomerModal, /Loyalty earn will queue locally and sync on reconnect/)
  assert.match(salePage, /const \[franLoyaltySync, setFranLoyaltySync\]/)
  assert.match(salePage, /Fran CRM offline\. Sale can continue; points earn will queue on payment\./)
  assert.match(salePage, /finalFranLoyaltySync/)
  assert.match(salePage, /pointsEarnQueued: pointsEarned/)
  assert.match(salePage, /retryPendingPosOutboxEvents/)
  assert.match(salePage, /window\.addEventListener\('online', retryOnReconnect\)/)
  assert.match(salePage, /pendingSourceEvents/)
  assert.match(franMemberStrip, /CRM offline - earn queued/)
  assert.match(franMemberStrip, /Customer earn will queue for \{loyaltySync\.pointsEarnQueued\.toLocaleString\(\)\} points when payment completes\./)
  assert.match(saleCompleteModal, /FranLoyaltySyncStatus/)
  assert.match(saleCompleteModal, /Sale is complete\. Loyalty will sync on reconnect and must not block checkout\./)
  assert.match(saleCompleteModal, /onRetrySourceEvents/)
  assert.match(receiptPreview, /Loyalty sync/)
  assert.match(receiptPreview, /Queued/)
  assert.match(outbox, /'fran\.points_earn\.queued'/)
  assert.match(outbox, /sync_on_reconnect: loyaltySync\.syncOnReconnect/)
  assert.match(outbox, /source: fran\.basketPreview \? 'fran_crm_preview' : 'pos_fallback'/)
})

test('Fran CRM tier preview uses trailing 12-month spend and pre-payment upgrade alerts', () => {
  assert.match(franContract, /## Tier Progress Preview/)
  assert.match(franContract, /trailing 12-month spend window/)
  assert.match(franContract, /displays the upgrade alert before payment/)
  assert.match(franTypes, /measurementWindow: 'trailing_12_months'/)
  assert.match(franTypes, /currentWindowSpend: number/)
  assert.match(franTypes, /transactionValue: number/)
  assert.match(franTypes, /projectedWindowSpend: number/)
  assert.match(franTypes, /spendRequiredForNextTier: number \| null/)
  assert.match(franTypes, /gapBeforeTransaction: number/)
  assert.match(franTypes, /gapRemaining: number/)
  assert.match(franTypes, /crossesTierThreshold: boolean/)
  assert.match(franTypes, /currentTierLabel: string/)
  assert.match(franTypes, /nextTierLabel: string \| null/)
  assert.match(franMock, /rollingSpendByMemberId/)
  assert.match(franMock, /function trailingWindowDates/)
  assert.match(franMock, /function currentWindowSpendFor/)
  assert.match(franMock, /crossesTierThreshold = currentWindowSpend < next\.annualSpend && projectedWindowSpend >= next\.annualSpend/)
  assert.match(franMock, /This transaction brings \$\{member\.name\} to \$\{next\.tier\}/)
  assert.match(franProfileCard, /Tier upgrade available/)
  assert.match(franProfileCard, /Tier spend progress/)
  assert.match(franProfileCard, /Current T12 spend/)
  assert.match(franProfileCard, /Gap after basket/)
  assert.match(franProfileCard, /Trailing 12-month window/)
  assert.match(outbox, /tier_progress: fran\.basketPreview\.tierProgress/)
})

test('Fran points redemption is threshold-gated, partial, and payment-committed', () => {
  assert.match(franContract, /## Points Redemption Prompt/)
  assert.match(franContract, /Member has X pts available \(worth \$Y\)\. Apply redemption\?/)
  assert.match(franContract, /Partial redemption is supported/)
  assert.match(franContract, /Points are deducted only when payment is confirmed/)
  assert.match(franTypes, /export interface FranPointsRedemptionOffer/)
  assert.match(franTypes, /pointsRedemption: FranPointsRedemptionOffer \| null/)
  assert.match(franTypes, /pointsToRedeem\?: number \| null/)
  assert.match(franTypes, /redemptionKind: FranRewardDecision\['kind'\]/)
  assert.match(franMock, /const pointsRedemptionPolicy/)
  assert.match(franMock, /minimumPoints: 500/)
  assert.match(franMock, /pointsToCurrencyRate: 0\.01/)
  assert.match(franMock, /function buildPointsRedemptionOffer/)
  assert.match(franMock, /input\.preview\.pointsRedemption/)
  assert.match(franMock, /pointsToRedeem < offer\.minimumPoints/)
  assert.match(franMock, /pointsToRedeem > offer\.maximumPoints/)
  assert.match(franMock, /pointsBalanceAfterRedemption/)
  assert.match(franRewardPanel, /Member has .*pts available \(worth/)
  assert.match(franRewardPanel, /Can spend/)
  assert.match(franRewardPanel, /Rewards Available: use now/)
  assert.match(franRewardPanel, /Reward to use/)
  assert.match(franRewardPanel, /Apply redemption\?/)
  assert.match(franRewardPanel, /Dollar equivalent/)
  assert.match(franRewardPanel, /Minimum threshold/)
  assert.match(franRewardPanel, /Customer confirmation required/)
  assert.match(franRewardPanel, /Customer confirmed/)
  assert.match(franRewardPanel, /onQuote\(pointsReward, pointsDraft\.parsed\)/)
  assert.match(salePage, /pointsToRedeem/)
  assert.match(salePage, /lineKind: franQuote\.pointsCost > 0 \? 'fran_points' : 'fran_reward'/)
  assert.match(salePage, /Deduct on payment confirmation/)
  assert.match(salePage, /commitRewardRedemption/)
  assert.match(saleCompleteModal, /Fran points summary/)
  assert.match(saleCompleteModal, /Points earned/)
  assert.match(saleCompleteModal, /Points redeemed/)
  assert.match(saleCompleteModal, /Updated running balance/)
  assert.match(receiptPreview, /REWARDS REDEEMED/)
  assert.match(receiptPreview, /Points used/)
  assert.match(receiptPreview, /Dollar equivalent/)
  assert.match(outbox, /points_redemption_offer: fran\.basketPreview\.pointsRedemption/)
  assert.match(outbox, /points_redeemed/)
  assert.match(outbox, /points_balance_after/)
})

test('Fran rewards available indicator opens a balance-filtered catalogue', () => {
  assert.match(franContract, /## Rewards Available Catalogue/)
  assert.match(franContract, /Rewards Available/)
  assert.match(franContract, /filtered to only rewards the member can redeem immediately/)
  assert.match(franContract, /expires 30 Jun/)
  assert.match(franContract, /Expired catalogue rewards must be hidden automatically/)
  assert.match(franContract, /Apply \[Reward Name\] \(X pts\)\?/)
  assert.match(franContract, /Selecting a catalogue reward must not apply the reward in one tap/)
  assert.match(franTypes, /export interface FranRewardCatalogueItem/)
  assert.match(franTypes, /expiresAt: string \| null/)
  assert.match(franTypes, /'catalogue_reward'/)
  assert.match(franTypes, /redeemableRewards: FranRewardCatalogueItem\[\]/)
  assert.match(franTypes, /rewardCatalogueSize: number/)
  assert.match(franMock, /const rewardCatalogue/)
  assert.match(franMock, /Free Cleanser Sample/)
  assert.match(franMock, /Expired Mini Mask Reward/)
  assert.match(franMock, /function isRewardExpired/)
  assert.match(franMock, /function activeRewardCatalogue/)
  assert.match(franMock, /activeRewardCatalogue\(\)/)
  assert.match(franMock, /function redeemableRewardsFor/)
  assert.match(franMock, /member\.pointsBalance >= reward\.pointsCost/)
  assert.match(franMock, /\.filter\(\(reward\) => reward\.eligible\)/)
  assert.match(franMock, /input\.preview\.redeemableRewards\.find/)
  assert.match(franMock, /redemptionKind: 'catalogue_reward'/)
  assert.match(franMock, /pointsBalanceAfterRedemption: Math\.max\(0, member\.pointsBalance - catalogueReward\.pointsCost\)/)
  assert.match(franRewardPanel, /Rewards Available/)
  assert.match(franRewardPanel, /catalogueOpen/)
  assert.match(franRewardPanel, /selectedCatalogueReward/)
  assert.match(franRewardPanel, /rewardDecisionFromCatalogueItem/)
  assert.match(franRewardPanel, /function formatRewardExpiry/)
  assert.match(franRewardPanel, /expires \$\{new Intl\.DateTimeFormat/)
  assert.match(franRewardPanel, /expiresAt: reward\.expiresAt/)
  assert.match(franRewardPanel, /Apply \{selectedCatalogueReward\.name\} \(\{selectedCatalogueReward\.pointsCost\.toLocaleString\(\)\} pts\)\?/)
  assert.match(franRewardPanel, /Remaining balance/)
  assert.match(franRewardPanel, /Yes/)
  assert.match(franRewardPanel, /setSelectedCatalogueReward\(reward\)/)
  assert.match(franRewardPanel, /redeemableRewards\.map/)
  assert.match(franRewardPanel, /reward\.name/)
  assert.match(franRewardPanel, /formatRewardExpiry\(reward\.expiresAt\)/)
  assert.match(franRewardPanel, /reward\.pointsCost\.toLocaleString\(\)/)
  assert.match(franRewardPanel, /reward\.valueLabel/)
  assert.match(franProfileCard, /preview\?\.redeemableRewards\.length/)
  assert.match(outbox, /redeemable_rewards: fran\.basketPreview\.redeemableRewards/)
  assert.match(outbox, /reward_catalogue_size: fran\.basketPreview\.rewardCatalogueSize/)
})

test('Fran printed and digital receipts list rewards in a dedicated section', () => {
  assert.match(franContract, /## Receipt Rewards Section/)
  assert.match(franContract, /dedicated rewards block/)
  assert.match(franContract, /separate from promotional discounts/)
  assert.match(franContract, /`rewards_redeemed`/)
  assert.match(rewardReceipt, /export function buildReceiptRewardRedemptions/)
  assert.match(rewardReceipt, /isFranRewardReceiptLine/)
  assert.match(rewardReceipt, /rewardName/)
  assert.match(rewardReceipt, /pointsUsed/)
  assert.match(rewardReceipt, /dollarEquivalent/)
  assert.match(rewardReceipt, /netDollarValueApplied/)
  assert.match(receiptPreview, /buildReceiptRewardRedemptions\(sale\)/)
  assert.match(receiptPreview, /REWARDS REDEEMED/)
  assert.match(receiptPreview, /reward\.rewardName/)
  assert.match(receiptPreview, /Points used/)
  assert.match(receiptPreview, /Dollar equivalent/)
  assert.match(receiptPreview, /reward\.netDollarValueApplied/)
  assert.match(receiptPreview, /sale\.lines\.filter\(\(line\) => !isFranRewardReceiptLine\(line\)\)/)
  assert.match(customerEmailConnector, /buildReceiptRewardRedemptions\(sale\)/)
  assert.match(customerEmailConnector, /rewards_redeemed: rewardsRedeemed\.map/)
  assert.match(customerEmailConnector, /Rewards redeemed/)
  assert.match(customerEmailConnector, /Points used/)
  assert.match(customerEmailConnector, /Dollar equivalent/)
  assert.match(customerEmailConnector, /Net value applied/)
})

test('Fran committed rewards are automatically reversed on payment failure or void', () => {
  assert.match(franContract, /Payment failed after commit/)
  assert.match(franContract, /reason `payment_failed`/)
  assert.match(franContract, /reason `transaction_void`/)
  assert.match(franContract, /pointsRestored/)
  assert.match(franContract, /rewardAvailable/)
  assert.match(franTypes, /quote: FranRewardQuote/)
  assert.match(franTypes, /pointsRestored: number/)
  assert.match(franTypes, /pointsBalanceAfter: number \| null/)
  assert.match(franTypes, /rewardAvailable: boolean/)
  assert.match(franTypes, /'reverse_failed'/)
  assert.match(franMock, /mockReverseRewardRedemption/)
  assert.match(franMock, /pointsRestored: input\.quote\.pointsCost/)
  assert.match(franMock, /pointsBalanceAfter: member \? member\.pointsBalance : null/)
  assert.match(franMock, /rewardAvailable: true/)
  assert.match(paymentModal, /onPaymentFailed\?: \(reason: string\) => void/)
  assert.match(paymentModal, /Mark payment failed/)
  assert.match(salePage, /reverseCommittedFranReward/)
  assert.match(salePage, /reverseRewardRedemption/)
  assert.match(salePage, /reverseCommittedFranReward\(franAppliedReward, receiptNo, 'payment_failed'\)/)
  assert.match(salePage, /reverseCommittedFranReward\(reward, sale\.receiptNo, 'transaction_void'\)/)
  assert.match(salePage, /handlePaymentFailure/)
  assert.match(salePage, /handleVoidCompletedSale/)
  assert.match(salePage, /onPaymentFailed=\{\(reason\) => \{ void handlePaymentFailure\(reason\) \}\}/)
  assert.match(salePage, /onVoidSale=\{\(\) => \{ void handleVoidCompletedSale\(\) \}\}/)
  assert.match(posContext, /export type CompletedSaleLifecycleStatus = 'completed' \| 'voided'/)
  assert.match(posContext, /updateLastSale: \(sale: CompletedSale\) => void/)
  assert.match(saleCompleteModal, /Sale voided/)
  assert.match(saleCompleteModal, /Fran reward reversed/)
  assert.match(saleCompleteModal, /reward\.reverse\.rewardAvailable/)
  assert.match(outbox, /points_restored: reward\.reverse\.pointsRestored/)
  assert.match(outbox, /points_balance_after: reward\.reverse\.pointsBalanceAfter/)
  assert.match(outbox, /reward_available: reward\.reverse\.rewardAvailable/)
})

test('Fran reward lines and events are replay-safe POS facts', () => {
  assert.match(posContext, /lineKind\?: 'product' \| 'fran_reward' \| 'fran_points' \| 'manual_adjustment'/)
  assert.match(posContext, /franRewardQuoteId\?: string \| null/)
  assert.match(posContext, /fran: FranSaleContext \| null/)
  assert.match(outbox, /buildFranOutboxEventsForCompletedSale/)

  for (const eventType of [
    'fran.member.resolved',
    'fran.counter_session.previewed',
    'fran.loyalty_execution.committed',
    'fran.reward.quoted',
    'fran.reward.committed',
    'fran.reward.reversed',
    'fran.reward.commit_failed',
  ]) {
    assert.match(outbox, new RegExp(eventType.replaceAll('.', '\\.')))
    assert.match(`${migration}\n${loyaltyExecutionMigration}`, new RegExp(eventType.replaceAll('.', '\\.')))
  }
  assert.match(salePage, /sendFranLoyaltyExecutionEvent/)
  assert.match(salePage, /policy_version_id: preview\.policyVersionId/)
  assert.match(salePage, /evaluation_trace: preview\.evaluationTrace/)
  assert.match(sharedTypes, /'fran\.loyalty_execution\.committed'/)
})
