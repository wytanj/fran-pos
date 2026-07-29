import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/providers/auth-provider'
import {
  acceptCompanyInvite,
  listMyPendingCompanyInvites,
  type PendingCompanyInvite,
} from '@/hooks/use-company-invites'

export default function OnboardingPage() {
  const { user, company, createCompanyProfile, loading, switchCompany } = useAuth()
  const navigate = useNavigate()
  const suggestedName = useMemo(() => {
    const metadata = user?.user_metadata ?? {}
    return metadata.display_name || metadata.full_name || metadata.name || user?.email || ''
  }, [user])

  const [companyName, setCompanyName] = useState('')
  const [displayName, setDisplayName] = useState(suggestedName)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [pendingInvites, setPendingInvites] = useState<PendingCompanyInvite[]>([])
  const [loadingInvites, setLoadingInvites] = useState(true)
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    if (!displayName && suggestedName) setDisplayName(suggestedName)
  }, [displayName, suggestedName])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    setLoadingInvites(true)
    listMyPendingCompanyInvites()
      .then((rows) => {
        if (!cancelled) {
          setPendingInvites(rows)
          setShowCreate(rows.length === 0)
        }
      })
      .catch(() => {
        if (!cancelled) setShowCreate(true)
      })
      .finally(() => {
        if (!cancelled) setLoadingInvites(false)
      })
    return () => {
      cancelled = true
    }
  }, [user])

  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  if (company) return <Navigate to="/" replace />

  const handleAcceptInvite = async (token: string, companyId: string) => {
    setError('')
    setSubmitting(true)
    try {
      await acceptCompanyInvite(token)
      await switchCompany(companyId)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join company')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await createCompanyProfile(companyName, displayName || suggestedName)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Company setup failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">
            {pendingInvites.length > 0 ? 'Join your team' : 'Finish POS Setup'}
          </CardTitle>
          <CardDescription>
            {pendingInvites.length > 0
              ? 'You have pending invites. Join an existing Fran company instead of creating a new one.'
              : 'Create the company record for this Google account (founders only).'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}

          {loadingInvites && (
            <p className="text-center text-sm text-muted-foreground">Checking invites…</p>
          )}

          {!loadingInvites && pendingInvites.length > 0 && (
            <div className="space-y-3">
              {pendingInvites.map((inv) => (
                <div key={inv.id} className="rounded-lg border p-4">
                  <p className="font-semibold">{inv.company_name}</p>
                  <p className="text-sm text-muted-foreground capitalize">Role: {inv.role}</p>
                  <Button
                    className="mt-3 w-full"
                    disabled={submitting}
                    onClick={() => handleAcceptInvite(inv.token, inv.company_id)}
                  >
                    {submitting ? 'Joining…' : `Join ${inv.company_name}`}
                  </Button>
                </div>
              ))}
              {!showCreate && (
                <button
                  type="button"
                  className="w-full text-center text-sm text-muted-foreground underline"
                  onClick={() => setShowCreate(true)}
                >
                  Create a new company instead
                </button>
              )}
            </div>
          )}

          {showCreate && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {pendingInvites.length > 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Creating a new company starts a separate catalog and SKUMS connector. Prefer joining if you were invited.
                </p>
              )}
              <div className="space-y-2">
                <Label htmlFor="companyName">Business Name</Label>
                <Input
                  id="companyName"
                  placeholder="Fran"
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="displayName">Your Name</Label>
                <Input
                  id="displayName"
                  placeholder="Your name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Creating company...' : 'Create Company'}
              </Button>
            </form>
          )}

          <div className="rounded-md border border-dashed p-3 text-center text-sm">
            <p className="text-muted-foreground">Need the cashier terminal first?</p>
            <Link to="/pos?mode=demo" className="font-medium text-primary underline">
              Open Cashier Demo
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
