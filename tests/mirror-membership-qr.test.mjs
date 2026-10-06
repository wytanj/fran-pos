import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { renderFranMembershipQr } from '../dashboard/src/pos/mirror/fran-membership-qr.ts'

const require = createRequire(import.meta.url)
const {
  QRCodeReader,
  BinaryBitmap,
  HybridBinarizer,
  RGBLuminanceSource,
} = require('../dashboard/node_modules/@zxing/library/cjs/index.js')

const BROWN = 38
const YELLOW = 196
const WHITE = 255

function attr(source, name) {
  const match = source.match(new RegExp(`\\b${name}="([^"]+)"`))
  return match ? Number(match[1]) : null
}

function inRound(lx, ly, rw, rh, radius) {
  let dx = 0
  let dy = 0
  if (lx < radius) dx = radius - lx
  else if (lx > rw - radius) dx = lx - (rw - radius)
  if (ly < radius) dy = radius - ly
  else if (ly > rh - radius) dy = ly - (rh - radius)
  return dx * dx + dy * dy <= radius * radius
}

function paintRect(luma, width, x, y, rw, rh, rx, lum) {
  const radius = Math.min(Math.max(rx, 0), rw / 2, rh / 2)
  const x0 = Math.max(0, Math.floor(x))
  const y0 = Math.max(0, Math.floor(y))
  const x1 = Math.min(width, Math.ceil(x + rw))
  const y1 = Math.min(width, Math.ceil(y + rh))
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const lx = px + 0.5 - x
      const ly = py + 0.5 - y
      if (lx < 0 || ly < 0 || lx >= rw || ly >= rh) continue
      if (radius > 0 && !inRound(lx, ly, rw, rh, radius)) continue
      luma[py * width + px] = lum
    }
  }
}

function pointInPoly(x, y, points) {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]
    const [xj, yj] = points[j]
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function rasterize(svg, scale) {
  const view = svg.match(/viewBox="0 0 ([0-9.]+) ([0-9.]+)"/)
  assert.ok(view, 'svg viewBox')
  const vb = Number(view[1])
  const width = Math.round(vb * scale)
  const luma = new Uint8ClampedArray(width * width)
  luma.fill(WHITE)
  const fillLum = { '#FFFFFF': WHITE, '#FFE14D': YELLOW, '#3A2415': BROWN }
  for (const match of svg.matchAll(/<rect\b([^>]*)\/>/g)) {
    const source = match[1]
    const fill = source.match(/fill="([^"]+)"/)?.[1]
    const lum = fillLum[fill]
    assert.ok(lum != null, `known fill ${fill}`)
    paintRect(
      luma,
      width,
      (attr(source, 'x') ?? 0) * scale,
      (attr(source, 'y') ?? 0) * scale,
      attr(source, 'width') * scale,
      attr(source, 'height') * scale,
      (attr(source, 'rx') ?? 0) * scale,
      lum,
    )
  }
  for (const match of svg.matchAll(/<polygon\b([^>]*)\/>/g)) {
    const source = match[1]
    const fill = source.match(/fill="([^"]+)"/)?.[1]
    const lum = fillLum[fill]
    const points = source
      .match(/points="([^"]+)"/)?.[1]
      .trim()
      .split(/\s+/)
      .map((pair) => pair.split(',').map((part) => Number(part) * scale))
    let minX = width
    let minY = width
    let maxX = 0
    let maxY = 0
    for (const [px, py] of points) {
      minX = Math.min(minX, px)
      minY = Math.min(minY, py)
      maxX = Math.max(maxX, px)
      maxY = Math.max(maxY, py)
    }
    for (let py = Math.max(0, Math.floor(minY)); py < Math.min(width, Math.ceil(maxY)); py++) {
      for (let px = Math.max(0, Math.floor(minX)); px < Math.min(width, Math.ceil(maxX)); px++) {
        if (pointInPoly(px + 0.5, py + 0.5, points)) luma[py * width + px] = lum
      }
    }
  }
  return { luma, width }
}

function decodeQr(luma, width) {
  const source = new RGBLuminanceSource(luma, width, width)
  return new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(source))).getText()
}

