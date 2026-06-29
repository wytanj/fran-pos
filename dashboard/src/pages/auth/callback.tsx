import { useEffect, useMemo } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/providers/auth-provider'
import { getSafeRedirectPath } from '@/lib/auth-redirect'

export default function AuthCallbackPage() {
  const { user, company, loading } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const redirectPath = useMemo(
    () => getSafeRedirectPath(searchParams.get('redirect')),
    [searchParams]
  )
  const authError = searchParams.get('error_description') || searchParams.get('error')
  const canOpenPosWithoutCompany =
    redirectPath === '/pos' || redirectPath.startsWith('/pos/') || redirectPath.startsWith('/pos?')

  useEffect(() => {
    if (loading || authError) return
    if (!user) return
    navigate(company || canOpenPosWithoutCompany ? redirectPath : '/onboarding', { replace: true })
  }, [authError, canOpenPosWithoutCompany, company, loading, navigate, redirectPath, user])

  if (!loading && !authError && !user) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">
            {authError ? 'Sign in failed' : 'Completing sign in'}
          </CardTitle>
          <CardDescription>
            {authError || 'We are finishing your Google sign in.'}
          </CardDescription>
        </CardHeader>
        {authError && (
          <CardContent>
            <Link to="/login">
              <Button className="w-full">Back to Sign In</Button>
            </Link>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
