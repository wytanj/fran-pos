export function getSafeRedirectPath(value: string | null | undefined): string {
  if (!value) return '/'
  if (!value.startsWith('/') || value.startsWith('//')) return '/'
  if (value.startsWith('/auth/') || value === '/login' || value === '/register') return '/'
  // Allow invite accept after OAuth
  if (value.startsWith('/invite/')) return value
  return value
}
