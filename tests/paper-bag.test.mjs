import assert from 'node:assert/strict'
import test from 'node:test'
import { isPaperBagLine, isPaperBagSku, lineCharge, paperBagProduct } from '../dashboard/src/pos/lib/paper-bag.ts'

test('FRANBAG is 0.00 and keeps a non-stock catalog link', () => {
  const product = paperBagProduct({
    id: 'prod-franbag',
    name: 'Paper bag',
    trackInventory: false,
    skums: { product_id: 'prod-franbag' },
  })
  assert.equal(product.sku, 'FRANBAG')
  assert.equal(product.price, 0)
  assert.equal(product.mdPrice, undefined)
  assert.equal(product.returnable, false)
  assert.equal(product.trackInventory, false)
  assert.equal(product.skums?.product_id, 'prod-franbag')
})

test('a 0.10 catalog price does not survive onto the fee', () => {
  const product = paperBagProduct({
    id: 'prod-franbag',
    name: 'Paper bag',
    price: 0.1,
    mdPrice: 0.1,
    trackInventory: false,
    skums: { product_id: 'prod-franbag' },
  })
  const charge = lineCharge({
    sku: product.sku,
    lineKind: 'fee',
    unitPrice: 0.1,
    listPrice: 0.1,
    qty: 2,
    lineDiscount: 0.1,
  })
  assert.equal(product.price, 0)
  assert.deepEqual(charge, {
    unitPrice: 0,
    listPrice: 0,
    discountAmount: 0,
    lineTotal: 0,
    nonStock: true,
  })
})

test('a stock-tracked FRANBAG does not attach a product id', () => {
  const product = paperBagProduct({
    id: 'prod-tracked',
    name: '  ',
    trackInventory: true,
    skums: { product_id: 'prod-tracked' },
  })
  assert.equal(product.id, 'fee-franbag')
  assert.equal(product.name, 'Paper bag')
  assert.equal(product.price, 0)
  assert.equal(product.skums, undefined)
})

test('no catalog row is a local fee, and a normal line keeps its money', () => {
  const product = paperBagProduct(null)
  assert.equal(product.id, 'fee-franbag')
  assert.equal(product.skums, undefined)
  assert.equal(isPaperBagSku(' franbag '), true)
  assert.equal(isPaperBagSku('SKN-1001'), false)
  assert.equal(isPaperBagLine({ sku: 'FRANBAG', lineKind: 'product' }), true)
  assert.equal(isPaperBagLine({ sku: 'SKN-1001', lineKind: 'fee' }), true)
  assert.deepEqual(
    lineCharge({ sku: 'SKN-1001', lineKind: 'product', unitPrice: 10, listPrice: 12, qty: -1, lineDiscount: 1 }),
    { unitPrice: 10, listPrice: 12, discountAmount: 1, lineTotal: -9, nonStock: false },
  )
})
