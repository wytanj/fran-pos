import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/providers/auth-provider'
import {
  acceptCompanyInvite,
  previewCompanyInvite,
  type CompanyInvitePreview,
} from '@/hooks/use-company-invites'
import { AuthBrand } from '@/components/brand-mark'

export default function CompanyInvitePage() {
  const { token = '' } = useParams()
  const { user, loading, signInWithGoogle, switchCompany } = useAuth()
  const navigate = useNavigate()

  const [preview, setPreview] = useState<CompanyInvitePreview | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loadingPreview, setLoadingPreview] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoadingPreview(true)
    previewCompanyInvite(token)
      .then((data) => {
        if (!cancelled) setPreview(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load invite')
      })
      .finally(() => {
        if (!cancelled) setLoadingPreview(false)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const handleAccept = async () => {
    if (!token) return
    setBusy(true)
    setError('')
    try {
      const result = await acceptCompanyInvite(token)
      if (result.company_id) {
        await switchCompany(result.company_id)
      }
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept invite')
    } finally {
      setBusy(false)
    }
  }

  const handleGoogle = async () => {
    setBusy(true)
    try {
      await signInWithGoogle(`/invite/${token}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed')
      setBusy(false)
    }
  }

  if (loading || loadingPreview) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream p-4">
        <p className="text-sm text-muted-foreground">Loading invite…</p>
      </div>
    )
  }

  const pending = preview?.status === 'pending'
  const companyName = preview?.company_name || 'Fran POS company'

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream p-4">
      <div className="w-full max-w-md">
        <AuthBrand subtitle="Accept your company invitation" />
      <Card className="w-full">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Join {companyName}</CardTitle>
          <CardDescription>
            {pending
              ? `You were invited as ${preview?.role || 'member'}. Sign in with Google using ${preview?.email || 'the invited email'}.`
              : preview?.status === 'not_found'
                ? 'This invite link is invalid.'
                : `This invite is ${preview?.status || 'unavailable'}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}

          {pending && !user && (
            <Button className="w-full" onClick={handleGoogle} disabled={busy}>
              {busy ? 'Opening Google…' : 'Continue with Google'}
            </Button>
          )}

          {pending && user && (
            <>
              <p className="text-center text-sm text-muted-foreground">
                Signed in as <strong>{user.email}</strong>
              </p>
              <Button className="w-full" onClick={handleAccept} disabled={busy}>
                {busy ? 'Joining…' : `Join ${companyName}`}
              </Button>
            </>
          )}

          {!pending && (
            <Link to={user ? '/' : '/login'}>
              <Button className="w-full" variant="outline">
                {user ? 'Go to dashboard' : 'Sign in'}
              </Button>
            </Link>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  )
}
