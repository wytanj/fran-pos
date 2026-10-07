import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  HRM_CLOCK_PATH,
  clockInControls,
  hrmClockInBody,
  hrmStoreId,
  initialClockInStep,
  parseHrmClockRequest,
  reduceClockInStep,
} from '../dashboard/src/pos/lib/pos-clock-in.ts'

const STORE_ID = '11111111-1111-4111-8111-111111111111'

const modal = readFileSync(
  new URL('../dashboard/src/pos/components/pos-clock-in-modal.tsx', import.meta.url),
  'utf8',
)
const login = readFileSync(new URL('../dashboard/src/pos/pages/pos-login.tsx', import.meta.url), 'utf8')
const roster = readFileSync(new URL('../dashboard/src/pos/pages/roster.tsx', import.meta.url), 'utf8')
const proxy = readFileSync(new URL('../api/hrm-pos-clock.ts', import.meta.url), 'utf8')

test('clock-in stays on the photo step until a shot exists, then the PIN step', () => {
  const start = initialClockInStep()
  assert.deepEqual(clockInControls(start), { photo: true, pin: false, canContinue: false })

  const skipped = reduceClockInStep(start, { type: 'continue' })
  assert.equal(skipped.step, 'photo')
  assert.equal(clockInControls(skipped).pin, false)

  const blank = reduceClockInStep(start, { type: 'capture', photo: '   ' })
  assert.equal(blank.step, 'photo')
  assert.equal(blank.shot, null)

  const shot = reduceClockInStep(start, { type: 'capture', photo: 'data:image/jpeg;base64,abc' })
  assert.equal(shot.step, 'photo')
  assert.equal(clockInControls(shot).canContinue, true)
  assert.equal(clockInControls(shot).pin, false)

  const pin = reduceClockInStep(shot, { type: 'continue' })
  assert.deepEqual(clockInControls(pin), { photo: false, pin: true, canContinue: false })
  assert.equal(pin.step, 'pin')

  const retake = reduceClockInStep(pin, { type: 'retake' })
  assert.deepEqual(retake, { step: 'photo', shot: null })
})

test('clock proxy body is clock_in for fran-hrm and drops a photo', () => {
  assert.equal(HRM_CLOCK_PATH, '/api/v1/clock')
  assert.equal(hrmStoreId('FRAN01'), null)
  assert.equal(parseHrmClockRequest({ staff_id: 'staff-1', store_id: 'FRAN01', photo: 'data:image/jpeg;base64,abc' }), null)
  const parsed = parseHrmClockRequest({
    staff_id: 'staff-1',
    store_id: STORE_ID,
    photo: 'data:image/jpeg;base64,abc',
  })
  assert.ok(parsed)
  const body = hrmClockInBody(parsed)
  assert.deepEqual(body, {
    action: 'clock_in',
    staff_id: 'staff-1',
    store_id: STORE_ID,
  })
  assert.equal(Object.hasOwn(body, 'photo'), false)
  assert.match(proxy, /FRAN_HRM_URL/)
  assert.match(proxy, /FRAN_HRM_API_KEY/)
  assert.match(proxy, /parseHrmClockRequest/)
  assert.match(proxy, /hrmClockInBody\(ids\)/)
  assert.match(proxy, /HRM_CLOCK_PATH/)
  assert.match(proxy, /attendance:write/)
})

test('login and roster both open the shared photo-then-PIN modal', () => {
  const unlockHeading = login.indexOf('Unlock register')
  assert.ok(unlockHeading > 0)
  assert.equal(login.slice(0, unlockHeading).includes('Clock in'), false)
  assert.match(login.slice(unlockHeading), /Clock in/)
  assert.match(login, /<PosClockInModal/)

  const zones = roster.indexOf('(board?.zones || []).map')
  const afterZones = roster.slice(zones)
  const clock = afterZones.indexOf('Clock in')
  assert.ok(clock > 0)
  assert.match(afterZones, /<PosClockInModal open=/)

  assert.match(modal, /clockInControls/)
  assert.match(modal, /getUserMedia/)
  assert.match(modal, /type="file"/)
  assert.match(modal, /accept="image\/\*"/)
  assert.match(modal, /verifyHrmPosPin/)
  assert.match(modal, /clockHrmPosIn\(\{\s*staffId:/)
  assert.doesNotMatch(modal, /clockHrmPosIn\([\s\S]{0,160}photo/)
})
