import assert from 'node:assert/strict'
import test from 'node:test'

const {
  MIRROR_DONE_IDLE_MS,
  MIRROR_IDLE_PROMOS,
  buildMirrorSnapshot,
  formatMirrorMoney,
  formatTierNudge,
  mirrorAfterDoneIdle,
  mirrorPayBanner,
  mirrorPayingCopy,
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
  assert.deepEqual(snap.basket.lines, [
    { id: 'a', name: 'Item a', qty: 2, net: 75, list: 80, discount: 5 },
    { id: 'b', name: 'Item b', qty: 1, net: 25 },
  ])
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

test('a labelled discount round-trips, and a line missing list price does not parse', () => {
  const line = { ...product('a', 40, 2, 5), discountLabel: ' Member 5 ' }
  const snap = buildMirrorSnapshot(input({ cart: [line] }))
  assert.equal(snap.phase, 'cart')
  assert.deepEqual(snap.basket.lines[0], {
    id: 'a',
    name: 'Item a',
    qty: 2,
    net: 75,
    list: 80,
    discount: 5,
    discountLabel: 'Member 5',
  })
  const parsed = parseMirrorSnapshot(JSON.parse(JSON.stringify(snap)))
  assert.deepEqual(parsed, snap)
  const broken = JSON.parse(JSON.stringify(snap))
  delete broken.basket.lines[0].list
  assert.equal(parseMirrorSnapshot(broken), null)
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
  assert.equal(change.changeDue, 4)
})

test('paying banner follows the tender and hides a zero amount when change is due', () => {
  const cash = buildMirrorSnapshot(input({
    paymentOpen: true,
    activeTenderMode: 'cash',
    totals: { balance: 20 },
  }))
  assert.equal(cash.tender, 'cash')
  assert.equal(mirrorPayingCopy('cash'), 'Pay with cash')
  assert.equal(mirrorPayingCopy('paynow'), 'Scan PayNow')
  assert.equal(mirrorPayBanner({ amountDue: 20, changeDue: 0, tender: 'cash' }).label.includes('card reader'), false)
  assert.equal(mirrorPayBanner({ amountDue: 20, changeDue: 0, tender: 'paynow' }).label, 'Scan PayNow')
  assert.equal(mirrorPayBanner({ amountDue: 20, changeDue: 0, tender: 'card' }).label, 'Pay on the card reader')
  assert.deepEqual(mirrorPayBanner({ amountDue: 0, changeDue: 4, tender: 'cash' }), { kind: 'change', label: 'Change due', amount: 4 })
  assert.equal(mirrorPayBanner({ amountDue: 0, changeDue: 0, tender: null }).kind, 'hidden')

  const paynow = buildMirrorSnapshot(input({
    paymentOpen: true,
    tenders: [{ mode: 'paynow', amount: 10 }],
    totals: { balance: 10 },
  }))
  assert.equal(paynow.tender, 'paynow')
  const reader = buildMirrorSnapshot(input({
    paymentOpen: true,
    activeTenderMode: 'stripe_s700',
    totals: { balance: 10 },
  }))
  assert.equal(reader.tender, 'card')
})

test('done keeps a stashed member name and the cash change', () => {
  const lastSale = {
    receiptNo: 'R-7',
    total: 40,
    saleStatus: 'completed',
    pointsEarned: 40,
    payments: [{ mode: 'cash', amount: 50 }],
  }
  const done = buildMirrorSnapshot(input({
    cart: [],
    completedOpen: true,
    lastSale,
    franSession: null,
    memberName: 'Mei Tan',
  }))
  assert.equal(done.phase, 'done')
  assert.equal(done.memberName, 'Mei Tan')
  assert.equal(done.changeDue, 10)
  assert.deepEqual(parseMirrorSnapshot(JSON.parse(JSON.stringify(done))), done)
  assert.equal(parseMirrorSnapshot({ ...done, changeDue: -1 }), null)
})

test('mirror returns to promos 8 to 15 seconds after done', () => {
  const lastSale = { receiptNo: 'R-8', total: 10, saleStatus: 'completed', pointsEarned: 0 }
  const done = buildMirrorSnapshot(input({ cart: [], completedOpen: true, lastSale, memberName: 'Mei Tan' }))
  assert.ok(MIRROR_DONE_IDLE_MS >= 8000 && MIRROR_DONE_IDLE_MS <= 15000)
  assert.equal(mirrorAfterDoneIdle(done, MIRROR_DONE_IDLE_MS - 1, MIRROR_IDLE_PROMOS).phase, 'done')
  const idle = mirrorAfterDoneIdle(done, MIRROR_DONE_IDLE_MS, MIRROR_IDLE_PROMOS)
  assert.equal(idle.phase, 'idle')
  assert.ok(idle.promos.length >= 1)
  const paying = buildMirrorSnapshot(input({ paymentOpen: true }))
  assert.equal(mirrorAfterDoneIdle(paying, MIRROR_DONE_IDLE_MS, MIRROR_IDLE_PROMOS).phase, 'paying')
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
