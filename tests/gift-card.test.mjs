import assert from 'node:assert/strict'
import test from 'node:test'

const {
  applyGiftBalance,
  giftCardQuote,
  nextTenderAmount,
  readGiftBalances,
  readMetadataGiftCard,
  remainingAfter,
  settleGiftCard,
  storedValueQuote,
  writeGiftBalance,
} = await import('../dashboard/src/pos/lib/gift-card.ts')

test('a $30 redeem on a $100 card leaves $70', () => {
  const quote = giftCardQuote({ balance: 100, tenders: [], saleRemaining: 30 })
  assert.deepEqual(quote, { available: 100, maxRedeem: 30 })
  assert.equal(remainingAfter(quote.available, 30), 70)
})

test('a $120 sale can take the whole $100 card and leave $0', () => {
  const quote = giftCardQuote({ balance: 100, tenders: [], saleRemaining: 120 })
  assert.equal(quote.maxRedeem, 100)
  assert.equal(remainingAfter(quote.available, quote.maxRedeem), 0)
})

test('a typed $25 on an $80 sale leaves $75 and stays under the cap', () => {
  const quote = giftCardQuote({ balance: 100, tenders: [], saleRemaining: 80 })
  assert.equal(quote.maxRedeem, 80)
  assert.ok(25 <= quote.maxRedeem)
  assert.equal(remainingAfter(quote.available, 25), 75)
})

test('a second gift tender cannot spend balance the first tender already took', () => {
  const quote = giftCardQuote({
    balance: 100,
    tenders: [
      { mode: 'gift-card', amount: 60 },
      { mode: 'cash', amount: 10 },
    ],
    saleRemaining: 50,
  })
  assert.deepEqual(quote, { available: 40, maxRedeem: 40 })
  assert.equal(remainingAfter(quote.available, quote.maxRedeem), 0)
})

test('an empty or zero amount does not consume the card', () => {
  const quote = giftCardQuote({ balance: 100, tenders: [], saleRemaining: 30 })
  assert.equal(remainingAfter(quote.available, 0), 100)
  assert.equal(quote.maxRedeem, 30)
})

test('store credit uses the same cap and ignores gift tenders', () => {
  const quote = storedValueQuote({
    balance: 25.5,
    tenders: [{ mode: 'gift-card', amount: 30 }],
    mode: 'store-credit',
    saleRemaining: 40,
  })
  assert.deepEqual(quote, { available: 25.5, maxRedeem: 25.5 })
})

test('quotes round to cents', () => {
  const quote = giftCardQuote({
    balance: 10.005,
    tenders: [{ mode: 'gift-card', amount: 0.1 }],
    saleRemaining: 3.335,
  })
  assert.equal(quote.available, 9.91)
  assert.equal(quote.maxRedeem, 3.34)
  assert.equal(remainingAfter(quote.available, 3.335), 6.57)
})

test('the first key after a prefill replaces it instead of appending', () => {
  assert.deepEqual(nextTenderAmount('100.00', '2', true), { amount: '2', replacePrefill: false })
  assert.deepEqual(nextTenderAmount('2', '5', false), { amount: '25', replacePrefill: false })
  assert.deepEqual(nextTenderAmount('25', '.', false), { amount: '25.', replacePrefill: false })
  assert.deepEqual(nextTenderAmount('25.', '.', false), { amount: '25.', replacePrefill: false })
})

test('settlement keeps the card number and the last remaining balance', () => {
  const settlement = settleGiftCard([
    {
      mode: 'gift-card',
      amount: 30,
      providerMetadata: {
        gift_card_no: 'GC-8842-0091',
        balance_before: 100,
        redeemed: 30,
        balance_after: 70,
      },
    },
    { mode: 'cash', amount: 20 },
    {
      mode: 'gift-card',
      amount: 10,
      providerMetadata: {
        gift_card_no: 'GC-8842-0091',
        balance_before: 70,
        redeemed: 10,
        balance_after: 60,
      },
    },
  ])
  assert.deepEqual(settlement, { giftCardNo: 'GC-8842-0091', redeemed: 40, remaining: 60 })
  assert.equal(settleGiftCard([{ mode: 'cash', amount: 20 }]), null)
})

test('demo balance memory replaces the mock balance on the next tag', () => {
  const wei = { id: 'c1', giftCardBalance: 100 }
  const balances = writeGiftBalance(readGiftBalances(null), wei.id, 70)
  assert.equal(applyGiftBalance(wei, balances).giftCardBalance, 70)
  assert.equal(applyGiftBalance({ id: 'c2', giftCardBalance: 0 }, balances).giftCardBalance, 0)
  assert.deepEqual(readGiftBalances(JSON.stringify(balances)), { c1: 70 })
})

test('admin metadata shows a card that has been spent down to zero', () => {
  assert.deepEqual(readMetadataGiftCard({ gift_card_no: 'GC-8842-0091', gift_card_balance: 0 }), {
    giftCardNo: 'GC-8842-0091',
    balance: 0,
  })
  assert.equal(readMetadataGiftCard({}), null)
  assert.equal(readMetadataGiftCard(null), null)
})
