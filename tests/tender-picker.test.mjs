import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const { isPrimaryTenderTile, visiblePaymentModes } = await import('../dashboard/src/pos/lib/stripe-connector.ts')

test('tender tiles stay in cashier order and do not auto-pick Stripe', () => {
  const modes = visiblePaymentModes({ stripeEnabled: true, s700Ready: true, tapReady: true })
  assert.deepEqual(modes.slice(0, 7), ['cash', 'paynow', 'stripe_s700', 'stripe_tap', 'gift-card', 'store-credit', 'wechat'])
  assert.equal(modes[7], 'misc')
  assert.equal(modes.includes('card'), false)
  assert.equal(isPrimaryTenderTile('cash'), true)
  assert.equal(isPrimaryTenderTile('paynow'), true)
  assert.equal(isPrimaryTenderTile('stripe_s700'), false)

  const modal = readFileSync(new URL('../dashboard/src/pos/components/payment-modal.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(modal, /setMode\(preferred\)/)
  assert.doesNotMatch(modal, /autoPickedMode/)
  assert.match(modal, /pos_last_tender/)
  assert.match(modal, /Last used/)
  assert.match(modal, /min-h-40 text-2xl/)
  assert.match(modal, /min-h-28 text-lg/)
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
