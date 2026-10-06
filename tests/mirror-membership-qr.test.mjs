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

test('guest membership QR is 3cm, capped, and does not take the totals column', () => {
  const face = readFileSync(new URL('../dashboard/src/pos/pages/mirror-face.tsx', import.meta.url), 'utf8')
  const basketStart = face.indexOf('function BasketView')
  const basketEnd = face.indexOf('function PairScreen')
  const basket = face.slice(basketStart, basketEnd)
  const rowStart = basket.indexOf('data-testid="mirror-totals-row"')
  const row = basket.slice(rowStart, basket.indexOf('amountDue', rowStart))
  const cssPx = Math.min((3 * 96) / 2.54, 7.5 * 16)
  const raster = face.match(/MEMBERSHIP_QR_RASTER = (\d+)/)

  assert.match(face, /MEMBERSHIP_QR_BOX = 'h-\[min\(3cm,7\.5rem\)\] w-\[min\(3cm,7\.5rem\)\] rounded-md'/)
  assert.match(basket, /\$\{MEMBERSHIP_QR_BOX\} bg-white/)
  assert.match(basket, /\$\{MEMBERSHIP_QR_BOX\} bg-surface-sunken/)
  assert.match(basket, /width: MEMBERSHIP_QR_RASTER/)
  assert.doesNotMatch(basket, /h-20 w-20/)
  assert.ok(raster, 'raster width is declared')
  assert.ok(Number(raster[1]) >= Math.ceil(cssPx * 2), `raster ${raster?.[1]} covers 2x of ${cssPx.toFixed(1)}px`)
  assert.ok(rowStart >= 0, 'totals row is present')
  assert.ok(row.indexOf('mirror-membership-qr') < row.indexOf('Subtotal'))
  assert.ok(row.indexOf('Subtotal') < row.indexOf('Nett'))
  assert.match(row, /items-center/)
  assert.match(row, /shrink-0 flex-col items-center/)
  assert.match(row, /min-w-0 flex-1/)
})
