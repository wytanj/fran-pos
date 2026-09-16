import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(new URL('../supabase/migrations/00004_create_pos_staff_access.sql', import.meta.url), 'utf8')
const staffHook = readFileSync(new URL('../dashboard/src/hooks/use-pos-staff.ts', import.meta.url), 'utf8')
const staffSettings = readFileSync(new URL('../dashboard/src/pages/settings/staff.tsx', import.meta.url), 'utf8')
const posLogin = readFileSync(new URL('../dashboard/src/pos/pages/pos-login.tsx', import.meta.url), 'utf8')
const managerAuth = readFileSync(new URL('../dashboard/src/pos/components/manager-auth-modal.tsx', import.meta.url), 'utf8')

test('POS staff schema keeps roster identity separate from dashboard profiles', () => {
  assert.match(migration, /create table public\.pos_identity_sources/)
  assert.match(migration, /create table public\.pos_staff_members/)
  assert.match(migration, /source_provider text not null default 'manual'/)
  assert.match(migration, /external_subject_id text/)
  assert.match(migration, /is_eor boolean not null default false/)
  assert.match(migration, /eor_provider text/)
  assert.match(migration, /profile_id uuid references public\.profiles\(id\) on delete set null/)
})

test('POS passcodes are hashed and verified server-side', () => {
  assert.match(migration, /create table public\.pos_staff_passcodes/)
  assert.match(migration, /passcode_hash text not null/)
  assert.doesNotMatch(migration, /passcode text not null/)
  assert.match(migration, /crypt\(p_passcode, gen_salt\('bf'\)\)/)
  assert.match(migration, /passcode_row\.passcode_hash <> crypt\(p_passcode, passcode_row\.passcode_hash\)/)
  assert.match(migration, /locked_until = case when failed_attempts \+ 1 >= 5/)
})

test('POS staff API is source-neutral for future external sync', () => {
  assert.match(migration, /create or replace function public\.upsert_pos_staff_from_source/)
  assert.match(migration, /on conflict \(company_id, source_provider, external_subject_id\)/)
  assert.match(staffHook, /useCreatePosStaffMember/)
  assert.match(staffHook, /useStartPosStaffSession/)
  assert.match(staffHook, /useAuthorizePosAction/)
  assert.match(staffSettings, /Roster Sync Contract/)
  assert.match(staffSettings, /source_provider/)
})

test('Live POS unlock uses HRM employee code + PIN', () => {
  assert.match(posLogin, /verifyHrmPosPin/)
  assert.match(posLogin, /employeeCode: staff\.employee_code/)
  assert.match(posLogin, /hrmRole: staff\.role/)
  assert.doesNotMatch(posLogin, /useStartPosStaffSession/)
})

test('Live manager authorization uses HRM PIN, not POS staff passcodes', () => {
  assert.match(managerAuth, /verifyHrmManagerPin/)
  assert.doesNotMatch(managerAuth, /useAuthorizePosAction/)
  assert.doesNotMatch(managerAuth, /authorize_pos_action/)
})
