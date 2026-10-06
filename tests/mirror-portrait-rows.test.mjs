import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('mirror basket rows wrap the full line name and keep qty, price, and scroll', () => {
  const face = readFileSync(new URL('../dashboard/src/pos/pages/mirror-face.tsx', import.meta.url), 'utf8')
  const basketStart = face.indexOf('function BasketView')
  const basketEnd = face.indexOf('function PairScreen')
  const basket = face.slice(basketStart, basketEnd)
  const row = basket.match(/<li key=\{line\.id\}[\s\S]*?<\/li>/)

  assert.ok(row, 'BasketView renders a line row')
  assert.match(row[0], /py-8/)
  assert.match(row[0], /whitespace-normal/)
  assert.match(row[0], /break-words/)
  assert.match(row[0], /\{line\.name\}/)
  assert.match(row[0], /\{line\.qty\}/)
  assert.match(row[0], /line\.net/)
  assert.doesNotMatch(row[0], /truncate/)
  assert.match(basket, /data-testid="mirror-lines"/)
  assert.match(basket, /overflow-y-auto/)
  assert.match(row[0], /line-through/)
  assert.match(row[0], /line\.list/)
  assert.match(row[0], /line\.discount/)
  assert.match(row[0], /money\(line\.net\)/)
})

test('mirror wake and nav chrome stay on the mirror route and off the cashier sale page', () => {
  const face = readFileSync(new URL('../dashboard/src/pos/pages/mirror-face.tsx', import.meta.url), 'utf8')
  const orientation = readFileSync(new URL('../dashboard/src/pos/mirror/mirror-orientation.ts', import.meta.url), 'utf8')
  const activity = readFileSync(
    new URL('../android/app/src/main/java/com/fran/pos/MainActivity.java', import.meta.url),
    'utf8',
  )
  const sale = readFileSync(new URL('../dashboard/src/pos/pages/sale.tsx', import.meta.url), 'utf8')
  const onCreate = activity.slice(activity.indexOf('void onCreate'), activity.indexOf('attachMirrorOrientation'))

  assert.match(face, /useScreenWakeLock\(live\)/)
  assert.match(face, /useMirrorSession\(live\)/)
  assert.match(face, /const live = state\.kind === 'live'/)
  assert.match(face, /enterMirrorImmersive/)
  assert.match(face, /leaveMirrorImmersive/)
  assert.match(face, /releaseMirrorPath\(\)/)
  assert.match(orientation, /function postMirrorSession/)
  assert.match(orientation, /MIRROR_RELEASE_PATH = '\/pos\/sale'/)
  assert.match(orientation, /navigationUI: 'hide'/)
  assert.doesNotMatch(onCreate, /FLAG_KEEP_SCREEN_ON/)
  assert.match(activity, /void setSession\(boolean live\)/)
  assert.match(activity, /FLAG_KEEP_SCREEN_ON/)
  assert.match(activity, /clearFlags/)
  assert.match(activity, /navigationBars\(\)/)
  assert.match(activity, /BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE/)
  assert.doesNotMatch(sale, /postMirrorSession|enterMirrorImmersive|FLAG_KEEP_SCREEN_ON/)
})
