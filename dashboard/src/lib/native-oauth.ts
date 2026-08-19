import { Capacitor } from '@capacitor/core'
import { supabase } from '@/lib/supabase'

export const NATIVE_OAUTH_SCHEME = 'com.fran.pos'
/** Add this exact value to Supabase Auth redirect URLs: com.fran.pos://auth/callback */
export const NATIVE_OAUTH_CALLBACK = `${NATIVE_OAUTH_SCHEME}://auth/callback`
const OAUTH_REDIRECT_STORAGE_KEY = 'fran_oauth_redirect'

export function isNativeApp() {
  return Capacitor.isNativePlatform()
}

export function oauthRedirectTo(redirectPath = '/') {
  const callbackUrl = new URL('/auth/callback', window.location.origin)
  if (redirectPath !== '/') callbackUrl.searchParams.set('redirect', redirectPath)
  if (!isNativeApp()) return callbackUrl.toString()
  try {
    localStorage.setItem(OAUTH_REDIRECT_STORAGE_KEY, redirectPath)
  } catch {
    /* ignore quota / private mode */
  }
  return NATIVE_OAUTH_CALLBACK
}

export function parseOAuthRedirectPath(url: string) {
  try {
    const parsed = new URL(url)
    const fromUrl = parsed.searchParams.get('redirect')
    if (fromUrl) return fromUrl
  } catch {
    /* ignore invalid callback urls */
  }
  try {
    return localStorage.getItem(OAUTH_REDIRECT_STORAGE_KEY) || '/'
  } catch {
    return '/'
  }
}

export async function completeNativeOAuth(url: string) {
  if (!url.startsWith(`${NATIVE_OAUTH_SCHEME}:`) && !url.includes('/auth/callback')) {
    return { ok: false as const, redirectPath: '/' }
  }

  const parsed = new URL(url)
  const error = parsed.searchParams.get('error_description') || parsed.searchParams.get('error')
  if (error) throw new Error(error)

  const code = parsed.searchParams.get('code')
  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
    if (exchangeError) throw exchangeError
  } else {
    const hash = parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash
    const hashParams = new URLSearchParams(hash)
    const accessToken = hashParams.get('access_token')
    const refreshToken = hashParams.get('refresh_token')
    if (accessToken && refreshToken) {
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })
      if (sessionError) throw sessionError
    }
  }

  return { ok: true as const, redirectPath: parseOAuthRedirectPath(url) }
}