test('guest totals row keeps membership QR left of subtotal+nett; member hides QR', () => {
  const face = readFileSync(new URL('../dashboard/src/pos/pages/mirror-face.tsx', import.meta.url), 'utf8')
  const basketStart = face.indexOf('function BasketView')
  const basketEnd = face.indexOf('function PairScreen')
  const basket = face.slice(basketStart, basketEnd)

  assert.match(basket, /showJoinQr = !basket\.member/)
  assert.match(basket, /data-testid="mirror-totals-row"/)
  assert.match(basket, /data-testid="mirror-membership-qr"/)
  assert.match(basket, /renderFranMembershipQr\(MEMBERSHIP_SCAN_URL\)/)
  assert.match(basket, /aria-label="Scan to join membership"/)
  assert.match(basket, /Scan to join/)
  assert.doesNotMatch(face, /toDataURL/)
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

  assert.match(face, /MEMBERSHIP_QR_BOX = 'h-\[min\(3cm,7\.5rem\)\] w-\[min\(3cm,7\.5rem\)\] rounded-md'/)
  assert.match(basket, /\$\{MEMBERSHIP_QR_BOX\} bg-white/)
  assert.match(basket, /\$\{MEMBERSHIP_QR_BOX\} bg-surface-sunken/)
  assert.doesNotMatch(basket, /h-20 w-20/)
  assert.doesNotMatch(face, /MEMBERSHIP_QR_RASTER/)
  assert.ok(rowStart >= 0, 'totals row is present')
  assert.ok(row.indexOf('mirror-membership-qr') < row.indexOf('Subtotal'))
  assert.ok(row.indexOf('Subtotal') < row.indexOf('Nett'))
  assert.match(row, /items-center/)
  assert.match(row, /shrink-0 flex-col items-center/)
  assert.match(row, /min-w-0 flex-1/)
})

test('branded membership QR decodes the membership URL with the Fran eye', () => {
  const renderer = readFileSync(
    new URL('../dashboard/src/pos/mirror/fran-membership-qr.ts', import.meta.url),
    'utf8',
  )
  assert.match(renderer, /errorCorrectionLevel: 'H'/)

  for (const url of ['https://fran.sg/m', 'https://fran.sg/membership?store=orchard-01']) {
    const svg = renderFranMembershipQr(url)
    assert.equal(typeof svg, 'string')
    assert.match(svg, /#FFE14D/)
    assert.match(svg, /#3A2415/)
    assert.doesNotMatch(svg, /data:image\/png/)
    const { luma, width } = rasterize(svg, 8)
    assert.equal(decodeQr(luma, width), url)
    const moduleMm = 30 / Number(svg.match(/viewBox="0 0 ([0-9.]+)/)[1])
    assert.ok(moduleMm >= 0.7, `module ${moduleMm.toFixed(2)}mm stays readable inside 3cm`)
  }

  assert.equal(renderFranMembershipQr(''), null)
  assert.equal(renderFranMembershipQr('   '), null)
})

test('tap on the guest membership QR opens a QR-only enlarge modal at least 45vmin', () => {
  const face = readFileSync(new URL('../dashboard/src/pos/pages/mirror-face.tsx', import.meta.url), 'utf8')
  const basketStart = face.indexOf('function BasketView')
  const basketEnd = face.indexOf('function PairScreen')
  const basket = face.slice(basketStart, basketEnd)

  const box = face.match(/MEMBERSHIP_QR_ENLARGE_BOX = '([^']+)'/)
  assert.ok(box, 'enlarge box constant')
  const sides = [...box[1].matchAll(/\b(?:h|w)-\[(\d+(?:\.\d+)?)vmin\]/g)].map((match) => Number(match[1]))
  assert.equal(sides.length, 2)
  assert.equal(sides[0], sides[1])
  for (const side of sides) {
    assert.ok(side >= 45, `enlarge side ${side}vmin stays at least 45% of the shorter edge`)
  }

  assert.match(basket, /onClick=\{\(\) => setQrEnlarged\(true\)\}/)
  assert.match(basket, /if \(!joinQr && qrEnlarged\) setQrEnlarged\(false\)/)
  assert.match(basket, /<Dialog open=\{qrEnlarged\} onOpenChange=\{setQrEnlarged\}>/)
  assert.match(basket, /onClose=\{\(\) => setQrEnlarged\(false\)\}/)
  assert.match(basket, /data-testid="mirror-membership-qr-enlarged"/)
  assert.match(basket, /\$\{MEMBERSHIP_QR_ENLARGE_BOX\} bg-white/)
  assert.match(face, /MEMBERSHIP_QR_BOX = 'h-\[min\(3cm,7\.5rem\)\] w-\[min\(3cm,7\.5rem\)\] rounded-md'/)

  const liveStart = face.indexOf("if (state.kind !== 'live')")
  const live = face.slice(liveStart, face.indexOf('function FaceBody'))
  assert.match(live, /id="fran-overlay-root"/)

  const modalStart = basket.indexOf('data-testid="mirror-membership-qr-modal"')
  const modalEnd = basket.indexOf('</Dialog>', modalStart)
  assert.ok(modalStart >= 0 && modalEnd > modalStart, 'enlarge modal is in the basket')
  const modal = basket.slice(modalStart, modalEnd)
  assert.match(modal, /dangerouslySetInnerHTML=\{\{ __html: joinQr \}\}/)
  assert.equal(modal.includes('Scan to join'), false)
  assert.equal(/\b(?:navigate|href)\b/.test(modal), false)
})
