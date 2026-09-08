import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// Node 22.6+/24 strips types natively, so the pure builder is imported as-is.
const {
  buildCustomerDisplayPayload,
  customerDisplayPayloadKey,
  formatDisplayMoney,
  formatTiesToHit,
  resolveDisplayState,
} = await import('../dashboard/src/pos/lib/build-customer-display-payload.ts')

const migration = readFileSync(new URL('../supabase/migrations/00015_customer_display_lanes.sql', import.meta.url), 'utf8')
const sync = readFileSync(new URL('../dashboard/src/pos/lib/customer-display-sync.ts', import.meta.url), 'utf8')
const routes = readFileSync(new URL('../dashboard/src/routes.tsx', import.meta.url), 'utf8')
const facePage = readFileSync(new URL('../dashboard/src/pos/pages/customer-display.tsx', import.meta.url), 'utf8')
const salePage = readFileSync(new URL('../dashboard/src/pos/pages/sale.tsx', import.meta.url), 'utf8')

const NOW = new Date('2026-09-08T03:00:00.000Z')

const base = {
  storeName: 'Fran Beauty Bugis+',
  storeCode: 'FRAN01',
  currency: 'SGD',
  cart: [],
  totals: { itemCount: 0, total: 0, balance: 0 },
  paymentOpen: false,
  completedOpen: false,
  lastSale: null,
  franSession: null,
  tierProgress: null,
  now: NOW,
}

const cart = [
  { lineId: 'l1', name: 'Rose Serum 30ml', qty: 2, unitPrice: 48, lineDiscount: 0, lineKind: 'product' },
  { lineId: 'l2', name: 'Silk Mask', qty: 1, unitPrice: 12.5, lineDiscount: 2.5, lineKind: 'product' },
  { lineId: 'l3', name: 'Fran reward', qty: 1, unitPrice: -6, lineDiscount: 0, lineKind: 'fran_reward' },
]
const totals = { itemCount: 4, total: 100, balance: 100 }

const member = {
  mode: 'member',
  member: { name: 'Mei Lin Tan', tier: 'F1', tierLabel: 'F1 Friend', tourist: false },
}

test('idle: empty cart publishes a bare brand-screen payload', () => {
  const p = buildCustomerDisplayPayload(base)
  assert.equal(p.state, 'idle')
  assert.equal(p.version, 1)
  assert.equal(p.storeName, 'Fran Beauty Bugis+')
  assert.equal(p.laneCode, 'MAIN')
  assert.deepEqual(p.lines, [])
  assert.equal(p.runningTotal, 0)
  assert.equal(p.amountDue, null)
  assert.equal(p.member, null)
  assert.equal(p.tiesToHit, null)
  assert.equal(p.thankYouMessage, null)
  assert.equal(p.publishedAt, NOW.toISOString())
})

test('cart: mirrors lines, qty, net line totals and running total (read-only)', () => {
  const p = buildCustomerDisplayPayload({ ...base, cart, totals })
  assert.equal(p.state, 'cart')
  assert.equal(p.itemCount, 4)
  assert.equal(p.runningTotal, 100)
  assert.equal(p.amountDue, null)
  assert.deepEqual(p.lines, [
    { id: 'l1', name: 'Rose Serum 30ml', qty: 2, lineTotal: 96, kind: 'product' },
    { id: 'l2', name: 'Silk Mask', qty: 1, lineTotal: 10, kind: 'product' },
    { id: 'l3', name: 'Fran reward', qty: 1, lineTotal: -6, kind: 'adjustment' },
  ])
})

test('paying: Pay on A flips to amount due using the remaining balance', () => {
  const p = buildCustomerDisplayPayload({ ...base, cart, totals, paymentOpen: true })
  assert.equal(p.state, 'paying')
  assert.equal(p.amountDue, 100)
  assert.equal(p.lines.length, 3, 'lines stay available so B can keep context')

  const partial = buildCustomerDisplayPayload({ ...base, cart, totals: { ...totals, balance: 40 }, paymentOpen: true })
  assert.equal(partial.amountDue, 40)

  const noCart = buildCustomerDisplayPayload({ ...base, paymentOpen: true })
  assert.equal(noCart.state, 'idle', 'payment modal with no cart is not a paying state')
})

