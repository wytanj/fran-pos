import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const mig = readFileSync(new URL('../supabase/migrations/00014_company_invites.sql', import.meta.url), 'utf8')
const teamPage = readFileSync(new URL('../dashboard/src/pages/settings/team.tsx', import.meta.url), 'utf8')
const invitePage = readFileSync(new URL('../dashboard/src/pages/auth/invite.tsx', import.meta.url), 'utf8')
const onboarding = readFileSync(new URL('../dashboard/src/pages/auth/onboarding.tsx', import.meta.url), 'utf8')
const routes = readFileSync(new URL('../dashboard/src/routes.tsx', import.meta.url), 'utf8')
const hooks = readFileSync(new URL('../dashboard/src/hooks/use-company-invites.ts', import.meta.url), 'utf8')

test('POS company invites migration defines accept RPC and RLS', () => {
  assert.match(mig, /create table if not exists public\.company_invites/)
  assert.match(mig, /accept_company_invite/)
  assert.match(mig, /get_company_invite_preview/)
  assert.match(mig, /list_my_pending_company_invites/)
  assert.match(mig, /user_has_role\(company_id, array\['owner', 'admin'\]/)
  assert.match(mig, /This invite was sent to a different email address/)
  assert.match(mig, /insert into public\.profiles/)
})

test('POS team UI and invite routes exist', () => {
  assert.match(routes, /invite\/:token/)
  assert.match(routes, /settings\/team/)
  assert.match(teamPage, /Dashboard team/)
  assert.match(teamPage, /Copy link/)
  assert.match(invitePage, /Join/)
  assert.match(invitePage, /acceptCompanyInvite/)
  assert.match(onboarding, /listMyPendingCompanyInvites/)
  assert.match(onboarding, /Join your team/)
  assert.match(hooks, /accept_company_invite/)
})
