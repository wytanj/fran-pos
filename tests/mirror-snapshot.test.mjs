import assert from 'node:assert/strict'
import test from 'node:test'

const {
  MIRROR_IDLE_PROMOS,
  buildMirrorSnapshot,
  formatMirrorMoney,
  formatTierNudge,
  parseMirrorSnapshot,
} = await import('../dashboard/src/pos/mirror/mirror-snapshot.ts')

const store = { name: 'Fran Bugis+', code: 'FRAN01', currency: 'SGD' }

const product = (id, unitPrice, qty = 1, lineDiscount = 0) => ({
  lineId: id,
  name: `Item ${id}`,
  qty,
  unitPrice,
  lineDiscount,
  lineKind: 'product',
})

const reward = (id, amount, lineKind = 'fran_reward') => ({
  lineId: id,
  name: 'FWB reward',
  discountLabel: 'S$10 birthday reward',
  qty: 1,
  unitPrice: amount,
  lineDiscount: 0,
  lineKind,
})

const member = {
  mode: 'member',
  member: { name: 'Mei Tan', tier: 'F1', tierLabel: 'Fran Friend', tourist: false },
}

function input({ totals, total: totalOverride, ...overrides } = {}) {
  const cart = overrides.cart ?? [product('a', 40)]
  const total = totalOverride ?? cart.reduce((s, l) => s + l.unitPrice * l.qty - l.lineDiscount, 0)
  return {
    store,
    cart,
    paymentOpen: false,
    completedOpen: false,
    lastSale: null,
    franSession: null,
    franPreview: null,
    promos: MIRROR_IDLE_PROMOS,
    ...overrides,
    totals: { itemCount: cart.length, total, balance: total, cartAdjustment: 0, ...totals },
  }
}

test('empty cart shows idle promos', () => {
  const snap = buildMirrorSnapshot(input({ cart: [], total: 0 }))
  assert.equal(snap.phase, 'idle')
  assert.ok(snap.promos.length >= 1)
})

test('cart phase splits products from rewards and keeps nett equal to the register total', () => {
  const cart = [product('a', 40, 2, 5), product('b', 25), reward('r', -10), reward('p', -3, 'fran_points')]
  const snap = buildMirrorSnapshot(
    input({ cart, total: 90, totals: { itemCount: 5, total: 90, balance: 90, cartAdjustment: 3 } }),
  )
  assert.equal(snap.phase, 'cart')
  assert.deepEqual(snap.basket.lines.map((l) => [l.id, l.net]), [['a', 75], ['b', 25]])
  assert.deepEqual(snap.basket.rewards.map((r) => [r.id, r.label, r.amount]), [
    ['r', 'S$10 birthday reward', -10],
    ['p', 'S$10 birthday reward', -3],
    ['cart-adjustment', 'Price adjustment', 3],
  ])
  assert.equal(snap.basket.subtotal, 100)
  assert.equal(snap.basket.nett, 90)
  const rewardSum = snap.basket.rewards.reduce((s, r) => s + r.amount, 0)
  assert.equal(Math.round((snap.basket.subtotal + rewardSum) * 100) / 100, snap.basket.nett)
})

test('open amount lines count as products', () => {
  const snap = buildMirrorSnapshot(input({ cart: [{ ...product('o', 12), lineKind: 'open_amount' }] }))
  assert.equal(snap.basket.lines.length, 1)
  assert.equal(snap.basket.rewards.length, 0)
})

test('paying phase shows the outstanding balance, never negative', () => {
  const paying = buildMirrorSnapshot(input({ paymentOpen: true, totals: { balance: 15.5 } }))
  assert.equal(paying.phase, 'paying')
  assert.equal(paying.amountDue, 15.5)
  const change = buildMirrorSnapshot(input({ paymentOpen: true, totals: { balance: -4 } }))
  assert.equal(change.amountDue, 0)
})

test('done phase shows the receipt only for a completed sale', () => {
  const lastSale = { receiptNo: 'R-0042', total: 88.8, saleStatus: 'completed', pointsEarned: 88 }
  const done = buildMirrorSnapshot(input({ cart: [], completedOpen: true, lastSale, franSession: member }))
  assert.equal(done.phase, 'done')
  assert.equal(done.receiptNo, 'R-0042')
  assert.equal(done.memberName, 'Mei Tan')
  assert.equal(done.pointsEarned, 88)
  const voided = buildMirrorSnapshot(
    input({ cart: [], completedOpen: true, lastSale: { ...lastSale, saleStatus: 'voided' } }),
  )
  assert.equal(voided.phase, 'idle')
})