test('done: completed sale flashes thank-you with paid amount and receipt', () => {
  const p = buildCustomerDisplayPayload({
    ...base,
    cart: [],
    totals: { itemCount: 0, total: 0 },
    completedOpen: true,
    lastSale: { receiptNo: 'FRAN01-000042', total: 100, saleStatus: 'completed' },
    franSession: member,
  })
  assert.equal(p.state, 'done')
  assert.equal(p.thankYouMessage, 'Thank you')
  assert.equal(p.amountDue, 100)
  assert.equal(p.receiptNo, 'FRAN01-000042')
  assert.deepEqual(p.member, { name: 'Mei Lin Tan', tierLabel: 'F1 Friend' })
  assert.equal(p.tiesToHit, null, 'no promo strip on the thank-you flash')

  const voided = buildCustomerDisplayPayload({
    ...base,
    completedOpen: true,
    lastSale: { receiptNo: 'FRAN01-000042', total: 100, saleStatus: 'voided' },
  })
  assert.equal(voided.state, 'idle', 'a voided sale never thanks the guest')
})

test('state precedence: done > paying > cart > idle', () => {
  assert.equal(resolveDisplayState({ cartCount: 0, paymentOpen: false, completedOpen: false }), 'idle')
  assert.equal(resolveDisplayState({ cartCount: 2, paymentOpen: false, completedOpen: false }), 'cart')
  assert.equal(resolveDisplayState({ cartCount: 2, paymentOpen: true, completedOpen: false }), 'paying')
  assert.equal(
    resolveDisplayState({ cartCount: 0, paymentOpen: false, completedOpen: true, lastSale: { receiptNo: 'r', total: 1 } }),
    'done',
  )
})

test('P1 member strip: only for tagged members, tourists get no tier', () => {
  const tagged = buildCustomerDisplayPayload({ ...base, cart, totals, franSession: member })
  assert.deepEqual(tagged.member, { name: 'Mei Lin Tan', tierLabel: 'F1 Friend' })

  const tourist = buildCustomerDisplayPayload({
    ...base,
    cart,
    totals,
    franSession: { mode: 'member', member: { name: 'Aiko', tier: 'Tourist', tourist: true } },
  })
  assert.deepEqual(tourist.member, { name: 'Aiko', tierLabel: null })

  const nonMember = buildCustomerDisplayPayload({ ...base, cart, totals, franSession: { mode: 'non_member', member: null } })
  assert.equal(nonMember.member, null)
})

test('P1 ties-to-hit: one line, "$X more → Tier", from gapRemaining or spendRequiredForNextTier', () => {
  assert.equal(formatTiesToHit({ nextTierLabel: 'F2', gapRemaining: 25 }, 'SGD'), 'S$25.00 more → F2')
  assert.equal(formatTiesToHit({ nextTierLabel: 'F2', spendRequiredForNextTier: 120.5 }, 'SGD'), 'S$120.50 more → F2')
  assert.equal(formatTiesToHit({ nextTierLabel: 'F2', gapRemaining: 0, crossesTierThreshold: true }, 'SGD'), 'F2 unlocked with this purchase')
  assert.equal(formatTiesToHit({ nextTierLabel: 'F2', gapRemaining: -3, crossesTierThreshold: false }, 'SGD'), null)
  assert.equal(formatTiesToHit({ nextTierLabel: null, gapRemaining: 25 }, 'SGD'), null, 'top tier has nothing to hit')
  assert.equal(formatTiesToHit({ nextTierLabel: 'F2' }, 'SGD'), null, 'unknown gap stays silent')
  assert.equal(formatTiesToHit(null, 'SGD'), null)

  const p = buildCustomerDisplayPayload({
    ...base,
    cart,
    totals,
    franSession: member,
    tierProgress: { nextTierLabel: 'F2', gapRemaining: 25, spendRequiredForNextTier: 125 },
  })
  assert.equal(p.tiesToHit, 'S$25.00 more → F2')
  assert.equal(typeof p.tiesToHit, 'string', 'exactly one promo strip field')
})

