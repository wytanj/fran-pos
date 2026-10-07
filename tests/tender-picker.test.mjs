import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('tender tiles stay in cashier order and do not auto-pick Stripe', () => {
  const connector = readFileSync(new URL('../dashboard/src/pos/lib/stripe-connector.ts', import.meta.url), 'utf8')
  assert.match(
    connector,
    /TENDER_TILE_ORDER = \[\s*'cash',\s*'paynow',\s*'stripe_s700',\s*'stripe_tap',\s*'gift-card',\s*'store-credit',\s*'wechat'/,
  )
  assert.match(connector, /isPrimaryTenderTile\(id: string\) \{\s*return id === 'cash' \|\| id === 'paynow'/)
  assert.match(connector, /if \(id === 'card'\) return !input\.stripeEnabled && !input\.tapReady/)

  const modal = readFileSync(new URL('../dashboard/src/pos/components/payment-modal.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(modal, /setMode\(preferred\)/)
  assert.doesNotMatch(modal, /autoPickedMode/)
  assert.match(modal, /pos_last_tender/)
  assert.match(modal, /Last used/)
  assert.match(modal, /auto-rows-fr grid-cols-2/)
  assert.match(modal, /min-h-28/)
  assert.doesNotMatch(modal, /min-h-40 text-2xl/)
  assert.doesNotMatch(modal, /isPrimaryTenderTile/)
  assert.doesNotMatch(modal, /primary\.map/)
  assert.match(modal, /modes\.map\(\(mode\) => tile\(mode\)\)/)
  assert.match(modal, /max-w-5xl/)
})

test('login leads with Open POS Register and collapses HQ sign-in', () => {
  const login = readFileSync(new URL('../dashboard/src/pages/auth/login.tsx', import.meta.url), 'utf8')
  const register = login.indexOf('Open POS Register')
  const details = login.indexOf('<details')
  const google = login.indexOf('Continue with Google')
  assert.ok(register >= 0 && details > register && google > details)
  assert.match(login, /to="\/pos\?mode=demo"/)
  assert.match(login, /signInWithGoogle\(redirectPath\)/)
  assert.match(login, /HQ sign in with Google or email/)
})

test('mirror face uses the tender banner and the done idle timer', () => {
  const face = readFileSync(new URL('../dashboard/src/pos/pages/mirror-face.tsx', import.meta.url), 'utf8')
  const sale = readFileSync(new URL('../dashboard/src/pos/pages/sale.tsx', import.meta.url), 'utf8')
  assert.match(face, /mirrorPayBanner/)
  assert.match(face, /mirrorAfterDoneIdle/)
  assert.match(face, /MIRROR_DONE_IDLE_MS/)
  assert.match(face, /Change due/)
  assert.doesNotMatch(face, /pay on the card reader/)
  assert.match(sale, /stashedMember\?\.mode === 'member'/)
  assert.match(sale, /activeTenderMode/)
  assert.match(sale, /onActiveTender=\{setActiveTenderMode\}/)
})
