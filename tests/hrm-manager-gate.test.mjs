import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const managerAuth = readFileSync(
  new URL('../dashboard/src/pos/components/manager-auth-modal.tsx', import.meta.url),
  'utf8',
)
const hrmPosAuth = readFileSync(new URL('../dashboard/src/pos/lib/hrm-pos-auth.ts', import.meta.url), 'utf8')
const posLogin = readFileSync(new URL('../dashboard/src/pos/pages/pos-login.tsx', import.meta.url), 'utf8')
const posUser = readFileSync(new URL('../dashboard/src/pos/data/mock.ts', import.meta.url), 'utf8')

test('Live manager gate verifies HRM PIN and never calls POS passcode RPC', () => {
  assert.match(managerAuth, /verifyHrmManagerPin/)
  assert.match(managerAuth, /loadRegisterBinding/)
  assert.doesNotMatch(managerAuth, /useAuthorizePosAction/)
  assert.doesNotMatch(managerAuth, /authorize_pos_action/)
  assert.doesNotMatch(managerAuth, /Invalid manager passcode/)
})

test('HRM manager+ allowlist covers POS roles and HRM matrix manager-level roles', () => {
  assert.match(hrmPosAuth, /export const HRM_MANAGER_PLUS_ROLES/)
  for (const role of ['manager', 'admin', 'hq_admin', 'owner', 'store_manager', 'area_manager']) {
    assert.match(hrmPosAuth, new RegExp(`'${role}'`))
  }
  assert.match(hrmPosAuth, /export function isHrmManagerPlus/)
  assert.match(hrmPosAuth, /export async function verifyHrmManagerPin/)
  assert.match(hrmPosAuth, /reason = 'not_manager'/)
  assert.match(hrmPosAuth, /This employee is not a manager, admin, HQ admin, or owner/)
})

test('Live manager PIN length matches unlock; demo keeps 9999', () => {
  assert.match(hrmPosAuth, /export const HRM_POS_PIN_DIGITS = 8/)
  assert.match(managerAuth, /HRM_POS_PIN_DIGITS/)
  assert.match(managerAuth, /Demo manager PIN: 9999/)
  assert.match(posLogin, /HRM_POS_PIN_DIGITS/)
  assert.match(posLogin, /hrmRole: staff\.role/)
  assert.match(posUser, /hrmRole\?: string/)
})
