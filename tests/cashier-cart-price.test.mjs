import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const { cartPriceFace } = await import('../dashboard/src/pos/lib/cart-price-face.ts')

const line = (overrides) => ({
  unitPrice: 40,
  listPrice: 40,
  qty: 1,
  lineDiscount: 0,
  isMarkdown: false,
  ...overrides,
})

test('a plain line shows nett only', () => {
  assert.deepEqual(cartPriceFace(line({ unitPrice: 12.5, listPrice: 12.5 })), {
    kind: 'nett',
    nett: 12.5,
  })
})

test('a line discount shows the selling total, the stored label, and nett', () => {
  assert.deepEqual(
    cartPriceFace(
      line({
        qty: 2,
        lineDiscount: 5,
        discountLabel: ' Staff Discount 15% ',
      }),
    ),
    {
      kind: 'marked',
      list: 80,
      offs: [{ label: 'Staff Discount 15%', amount: 5 }],
      nett: 75,
    },
  )
})

test('a markdown line shows the ticket, MD savings, and nett', () => {
  assert.deepEqual(
    cartPriceFace(line({ unitPrice: 80, listPrice: 100, qty: 2, isMarkdown: true })),
    {
      kind: 'marked',
      list: 200,
      offs: [{ label: 'MD', amount: 40 }],
      nett: 160,
    },
  )
})

test('markdown and a line discount stack under the ticket', () => {
  const face = cartPriceFace(
    line({
      unitPrice: 80,
      listPrice: 100,
      qty: 2,
      lineDiscount: 10,
      isMarkdown: true,
      discountLabel: 'Staff Discount 15%',
    }),
  )
  assert.deepEqual(face, {
    kind: 'marked',
    list: 200,
    offs: [
      { label: 'MD', amount: 40 },
      { label: 'Staff Discount 15%', amount: 10 },
    ],
    nett: 150,
  })
  assert.equal(face.list - face.offs[0].amount - face.offs[1].amount, face.nett)
})

test('a lower unit price without the markdown flag still shows was and savings', () => {
  assert.deepEqual(cartPriceFace(line({ unitPrice: 40, listPrice: 50 })), {
    kind: 'marked',
    list: 50,
    offs: [{ label: '', amount: 10 }],
    nett: 40,
  })
})

test('a return keeps list, offs, and nett on one signed sum', () => {
  const face = cartPriceFace(
    line({
      unitPrice: 40,
      listPrice: 50,
      qty: -2,
      lineDiscount: 5,
      isMarkdown: true,
      discountLabel: 'Damage',
    }),
  )
  assert.deepEqual(face, {
    kind: 'marked',
    list: -100,
    offs: [
      { label: 'MD', amount: -20 },
      { label: 'Damage', amount: -5 },
    ],
    nett: -75,
  })
  assert.equal(face.list - face.offs[0].amount - face.offs[1].amount, face.nett)
})

test('CartRow renders list, each off, and nett in the price column', () => {
  const sale = readFileSync(new URL('../dashboard/src/pos/pages/sale.tsx', import.meta.url), 'utf8')
  const start = sale.indexOf('function CartRow')
  const end = sale.indexOf('function CartOverrideModal')
  const row = sale.slice(start, end)

  assert.ok(start >= 0 && end > start, 'CartRow is present')
  assert.match(row, /cartPriceFace\(line\)/)
  assert.match(row, /face\.kind === 'marked'/)
  assert.match(row, /line-through/)
  assert.match(row, /text-success/)
  assert.match(row, /text-\[11px\]/)
  assert.match(row, /face\.list/)
  assert.match(row, /face\.nett/)
  assert.match(row, /off\.label/)
  assert.match(row, /formatCurrency\(-off\.amount/)
  assert.match(row, /onInc/)
  assert.match(row, /onDiscount/)
  assert.match(row, /onOverride/)
  assert.match(row, /onRemove/)
  assert.doesNotMatch(row, /line\.discountLabel\}: -\{formatCurrency\(line\.lineDiscount/)
})
