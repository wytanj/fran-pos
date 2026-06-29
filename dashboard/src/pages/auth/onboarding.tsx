import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/providers/auth-provider'

export default function OnboardingPage() {
  const { user, company, createCompanyProfile, loading } = useAuth()
  const navigate = useNavigate()
  const suggestedName = useMemo(() => {
    const metadata = user?.user_metadata ?? {}
    return metadata.display_name || metadata.full_name || metadata.name || user?.email || ''
  }, [user])

  const [companyName, setCompanyName] = useState('')
  const [displayName, setDisplayName] = useState(suggestedName)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!displayName && suggestedName) setDisplayName(suggestedName)
  }, [displayName, suggestedName])

  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  if (company) return <Navigate to="/" replace />

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
          <CardTitle className="text-2xl">Finish POS Setup</CardTitle>
          <CardDescription>Create the company record for this Google account.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
            )}
            <div className="space-y-2">
              <Label htmlFor="companyName">Business Name</Label>
              <Input
                id="companyName"
                placeholder="LISE Beauty"
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
          <div className="mt-4 rounded-md border border-dashed p-3 text-center text-sm">
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