test('guest-facing money formatting', () => {
  assert.equal(formatDisplayMoney(12.5, 'SGD'), 'S$12.50')
  assert.equal(formatDisplayMoney(-6, 'SGD'), '-S$6.00')
  assert.equal(formatDisplayMoney(0.005, 'SGD'), 'S$0.01')
  assert.equal(formatDisplayMoney(3, 'USD'), '$3.00')
})

test('payload key ignores publishedAt so identical states are not republished', () => {
  const a = buildCustomerDisplayPayload({ ...base, cart, totals, now: new Date('2026-09-08T03:00:00Z') })
  const b = buildCustomerDisplayPayload({ ...base, cart, totals, now: new Date('2026-09-08T03:00:05Z') })
  assert.equal(customerDisplayPayloadKey(a), customerDisplayPayloadKey(b))
  const c = buildCustomerDisplayPayload({ ...base, cart, totals, paymentOpen: true })
  assert.notEqual(customerDisplayPayloadKey(a), customerDisplayPayloadKey(c))
})

test('migration: lanes table, kiosk RPCs, anon locked out of the raw table, realtime wired', () => {
  assert.match(migration, /create table if not exists public\.pos_customer_display_lanes/)
  assert.match(migration, /lane_code text not null default 'MAIN'/)
  assert.match(migration, /pair_token text not null unique/)
  assert.match(migration, /publish_token uuid not null unique/)
  assert.match(migration, /payload jsonb not null default '\{\}'::jsonb/)
  assert.match(migration, /revoke all on table public\.pos_customer_display_lanes from anon/)
  assert.match(migration, /alter table public\.pos_customer_display_lanes enable row level security/)
  assert.match(migration, /company_id in \(select public\.get_user_company_ids\(\)\)/)
  assert.match(migration, /alter publication supabase_realtime add table public\.pos_customer_display_lanes/)
  assert.match(migration, /realtime\.send\(/)
  assert.match(migration, /on realtime\.messages for select\s+to anon, authenticated/)
  assert.match(migration, /realtime\.topic\(\) like 'customer_display:%'/)
  for (const fn of ['ensure_customer_display_lane', 'publish_customer_display', 'pair_customer_display', 'get_customer_display']) {
    assert.match(migration, new RegExp(`create or replace function public\\.${fn}\\(`))
    assert.match(migration, new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to anon, authenticated`))
  }
  assert.match(migration, /security definer/)
  assert.match(migration, /'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'/, 'pair token alphabet avoids 0/O/1/I')
})

test('sync lib uses Supabase (no BroadcastChannel) with realtime + poll fallback', () => {
  assert.doesNotMatch(sync, /BroadcastChannel/)
  assert.match(sync, /supabase\.rpc\('ensure_customer_display_lane'/)
  assert.match(sync, /supabase\.rpc\('publish_customer_display'/)
  assert.match(sync, /supabase\.rpc\('pair_customer_display'/)
  assert.match(sync, /supabase\.rpc\('get_customer_display'/)
  assert.match(sync, /\.on\('broadcast', \{ event: 'display' \}/)
  assert.match(sync, /config: \{ private: true \}/)
  assert.match(sync, /CUSTOMER_DISPLAY_FAST_POLL_MS = 1500/)
  assert.match(sync, /CUSTOMER_DISPLAY_LANE_STORAGE_KEY = 'fran_pos_customer_display_lane_v1'/)
  assert.match(sync, /CUSTOMER_DISPLAY_PAIR_STORAGE_KEY = 'fran_pos_customer_display_pair_v1'/)
})

test('Screen B route sits under /pos but outside PosShell; A publishes from sale', () => {
  const posBlock = routes.slice(routes.indexOf("path: '/pos'"), routes.indexOf('element: <PosShell />'))
  assert.match(posBlock, /path: 'customer-display', element: <CustomerDisplayPage \/>/)
  assert.doesNotMatch(facePage, /usePos\(|addProduct|updateQty|completeSale|PaymentModal/, 'B never mutates the cart or tenders')
  assert.match(facePage, /DONE_FLASH_MS = 4000/)
  assert.match(salePage, /useCustomerDisplayPublisher\(/)
  assert.match(salePage, /buildCustomerDisplayPayload\(/)
  assert.match(salePage, /<CustomerDisplayPairDialog/)
})
