import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/providers/auth-provider'

export function ProtectedRoute({
  children,
  allowMissingCompany = false,
}: {
  children: React.ReactNode
  allowMissingCompany?: boolean
}) {
  const { user, company, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!user) {
    const redirect = encodeURIComponent(`${location.pathname}${location.search}`)
    return <Navigate to={`/login?redirect=${redirect}`} replace />
  }

  if (!company && !allowMissingCompany) {
    return <Navigate to="/onboarding" replace />
  }

  return <>{children}</>
}
