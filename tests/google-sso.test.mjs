import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const authProvider = readFileSync(new URL('../dashboard/src/providers/auth-provider.tsx', import.meta.url), 'utf8')
const loginPage = readFileSync(new URL('../dashboard/src/pages/auth/login.tsx', import.meta.url), 'utf8')
const registerPage = readFileSync(new URL('../dashboard/src/pages/auth/register.tsx', import.meta.url), 'utf8')
const callbackPage = readFileSync(new URL('../dashboard/src/pages/auth/callback.tsx', import.meta.url), 'utf8')
const onboardingPage = readFileSync(new URL('../dashboard/src/pages/auth/onboarding.tsx', import.meta.url), 'utf8')
const protectedRoute = readFileSync(new URL('../dashboard/src/components/auth/protected-route.tsx', import.meta.url), 'utf8')
const routes = readFileSync(new URL('../dashboard/src/routes.tsx', import.meta.url), 'utf8')

test('POS auth provider supports Google OAuth with a production callback route', () => {
  assert.match(authProvider, /signInWithGoogle/)
  assert.match(authProvider, /signInWithOAuth\(/)
  assert.match(authProvider, /provider: 'google'/)
  assert.match(authProvider, /new URL\('\/auth\/callback', window\.location\.origin\)/)
  assert.match(authProvider, /scopes: 'email profile'/)
})

test('POS login and registration expose Google SSO actions', () => {
  assert.match(loginPage, /Continue with Google/)
  assert.match(loginPage, /signInWithGoogle\(redirectPath\)/)
  assert.match(registerPage, /Continue with Google/)
  assert.match(registerPage, /signInWithGoogle\('\/onboarding'\)/)
})

test('POS callback and route guard handle Google users without a company', () => {
  assert.match(routes, /path: '\/auth\/callback'/)
  assert.match(routes, /path: '\/onboarding'/)
  assert.match(callbackPage, /canOpenPosWithoutCompany/)
  assert.match(callbackPage, /redirectPath\.startsWith\('\/pos\?'\)/)
  assert.match(callbackPage, /navigate\(company \|\| canOpenPosWithoutCompany \? redirectPath : '\/onboarding'/)
  assert.match(protectedRoute, /allowMissingCompany/)
  assert.match(protectedRoute, /<Navigate to="\/onboarding" replace \/>/)
})

test('POS onboarding creates company/profile records after Google signup', () => {
  assert.match(authProvider, /createCompanyProfile/)
  assert.match(authProvider, /rpc\('create_company_profile'/)
  assert.match(onboardingPage, /Finish POS Setup/)
  assert.match(onboardingPage, /createCompanyProfile\(companyName, displayName \|\| suggestedName\)/)
  assert.match(onboardingPage, /\/pos\?mode=demo/)
})

test('POS database exposes an authenticated onboarding RPC', () => {
  const migration = readFileSync(new URL('../supabase/migrations/00003_create_company_profile_rpc.sql', import.meta.url), 'utf8')
  assert.match(migration, /create or replace function public\.create_company_profile/)
  assert.match(migration, /current_user_id uuid := auth\.uid\(\)/)
  assert.match(migration, /security definer/)
  assert.match(migration, /grant execute on function public\.create_company_profile\(text, text\) to authenticated/)
})
