import { useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/providers/auth-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { getSafeRedirectPath } from '@/lib/auth-redirect'
import { AuthBrand } from '@/components/brand-mark'

export default function LoginPage() {
  const { signIn, signInWithGoogle, user, loading } = useAuth()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [googleSubmitting, setGoogleSubmitting] = useState(false)

  const redirectPath = getSafeRedirectPath(searchParams.get('redirect'))

  if (loading) return null
  if (user) return <Navigate to={redirectPath} replace />

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await signIn(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setSubmitting(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setError('')
    setGoogleSubmitting(true)
    try {
      await signInWithGoogle(redirectPath)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign in failed')
      setGoogleSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream p-4">
      <div className="w-full max-w-md">
        <AuthBrand subtitle="HQ dashboard, catalog, and live register" />
      <Card className="w-full">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Register</CardTitle>
          <CardDescription>Open the cashier register. HQ sign-in stays below.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            to="/pos?mode=demo"
            className="press inline-flex h-16 w-full items-center justify-center rounded-full bg-yellow text-lg font-semibold text-brown shadow-glow"
          >
            Open POS Register
          </Link>
          <details className="mt-4 rounded-md border border-dashed">
            <summary className="cursor-pointer list-none px-3 py-3 text-center text-sm text-muted-foreground">
              HQ sign in with Google or email
            </summary>
            <div className="px-3 pb-3">
              <Button
                type="button"
                variant="outline"
                className="mb-4 w-full"
                disabled={googleSubmitting}
                onClick={handleGoogleSignIn}
              >
                {googleSubmitting ? 'Opening Google...' : 'Continue with Google'}
              </Button>
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" variant="outline" className="w-full" disabled={submitting}>
                  {submitting ? 'Signing in...' : 'Sign In'}
                </Button>
                <p className="text-center text-sm text-muted-foreground">
                  Don't have an account?{' '}
                  <Link to="/register" className="text-primary underline">
                    Register
                  </Link>
                </p>
              </form>
            </div>
          </details>
        </CardContent>
      </Card>
      </div>
    </div>
  )
}
