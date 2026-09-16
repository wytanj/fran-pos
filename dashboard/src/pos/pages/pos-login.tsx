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
  HRM_POS_PIN_DIGITS,
  clearRegisterBinding,
  isHrmManagerPlus,
  loadRegisterBinding,
  pairRegisterDevice,
  verifyHrmPosPin,
  type RegisterBinding,
} from '@/pos/lib/hrm-pos-auth'

export default function PosLogin() {
  const { mode, setMode, setUser } = usePos()
  const { user, company, signInWithGoogle, signOut, hydrateRegisterCompany } = useAuth()
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
      await hydrateRegisterCompany(binding)
      if (!staff?.role) {
        throw new Error('HRM verify returned no staff role')
      }
      const posRole: PosRole = isHrmManagerPlus(staff.role) ? 'manager' : 'cashier'
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
        hrmRole: staff.role,
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
    <div className="flex min-h-dvh flex-col bg-cream p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col rounded-xl border border-line bg-white p-3 shadow-warm-md sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <BrandMark size="sm" />
            <div>
              <p className="eyebrow">Register</p>
              <h1 className="h1-display text-2xl leading-tight sm:text-3xl">Fran POS</h1>
              <p className="text-sm text-muted-foreground">
                {binding
                  ? `${binding.store_code} · ${binding.register_id}${binding.label ? ` · ${binding.label}` : ''}`
                  : `${STORE.name} - Store ${STORE.code}`}
              </p>
            </div>
          </div>
          <div className="grid w-full max-w-xs grid-cols-2 gap-1 rounded-sm bg-surface-sunken p-1 sm:w-64">
            <button
              type="button"
              onClick={() => setMode('demo')}
              className={cn(
                'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                mode === 'demo'
                  ? 'bg-white font-semibold text-brown shadow-warm-xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Demo mode
            </button>
            <button
              type="button"
              onClick={() => setMode('live')}
              className={cn(
                'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                mode === 'live'
                  ? 'bg-white font-semibold text-brown shadow-warm-xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Live mode
            </button>
          </div>
        </div>

        {mode === 'live' ? (
          !binding ? (
            <div className="mx-auto w-full max-w-xl space-y-4 rounded-lg border p-5">
              <div className="text-center">
                <Tablet className="mx-auto mb-3 h-8 w-8 text-primary" />
                <h2 className="text-lg font-semibold">Bind this register</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Enter the store code and pair code from HRM / ops. No Google on the register.
                </p>
              </div>
              <label className="block text-sm">
                <span className="text-muted-foreground">Store code</span>
                <input
                  className="mt-1.5 w-full rounded-md border px-4 py-3.5 font-mono text-lg uppercase"
                  value={storeCode}
                  onChange={(e) => setStoreCode(e.target.value.toUpperCase())}
                  placeholder="FRAN01"
                  autoCapitalize="characters"
                />
              </label>
              <label className="block text-sm">
                <span className="text-muted-foreground">Pair code</span>
                <input
                  className="mt-1.5 w-full rounded-md border px-4 py-3.5 font-mono text-lg uppercase tracking-widest"
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
                className="h-12 w-full text-base"
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
            <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
              <div className="flex flex-col gap-4 rounded-lg border p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">Unlock register</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Employee code + 8-digit PIN from fran-hrm.
                    </p>
                  </div>
                  <span className="rounded-full bg-success-soft px-2.5 py-1 text-xs font-medium text-success">
                    Live
                  </span>
                </div>

                <label className="block flex-1">
                  <span className="text-sm text-muted-foreground">Employee code</span>
                  <input
                    className="mt-2 w-full rounded-lg border px-4 py-5 font-mono text-2xl uppercase tracking-wide sm:py-6 sm:text-3xl"
                    value={employeeCode}
                    onChange={(e) => {
                      setEmployeeCode(e.target.value.toUpperCase())
                      setError(false)
                    }}
                    placeholder="ADM-AD26"
                    autoCapitalize="characters"
                    autoComplete="off"
                  />
                </label>

                <Button
                  className="h-12 w-full text-base"
                  onClick={() => void openLiveWithHrmPin()}
                  disabled={employeeCode.length < 1 || pin.length !== HRM_POS_PIN_DIGITS || unlocking}
                >
                  <ShoppingBag className="h-4 w-4" />
                  {unlocking ? 'Checking…' : 'Unlock'}
                </Button>
                <Button variant="outline" className="h-11 w-full" onClick={handleUnbind}>
                  <LogOut className="h-4 w-4" />
                  Unbind this tablet
                </Button>
              </div>

              <div className="flex min-h-[22rem] flex-col rounded-lg bg-secondary p-4 sm:min-h-0 sm:p-5">
                <div className="mb-3 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <KeyRound className="h-4 w-4" />
                  {HRM_POS_PIN_DIGITS}-digit PIN
                </div>
                <div className="mb-4 flex justify-center gap-2.5">
                  {Array.from({ length: HRM_POS_PIN_DIGITS }).map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        'h-4 w-4 rounded-full sm:h-5 sm:w-5',
                        i < pin.length ? 'bg-primary' : 'bg-muted',
                      )}
                    />
                  ))}
                </div>
                {error && (
                  <div className="mb-3 flex items-center justify-center gap-1.5 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4" /> {errorMessage || 'Incorrect or locked PIN'}
                  </div>
                )}
                <Numpad
                  fill
                  className="min-h-0 flex-1"
                  onPress={(k) => {
                    setError(false)
                    setPin((p) => (p.length < HRM_POS_PIN_DIGITS ? p + k : p))
                  }}
                  onBackspace={() => {
                    setError(false)
                    setPin((p) => p.slice(0, -1))
                  }}
                />
              </div>
            </div>
          )
        ) : (
          <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <div className="flex flex-col gap-4">
              {user ? (
                <div className="rounded-lg border bg-muted/40 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Connected demo account</p>
                      <p className="truncate text-xs text-muted-foreground">{connectedAccountLabel}</p>
                    </div>
                    <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground">
                      Demo
                    </span>
                  </div>
                  {!company && (
                    <Link to="/onboarding" className="mt-2 inline-block text-xs font-medium text-primary underline">
                      Finish company setup
                    </Link>
                  )}
                  <Button
                    variant="outline"
                    className="mt-3 h-10 w-full"
                    onClick={() => void handleGoogleSignOut()}
                    disabled={signingOut}
                  >
                    <LogOut className="h-4 w-4" />
                    {signingOut ? 'Signing out...' : 'Use another Google account'}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-3 rounded-lg border border-dashed p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium">Standalone cashier demo</p>
                    <p className="text-xs text-muted-foreground">Optional: connect a Google account for demo extras.</p>
                  </div>
                  <Button variant="outline" onClick={handleDemoAccountSignIn} disabled={googleLoading}>
                    {googleLoading ? 'Connecting...' : 'Connect Account'}
                  </Button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    { role: 'cashier' as const, icon: User, label: 'Cashier' },
                    { role: 'manager' as const, icon: Shield, label: 'Manager' },
                  ]
                ).map((r) => (
                  <button
                    key={r.role}
                    type="button"
                    onClick={() => {
                      setRole(r.role)
                      setPin('')
                      setError(false)
                    }}
                    className={cn(
                      'flex flex-col items-center gap-2 rounded-lg border px-3 py-5 text-base font-medium transition-colors cursor-pointer',
                      role === r.role
                        ? 'border-yellow bg-yellow font-semibold text-brown'
                        : 'hover:bg-surface-sunken',
                    )}
                  >
                    <r.icon className="h-6 w-6" />
                    {r.label}
                  </button>
                ))}
              </div>

              <p className="text-center text-sm text-muted-foreground">
                Enter PIN for <span className="font-medium text-foreground">{selected?.name}</span>
              </p>
              <p className="text-center text-xs text-muted-foreground">
                Demo PINs — Cashier: <span className="font-mono">1111</span> — Manager:{' '}
                <span className="font-mono">9999</span>
              </p>

              <Button className="mt-auto h-12 w-full text-base" onClick={submit} disabled={pin.length < 4}>
                Sign In
              </Button>

              {!user && (
                <Button
                  variant="ghost"
                  className="w-full text-xs text-muted-foreground"
                  onClick={() => void handleGoogleSignIn()}
                  disabled={googleLoading}
                >
                  <Wifi className="h-3 w-3" />
                  HQ dashboard Google sign-in
                </Button>
              )}
            </div>

            <div className="flex min-h-[22rem] flex-col rounded-lg bg-secondary p-4 sm:min-h-0 sm:p-5">
              <div className="mb-4 flex justify-center gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      'h-4 w-4 rounded-full sm:h-5 sm:w-5',
                      i < pin.length ? 'bg-primary' : 'bg-muted',
                    )}
                  />
                ))}
              </div>
              {error && (
                <div className="mb-3 flex items-center justify-center gap-1.5 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" /> Incorrect PIN, try again
                </div>
              )}
              <Numpad
                fill
                className="min-h-0 flex-1"
                onPress={(k) => {
                  setError(false)
                  setPin((p) => (p.length < 4 ? p + k : p))
                }}
                onBackspace={() => {
                  setError(false)
                  setPin((p) => p.slice(0, -1))
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