test('member strip shows name, tier and points to earn; tourists get no tier; non-members none', () => {
  const franPreview = { earnPoints: 40, tierProgress: { nextTierLabel: 'Fran Fave', gapRemaining: 25 } }
  const snap = buildMirrorSnapshot(input({ franSession: member, franPreview }))
  assert.deepEqual(snap.basket.member, { name: 'Mei Tan', tierLabel: 'Fran Friend', pointsToEarn: 40 })
  assert.equal(snap.basket.tierNudge, 'S$25.00 more to Fran Fave')

  const tourist = buildMirrorSnapshot(
    input({ franSession: { mode: 'member', member: { ...member.member, tourist: true } }, franPreview }),
  )
  assert.equal(tourist.basket.member.tierLabel, null)

  const walkIn = buildMirrorSnapshot(input({ franSession: { mode: 'non_member', member: null }, franPreview }))
  assert.equal(walkIn.basket.member, null)
  assert.equal(walkIn.basket.tierNudge, null)
})

test('tier nudge says nothing it cannot back up', () => {
  assert.equal(formatTierNudge(null, 'SGD'), null)
  assert.equal(formatTierNudge({ nextTierLabel: null, gapRemaining: 10 }, 'SGD'), null)
  assert.equal(formatTierNudge({ nextTierLabel: 'Gold' }, 'SGD'), null)
  assert.equal(formatTierNudge({ nextTierLabel: 'Gold', gapRemaining: 0 }, 'SGD'), null)
  assert.equal(
    formatTierNudge({ nextTierLabel: 'Gold', gapRemaining: 0, crossesTierThreshold: true }, 'SGD'),
    'Gold unlocked with this purchase',
  )
  assert.equal(formatTierNudge({ nextTierLabel: 'Gold', spendRequiredForNextTier: 7.5 }, 'SGD'), 'S$7.50 more to Gold')
})

test('done and paying can carry a gift card remainder, and older snapshots still parse', () => {
  const lastSale = { receiptNo: 'R-9', total: 30, saleStatus: 'completed', pointsEarned: 0 }
  const done = buildMirrorSnapshot(input({
    cart: [],
    completedOpen: true,
    lastSale,
    giftCard: { redeemed: 30, remaining: 70 },
  }))
  assert.equal(done.phase, 'done')
  assert.deepEqual(done.giftCard, { redeemed: 30, remaining: 70 })
  assert.deepEqual(parseMirrorSnapshot(JSON.parse(JSON.stringify(done))), done)

  const paying = buildMirrorSnapshot(input({ paymentOpen: true, giftCard: { redeemed: 25, remaining: 75 } }))
  assert.equal(paying.phase, 'paying')
  assert.deepEqual(paying.giftCard, { redeemed: 25, remaining: 75 })

  const legacy = {
    v: 1,
    phase: 'done',
    store,
    receiptNo: 'R-1',
    nett: 10,
    memberName: null,
    pointsEarned: null,
  }
  const parsed = parseMirrorSnapshot(legacy)
  assert.equal(parsed.phase, 'done')
  assert.equal(parsed.giftCard, undefined)
  assert.equal(parseMirrorSnapshot({ ...legacy, giftCard: { redeemed: '30', remaining: 70 } }), null)
})

test('money formats for the guest', () => {
  assert.equal(formatMirrorMoney(12.5, 'SGD'), 'S$12.50')
  assert.equal(formatMirrorMoney(-3, 'SGD'), '-S$3.00')
  assert.equal(formatMirrorMoney(1, 'MYR'), 'MYR 1.00')
})

test('parseMirrorSnapshot round-trips every phase through JSON and rejects bad shapes', () => {
  const lastSale = { receiptNo: 'R-1', total: 10, saleStatus: 'completed', pointsEarned: 0 }
  const snaps = [
    buildMirrorSnapshot(input({ cart: [], total: 0 })),
    buildMirrorSnapshot(input({ franSession: member, franPreview: { earnPoints: 4 } })),
    buildMirrorSnapshot(input({ paymentOpen: true })),
    buildMirrorSnapshot(input({ cart: [], completedOpen: true, lastSale })),
  ]
  assert.deepEqual(snaps.map((s) => s.phase), ['idle', 'cart', 'paying', 'done'])
  for (const snap of snaps) {
    assert.deepEqual(parseMirrorSnapshot(JSON.parse(JSON.stringify(snap))), snap)
  }
  const cart = JSON.parse(JSON.stringify(snaps[1]))
  assert.equal(parseMirrorSnapshot({ ...cart, v: 2 }), null)
  assert.equal(parseMirrorSnapshot({ ...cart, phase: 'refund' }), null)
  assert.equal(parseMirrorSnapshot({ ...cart, basket: { ...cart.basket, nett: '90' } }), null)
  assert.equal(parseMirrorSnapshot({ ...snaps[2], amountDue: undefined }), null)
  assert.equal(parseMirrorSnapshot({}), null)
  assert.equal(parseMirrorSnapshot(null), null)
})
