import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertCircle, KeyRound, LogOut, Shield, ShoppingBag, Tablet, User, Wifi } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Numpad } from '@/pos/components/numpad'
import { usePos } from '@/pos/lib/pos-context'
import { USERS, STORE, type PosRole } from '@/pos/data/mock'
import { cn } from '@/lib/utils'
import { useAuth } from '@/providers/auth-provider'
import { BrandMark } from '@/components/brand-mark'
import {
  clearRegisterBinding,
  loadRegisterBinding,
  pairRegisterDevice,
  verifyHrmPosPin,
  type RegisterBinding,
} from '@/pos/lib/hrm-pos-auth'

export default function PosLogin() {
  const { mode, setMode, setUser } = usePos()
  const { user, company, signInWithGoogle, signOut } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [role, setRole] = useState<PosRole>('cashier')
  const [pin, setPin] = useState('')
  const [employeeCode, setEmployeeCode] = useState('')
  const [error, setError] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [unlocking, setUnlocking] = useState(false)
  const [binding, setBinding] = useState<RegisterBinding | null>(() =>
    typeof window !== 'undefined' ? loadRegisterBinding() : null
  )
  const [storeCode, setStoreCode] = useState('')
  const [pairCode, setPairCode] = useState('')
  const [pairing, setPairing] = useState(false)
  const requestedMode = searchParams.get('mode')
  const connectedAccountLabel = company?.name || user?.email || null

  useEffect(() => {
    if (requestedMode === 'demo' || requestedMode === 'live') setMode(requestedMode)
  }, [requestedMode, setMode])

  useEffect(() => {
    setBinding(loadRegisterBinding())
  }, [mode])

  const submit = () => {
    const demoUser = USERS.find((u) => u.role === role && u.pin === pin)
    if (demoUser) {
      setMode('demo')
      setUser(demoUser)
      navigate('/pos/sale')
    } else {
      setError(true)
    }
  }

  const selected = USERS.find((u) => u.role === role)

  const handleGoogleSignIn = async () => {
    // HQ / dashboard Google — not used for Live register unlock (P0).
    setGoogleLoading(true)
    try {
      await signInWithGoogle('/')
    } finally {
      setGoogleLoading(false)
    }
  }

  const handleDemoAccountSignIn = async () => {
    setGoogleLoading(true)
    try {
      await signInWithGoogle('/pos?mode=demo')
    } finally {
      setGoogleLoading(false)
    }
  }

  const handleGoogleSignOut = async () => {
    setSigningOut(true)
    setError(false)
    setPin('')
    try {
      await signOut()
    } finally {
      setSigningOut(false)
    }
  }

  const handlePair = async () => {
    setPairing(true)
    setError(false)
    setErrorMessage(null)
    try {
      const next = await pairRegisterDevice({ storeCode, pairCode })
      setBinding(next)
      setStoreCode('')
      setPairCode('')
    } catch (e) {
      setError(true)
      setErrorMessage(e instanceof Error ? e.message : 'Pair failed')
    } finally {
      setPairing(false)
    }
  }

  const handleUnbind = () => {
    clearRegisterBinding()
    setBinding(null)
    setPin('')
    setEmployeeCode('')
  }

  const openLiveWithHrmPin = async () => {
    if (!binding) return
    setUnlocking(true)
    setError(false)
    setErrorMessage(null)
    try {
      const { staff } = await verifyHrmPosPin({
        employeeCode,
        pin,
        binding,
      })
      const posRole: PosRole =
        staff.role === 'cashier' || staff.role === 'staff' || staff.role === 'supervisor'
          ? 'cashier'
          : 'manager'
      setPin('')
      setMode('live')
      setUser({
        id: staff.id,
        name: staff.display_name,
        role: posRole,
        pin: '',
        staffMemberId: staff.id,
        sessionId: `hrm:${staff.id}:${Date.now()}`,
        sourceProvider: 'fran-hrm',
        employmentType: staff.employment_type,
        hrmEmployeeId: staff.id,
        employeeCode: staff.employee_code,
        registerId: binding.register_id,
        storeCode: binding.store_code,
      })
      navigate('/pos/sale')
    } catch (e) {
      setError(true)
      setErrorMessage(e instanceof Error ? e.message : 'Unlock failed')
    } finally {
      setUnlocking(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-cream p-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="w-full max-w-3xl rounded-xl border border-line bg-white p-4 shadow-warm-md sm:p-6">
        <div className="mb-3 flex flex-col items-center text-center">
          <BrandMark size="sm" className="mb-1.5" />
          <p className="eyebrow">Register</p>
          <h1 className="h1-display leading-tight">Fran POS</h1>
          <p className="text-sm text-muted-foreground">
            {binding ? `${binding.store_code} · ${binding.register_id}` : `${STORE.name} - Store ${STORE.code}`}
          </p>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2 rounded-sm bg-surface-sunken p-1">
          <button
            type="button"
            onClick={() => setMode('demo')}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              mode === 'demo' ? 'bg-white font-semibold text-brown shadow-warm-xs' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Demo mode
          </button>
          <button
            type="button"
            onClick={() => setMode('live')}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              mode === 'live' ? 'bg-white font-semibold text-brown shadow-warm-xs' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Live mode
          </button>
        </div>

        {mode === 'live' ? (
          <div className="space-y-3">
            {!binding ? (
              <div className="space-y-3 rounded-lg border p-4">
                <div className="text-center">
                  <Tablet className="mx-auto mb-3 h-8 w-8 text-primary" />
                  <h2 className="font-semibold">Bind this register</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Enter the store code and pair code from HRM / ops. No Google on the register.
                  </p>
                </div>
                <label className="block text-sm">
                  <span className="text-muted-foreground">Store code</span>
                  <input
                    className="mt-1 w-full rounded-md border px-3 py-2 font-mono uppercase"
                    value={storeCode}
                    onChange={(e) => setStoreCode(e.target.value.toUpperCase())}
                    placeholder="FRAN01"
                    autoCapitalize="characters"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-muted-foreground">Pair code</span>
                  <input
                    className="mt-1 w-full rounded-md border px-3 py-2 font-mono uppercase tracking-widest"
                    value={pairCode}
                    onChange={(e) => setPairCode(e.target.value.toUpperCase())}
                    placeholder="A1B2C3"
                    autoCapitalize="characters"
                  />
                </label>
                {error && (
                  <div className="flex items-center justify-center gap-1.5 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4" /> {errorMessage || 'Pair failed'}
                  </div>
                )}
                <Button
                  className="w-full"
                  onClick={() => void handlePair()}
                  disabled={storeCode.length < 2 || pairCode.length < 4 || pairing}
                >
                  {pairing ? 'Binding…' : 'Bind register'}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  HQ web login stays on the dashboard — not on Live POS.
                </p>
              </div>
            ) : (
              <div className="space-y-4 rounded-lg border p-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-semibold">Unlock register</h2>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      Employee code + 8-digit PIN from fran-hrm.
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Bound · {binding.store_code} / {binding.register_id}
                      {binding.label ? ` · ${binding.label}` : ''}
                    </p>
                  </div>
                  <span className="rounded-full bg-success-soft px-2.5 py-1 text-xs font-medium text-success">Live</span>
                </div>

                <label className="block text-sm">
                  <span className="text-muted-foreground">Employee code</span>
                  <input
                    className="mt-1 w-full rounded-md border px-3 py-2 font-mono uppercase"
                    value={employeeCode}
                    onChange={(e) => {
                      setEmployeeCode(e.target.value.toUpperCase())
                      setError(false)
                    }}
                    placeholder="E12345"
                    autoCapitalize="characters"
                  />
                </label>

                <div className="rounded-lg bg-secondary p-3">
                  <div className="mb-2 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <KeyRound className="h-4 w-4" />
                    8-digit PIN
                  </div>
                  <div className="mb-2 flex justify-center gap-2">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className={cn('h-3.5 w-3.5 rounded-full', i < pin.length ? 'bg-primary' : 'bg-muted')} />
                    ))}
                  </div>
                  {error && (
                    <div className="mb-3 flex items-center justify-center gap-1.5 text-sm text-destructive">
                      <AlertCircle className="h-4 w-4" /> {errorMessage || 'Incorrect or locked PIN'}
                    </div>
                  )}
                  <Numpad
                    dense
                    onPress={(k) => {
                      setError(false)
                      setPin((p) => (p.length < 8 ? p + k : p))
                    }}
                    onBackspace={() => {
                      setError(false)
                      setPin((p) => p.slice(0, -1))
                    }}
                  />
                  <Button
                    className="mt-3 h-10 w-full text-base"
                    onClick={() => void openLiveWithHrmPin()}
                    disabled={employeeCode.length < 1 || pin.length !== 8 || unlocking}
                  >
                    <ShoppingBag className="h-4 w-4" />
                    {unlocking ? 'Checking…' : 'Unlock'}
                  </Button>
                </div>

                <Button variant="outline" className="h-9 w-full" onClick={handleUnbind}>
                  <LogOut className="h-4 w-4" />
                  Unbind this tablet
                </Button>
              </div>
            )}
          </div>
        ) : (
          <>
            {user ? (
              <div className="mb-4 rounded-lg border bg-muted/40 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Connected demo account</p>
                    <p className="truncate text-xs text-muted-foreground">{connectedAccountLabel}</p>
                  </div>
                  <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground">Demo</span>
                </div>
                {!company && (
                  <Link to="/onboarding" className="mt-2 inline-block text-xs font-medium text-primary underline">
                    Finish company setup
                  </Link>
                )}
                <Button
                  variant="outline"
                  className="mt-2 h-9 w-full"
                  onClick={() => void handleGoogleSignOut()}
                  disabled={signingOut}
                >
                  <LogOut className="h-4 w-4" />
                  {signingOut ? 'Signing out...' : 'Use another Google account'}
                </Button>
              </div>
            ) : (
              <div className="mb-4 flex flex-col gap-3 rounded-lg border border-dashed p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium">Standalone cashier demo</p>
                  <p className="text-xs text-muted-foreground">Optional: connect a Google account for demo extras.</p>
                </div>
                <Button variant="outline" onClick={handleDemoAccountSignIn} disabled={googleLoading}>
                  {googleLoading ? 'Connecting...' : 'Connect Account'}
                </Button>
              </div>
            )}

            <div className="mb-4 grid grid-cols-2 gap-2">
              {(
                [
                  { role: 'cashier' as const, icon: User, label: 'Cashier' },
                  { role: 'manager' as const, icon: Shield, label: 'Manager' },
                ]
              ).map((r) => (
                <button
                  key={r.role}
                  onClick={() => {
                    setRole(r.role)
                    setPin('')
                    setError(false)
                  }}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors cursor-pointer',
                    role === r.role ? 'border-yellow bg-yellow font-semibold text-brown' : 'hover:bg-surface-sunken'
                  )}
                >
                  <r.icon className="h-4 w-4" />
                  {r.label}
                </button>
              ))}
            </div>

            <p className="mb-2 text-center text-sm text-muted-foreground">
              Enter PIN for <span className="font-medium text-foreground">{selected?.name}</span>
            </p>

            <div className="mb-2 flex justify-center gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className={cn('h-3.5 w-3.5 rounded-full', i < pin.length ? 'bg-primary' : 'bg-muted')} />
              ))}
            </div>

            {error && (
              <div className="mb-3 flex items-center justify-center gap-1.5 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" /> Incorrect PIN, try again
              </div>
            )}

            <Numpad
              dense
              onPress={(k) => {
                setError(false)
                setPin((p) => (p.length < 4 ? p + k : p))
              }}
              onBackspace={() => {
                setError(false)
                setPin((p) => p.slice(0, -1))
              }}
            />

            <Button className="mt-3 h-10 w-full text-base" onClick={submit} disabled={pin.length < 4}>
              Sign In
            </Button>

            <p className="mt-2 text-center text-xs text-muted-foreground">
              Demo PINs - Cashier: <span className="font-mono">1111</span> - Manager:{' '}
              <span className="font-mono">9999</span>
            </p>

            {/* HQ Google remains available off Live — e.g. open dashboard */}
            {!user && (
              <Button variant="ghost" className="mt-2 w-full text-xs text-muted-foreground" onClick={() => void handleGoogleSignIn()} disabled={googleLoading}>
                <Wifi className="h-3 w-3" />
                HQ dashboard Google sign-in
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
