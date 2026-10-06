import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('guest totals row keeps membership QR left of subtotal+nett; member hides QR', () => {
  const face = readFileSync(new URL('../dashboard/src/pos/pages/mirror-face.tsx', import.meta.url), 'utf8')
  const basketStart = face.indexOf('function BasketView')
  const basketEnd = face.indexOf('function PairScreen')
  const basket = face.slice(basketStart, basketEnd)

  assert.match(basket, /showJoinQr = !basket\.member/)
  assert.match(basket, /data-testid="mirror-totals-row"/)
  assert.match(basket, /data-testid="mirror-membership-qr"/)
  assert.match(basket, /QRCode\.toDataURL\(MEMBERSHIP_SCAN_URL/)
  assert.match(basket, /Scan to join/)
  assert.match(basket, /Subtotal/)
  assert.match(basket, /Nett/)
  assert.match(basket, /data-testid="mirror-nett"/)
  assert.match(basket, /\\u00d7/)
  assert.match(basket, /\\u00b7/)
})
