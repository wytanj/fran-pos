import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8')

test('clock-in steps are photo then pin', () => {
  const src = read('../dashboard/src/pos/lib/hrm-pos-clock.ts')
  assert.match(src, /POS_CLOCK_IN_STEPS = \['photo', 'pin'\]/)
})

test('shared modal is mounted on pre-Live login and below roster', () => {
  const login = read('../dashboard/src/pos/pages/pos-login.tsx')
  const roster = read('../dashboard/src/pos/pages/roster.tsx')
  const modal = read('../dashboard/src/pos/components/pos-clock-in-modal.tsx')
  const proxy = read('../api/hrm-pos-clock.ts')
  assert.match(login, /pos-clock-in-prelive/)
  assert.match(login, /PosClockInModal/)
  assert.match(roster, /pos-clock-in-roster/)
  assert.match(roster, /PosClockInModal/)
  assert.match(modal, /data-testid="pos-clock-in-photo"/)
  assert.match(modal, /data-testid="pos-clock-in-pin"/)
  assert.match(modal, /Continue to PIN/)
  assert.match(modal, /verifyHrmPosPin/)
  assert.match(modal, /clockInViaHrm/)
  assert.match(proxy, /\/api\/v1\/clock/)
  assert.match(proxy, /FRAN_HRM_API_KEY/)
})
