import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const salePage = readFileSync(new URL('../dashboard/src/pos/pages/sale.tsx', import.meta.url), 'utf8')
const posContext = readFileSync(new URL('../dashboard/src/pos/lib/pos-context.tsx', import.meta.url), 'utf8')
const outbox = readFileSync(new URL('../dashboard/src/pos/lib/pos-outbox.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/00007_create_pos_source_outbox.sql', import.meta.url), 'utf8')
const franClient = readFileSync(new URL('../dashboard/src/pos/fran/lib/fran-crm-client.ts', import.meta.url), 'utf8')
const franMock = readFileSync(new URL('../dashboard/src/pos/fran/mock-crm.ts', import.meta.url), 'utf8')
const franContract = readFileSync(new URL('../docs/fran-pos-crm-skums-contract.md', import.meta.url), 'utf8')

test('Fran POS keeps Fran-specific workflow in named Fran surfaces', () => {
  for (const fragment of [
    'dashboard/src/pos/fran/types.ts',
    'dashboard/src/pos/fran/mock-crm.ts',
    'dashboard/src/pos/fran/lib/fran-crm-client.ts',
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
    'previewBasket',
    'quoteRewardRedemption',
    'commitRewardRedemption',
    'reverseRewardRedemption',
    'sendEvent',
  ]) {
    assert.match(franClient, new RegExp(`${method}\\(`))
  }

  assert.match(franClient, /VITE_FRAN_CRM_URL/)
  assert.match(franClient, /mockResolveMember/)
  assert.match(franMock, /FRAN_MOCK_MEMBERS/)
  assert.match(franMock, /mockPreviewBasket/)
})

test('Fran sale page requires explicit member or exception and commits rewards after payment', () => {
  assert.match(salePage, /<FranMemberStrip/)
  assert.match(salePage, /<FranCustomerModal/)
  assert.match(salePage, /<FranRewardRedemptionPanel/)
  assert.match(salePage, /disabled=\{cart\.length === 0 \|\| totals\.total <= 0 \|\| !franSession\}/)
  assert.match(salePage, /quoteFranReward/)
  assert.match(salePage, /confirmFranRewardQuote/)
  assert.match(salePage, /addAdjustmentLine/)
  assert.match(salePage, /commitRewardRedemption/)
  assert.match(salePage, /onComplete=\{\(\) => \{ void completePaidSale\(\) \}\}/)
})

test('Fran reward lines and events are replay-safe POS facts', () => {
  assert.match(posContext, /lineKind\?: 'product' \| 'fran_reward' \| 'fran_points' \| 'manual_adjustment'/)
  assert.match(posContext, /franRewardQuoteId\?: string \| null/)
  assert.match(posContext, /fran: FranSaleContext \| null/)
  assert.match(outbox, /buildFranOutboxEventsForCompletedSale/)

  for (const eventType of [
    'fran.member.resolved',
    'fran.counter_session.previewed',
    'fran.reward.quoted',
    'fran.reward.committed',
    'fran.reward.reversed',
    'fran.reward.commit_failed',
  ]) {
    assert.match(outbox, new RegExp(eventType.replaceAll('.', '\\.')))
    assert.match(migration, new RegExp(eventType.replaceAll('.', '\\.')))
  }
})
