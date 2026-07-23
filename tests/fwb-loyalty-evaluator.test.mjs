/**
 * Track L / L-pos — FWB PDF golden earn + dens + wiring smoke tests.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { bestFwbRedeemDenom, computeFwbEarnPoints, FWB_REDEEM_DENOMS, FWB_TIER_RATES } from './fwb-earn.mjs'

const evaluator = readFileSync(
  new URL('../dashboard/src/pos/fran/lib/fran-policy-evaluator.ts', import.meta.url),
  'utf8',
)
const fwbTs = readFileSync(
  new URL('../dashboard/src/pos/fran/lib/fwb-earn.ts', import.meta.url),
  'utf8',
)
const mock = readFileSync(new URL('../dashboard/src/pos/fran/mock-crm.ts', import.meta.url), 'utf8')
const client = readFileSync(
  new URL('../dashboard/src/pos/fran/lib/fran-crm-client.ts', import.meta.url),
  'utf8',
)
const salePage = readFileSync(new URL('../dashboard/src/pos/pages/sale.tsx', import.meta.url), 'utf8')
const types = readFileSync(new URL('../dashboard/src/pos/fran/types.ts', import.meta.url), 'utf8')

test('FWB PDF §5 golden earn scenarios (additive stack)', () => {
  // From loyaltys.pdf — S$100 and S$250 grids
  const cases = [
    { spend: 100, tier: 1.0, b: false, c: false, pts: 100 },
    { spend: 100, tier: 1.0, b: false, c: true, pts: 200 },
    { spend: 100, tier: 1.0, b: true, c: false, pts: 200 },
    { spend: 100, tier: 1.0, b: true, c: true, pts: 300 },
    { spend: 100, tier: 1.25, b: false, c: false, pts: 125 },
    { spend: 100, tier: 1.25, b: false, c: true, pts: 225 },
    { spend: 100, tier: 1.25, b: true, c: false, pts: 225 },
    { spend: 100, tier: 1.25, b: true, c: true, pts: 325 },
    { spend: 100, tier: 1.5, b: false, c: false, pts: 150 },
    { spend: 100, tier: 1.5, b: false, c: true, pts: 250 },
    { spend: 100, tier: 1.5, b: true, c: false, pts: 250 },
    { spend: 100, tier: 1.5, b: true, c: true, pts: 350 },
    { spend: 250, tier: 1.0, b: false, c: false, pts: 250 },
    { spend: 250, tier: 1.0, b: false, c: true, pts: 500 },
    { spend: 250, tier: 1.0, b: true, c: false, pts: 500 },
    { spend: 250, tier: 1.0, b: true, c: true, pts: 750 },
    { spend: 250, tier: 1.25, b: false, c: false, pts: 312 },
    { spend: 250, tier: 1.25, b: false, c: true, pts: 562 },
    { spend: 250, tier: 1.25, b: true, c: false, pts: 562 },
    { spend: 250, tier: 1.25, b: true, c: true, pts: 812 },
    { spend: 250, tier: 1.5, b: false, c: false, pts: 375 },
    { spend: 250, tier: 1.5, b: false, c: true, pts: 625 },
    { spend: 250, tier: 1.5, b: true, c: false, pts: 625 },
    { spend: 250, tier: 1.5, b: true, c: true, pts: 875 },
  ]

  for (const row of cases) {
    const r = computeFwbEarnPoints({
      spend: row.spend,
      tierRate: row.tier,
      birthdayActive: row.b,
      categoryActive: row.c,
    })
    assert.equal(
      r.points,
      row.pts,
      `spend=${row.spend} tier=${row.tier} b=${row.b} c=${row.c} → expected ${row.pts}, got ${r.points}`,
    )
  }
})

test('FWB PDF §3 fixed redemption dens', () => {
  assert.deepEqual(
    FWB_REDEEM_DENOMS.map((d) => [d.points, d.discount]),
    [
      [200, 6],
      [500, 20],
      [1000, 50],
      [1500, 90],
      [2500, 175],
    ],
  )
  assert.equal(bestFwbRedeemDenom(199), null)
  assert.equal(bestFwbRedeemDenom(200)?.points, 200)
  assert.equal(bestFwbRedeemDenom(999)?.points, 500)
  assert.equal(bestFwbRedeemDenom(2500)?.points, 2500)
  assert.equal(bestFwbRedeemDenom(3000)?.discount, 175)
})

test('FWB tier rates match PDF', () => {
  assert.equal(FWB_TIER_RATES.F1, 1)
  assert.equal(FWB_TIER_RATES.F2, 1.25)
  assert.equal(FWB_TIER_RATES.F3, 1.5)
})

test('POS evaluator uses FWB additive formula and calendar-year tiers', () => {
  assert.match(evaluator, /computeFwbEarnPoints/)
  assert.match(evaluator, /fwb_additive|FWB final earn/)
  assert.match(evaluator, /calendar_year/)
  assert.match(evaluator, /fwb_fixed_denoms|fixedDenominations/)
  assert.match(evaluator, /voucherScans/)
  assert.match(fwbTs, /Total Multiplier = Tier Rate/)
  assert.match(fwbTs, /FWB_REDEEM_DENOMS/)
})

test('Mock CRM ships FWB F1/F2/F3 + fixed dens + commitSale', () => {
  assert.match(mock, /Tier 1|F1/)
  assert.match(mock, /annualSpend: 500/)
  assert.match(mock, /annualSpend: 1250/)
  assert.match(mock, /fwbRedeemDens|fixedDenominations/)
  assert.match(mock, /mockCommitSale/)
  assert.match(mock, /calendarYtdSpend/)
})

test('Fran CRM client + sale page call commitSale (L-pos)', () => {
  assert.match(client, /commitSale/)
  assert.match(client, /\/fran\/pos\/loyalty\/commit-sale/)
  assert.match(client, /mockCommitSale/)
  assert.match(salePage, /commitSale\(/)
  assert.match(types, /FranLoyaltyCommitSaleInput/)
  assert.match(types, /FranVoucherScan/)
  assert.match(types, /calendar_year/)
})

test('Member popup / strip / profile use shared FWB tier display', () => {
  const tierDisplay = readFileSync(
    new URL('../dashboard/src/pos/fran/lib/tier-display.ts', import.meta.url),
    'utf8',
  )
  const modal = readFileSync(
    new URL('../dashboard/src/pos/fran/components/fran-customer-modal.tsx', import.meta.url),
    'utf8',
  )
  const strip = readFileSync(
    new URL('../dashboard/src/pos/fran/components/fran-member-strip.tsx', import.meta.url),
    'utf8',
  )
  const card = readFileSync(
    new URL('../dashboard/src/pos/fran/components/fran-counter-profile-card.tsx', import.meta.url),
    'utf8',
  )
  assert.match(tierDisplay, /normalizeFwbTierKey/)
  assert.match(tierDisplay, /F1|F2|F3/)
  assert.match(tierDisplay, /tierEarnRateLabel/)
  assert.match(modal, /from '\.\.\/lib\/tier-display'/)
  assert.match(modal, /tierSummaryLine/)
  assert.match(modal, /tier: 'F1'/)
  assert.match(strip, /from '\.\.\/lib\/tier-display'/)
  assert.match(card, /from '\.\.\/lib\/tier-display'/)
})
