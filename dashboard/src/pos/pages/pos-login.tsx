import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertCircle, CloudDownload, KeyRound, PackagePlus, Shield, ShoppingBag, User, UserCheck, Wifi } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Numpad } from '@/pos/components/numpad'
import { usePos } from '@/pos/lib/pos-context'
import { USERS, STORE, type PosRole } from '@/pos/data/mock'
import { cn } from '@/lib/utils'
import { useAuth } from '@/providers/auth-provider'
import { usePosStaffMembers, useStartPosStaffSession } from '@/hooks/use-pos-staff'
import type { PosStaffMember } from '@pos/shared'

export default function PosLogin() {
  const { mode, setMode, setUser } = usePos()
  const { user, company, loading, signInWithGoogle } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [role, setRole] = useState<PosRole>('cashier')
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null)
  const { data: staff = [], isLoading: staffLoading } = usePosStaffMembers()
  const startStaffSession = useStartPosStaffSession()
  const requestedMode = searchParams.get('mode')
  const connectedAccountLabel = company?.name || user?.email || null

  useEffect(() => {
    if (requestedMode === 'demo' || requestedMode === 'live') setMode(requestedMode)
  }, [requestedMode, setMode])

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

  const liveStaff = staff.filter(
    (member) => member.pos_access_enabled && !['terminated', 'inactive'].includes(member.employment_status.toLowerCase())
  )
  const selectedStaff = liveStaff.find((member) => member.id === selectedStaffId) || liveStaff[0] || null

  const getDeviceId = () => {
    const existing = localStorage.getItem('pos_device_id')
    if (existing) return existing
    const next = crypto.randomUUID()
    localStorage.setItem('pos_device_id', next)
    return next
  }

  const openLiveTerminal = async () => {
    if (!user || !company || !selectedStaff) return
    try {
      const result = await startStaffSession.mutateAsync({
        staffMemberId: selectedStaff.id,
        passcode: pin,
        registerId: STORE.code,
        deviceId: getDeviceId(),
      })
      const posRole: PosRole = result.staff.role === 'cashier' ? 'cashier' : 'manager'
      setPin('')
      setError(false)
      setSelectedStaffId(result.staff.id)
      setMode('live')
      setUser({
        id: result.staff.id,
        name: result.staff.display_name,
        role: posRole,
        pin: '',
        staffMemberId: result.staff.id,
        sessionId: result.session.id,
        sourceProvider: result.staff.source_provider,
        employmentType: result.staff.employment_type,
        isEor: result.staff.is_eor,
      })
      navigate('/pos/sale')
    } catch {
      setError(true)
    }
  }

  const selectStaff = (member: PosStaffMember) => {
    setSelectedStaffId(member.id)
    setPin('')
    setError(false)
    setMode('live')
  }

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true)
    try {
      await signInWithGoogle('/pos')
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary p-4">
      <div className="w-full max-w-3xl rounded-2xl border bg-card p-6 shadow-lg">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ShoppingBag className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold">Fran POS</h1>
          <p className="text-sm text-muted-foreground">
            {STORE.name} - Store {STORE.code}
          </p>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-2 rounded-lg bg-secondary p-1">
          <button
            type="button"
            onClick={() => setMode('demo')}
            className={cn(
              'rounded-md px-3 py-2 text-sm font-medium transition-colors',
              mode === 'demo' ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Demo mode
          </button>
          <button
            type="button"
            onClick={() => setMode('live')}
            className={cn(
              'rounded-md px-3 py-2 text-sm font-medium transition-colors',
              mode === 'live' ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Live mode
          </button>
        </div>

        {mode === 'live' ? (
          <div className="space-y-4">
            {loading ? (
              <p className="rounded-lg border p-4 text-center text-sm text-muted-foreground">Checking live session...</p>
            ) : !user ? (
              <div className="rounded-lg border p-4 text-center">
                <Wifi className="mx-auto mb-3 h-8 w-8 text-primary" />
                <h2 className="font-semibold">Sign in for live POS</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Live mode uses your POS company, products, and SKUMS connector settings.
                </p>
                <Button className="mt-4 w-full" onClick={handleGoogleSignIn} disabled={googleLoading}>
                  {googleLoading ? 'Opening Google...' : 'Continue with Google'}
                </Button>
              </div>
            ) : !company ? (
              <div className="rounded-lg border p-4 text-center">
                <h2 className="font-semibold">Finish company setup</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Create the live POS company before opening the register.
                </p>
                <Link to="/onboarding">
                  <Button className="mt-4 w-full">Finish Setup</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-4 rounded-lg border p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-semibold">{company.name}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Select an active POS staff member and enter their register passcode.
                    </p>
                  </div>
                  <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800">Live</span>
                </div>

                {staffLoading ? (
                  <p className="rounded-lg border p-4 text-center text-sm text-muted-foreground">Loading POS staff...</p>
                ) : liveStaff.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-center">
                    <UserCheck className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                    <h3 className="font-semibold">No POS staff enabled</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Add staff passcodes before opening the live register.
                    </p>
                    <Link to="/settings/staff">
                      <Button className="mt-4 w-full">
                        <UserCheck className="h-4 w-4" /> Manage Staff
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {liveStaff.map((member) => (
                        <button
                          key={member.id}
                          type="button"
                          onClick={() => selectStaff(member)}
                          className={cn(
                            'flex items-center justify-between rounded-lg border p-3 text-left transition-colors cursor-pointer',
                            selectedStaff?.id === member.id ? 'border-primary bg-accent' : 'hover:bg-accent'
                          )}
                        >
                          <span>
                            <span className="block font-medium">{member.display_name}</span>
                            <span className="block text-xs capitalize text-muted-foreground">
                              {member.role} - {member.employment_type || 'staff'}
                            </span>
                          </span>
                          {member.is_eor && <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">EOR</span>}
                        </button>
                      ))}
                    </div>

                    <div className="rounded-lg bg-secondary p-4">
                      <div className="mb-3 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                        <KeyRound className="h-4 w-4" />
                        Passcode for <span className="font-medium text-foreground">{selectedStaff?.display_name}</span>
                      </div>
                      <div className="mb-4 flex justify-center gap-2">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <div key={i} className={cn('h-3.5 w-3.5 rounded-full', i < pin.length ? 'bg-primary' : 'bg-muted')} />
                        ))}
                      </div>
                      {error && (
                        <div className="mb-3 flex items-center justify-center gap-1.5 text-sm text-destructive">
                          <AlertCircle className="h-4 w-4" /> Incorrect or locked passcode
                        </div>
                      )}
                      <Numpad
                        onPress={(k) => {
                          setError(false)
                          setPin((p) => (p.length < 12 ? p + k : p))
                        }}
                        onBackspace={() => {
                          setError(false)
                          setPin((p) => p.slice(0, -1))
                        }}
                      />
                      <Button
                        className="mt-4 h-11 w-full text-base"
                        onClick={openLiveTerminal}
                        disabled={pin.length < 4 || startStaffSession.isPending}
                      >
                        <ShoppingBag className="h-4 w-4" />
                        {startStaffSession.isPending ? 'Opening...' : 'Open Register'}
                      </Button>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <Link to="/products?new=1">
                        <Button variant="outline" className="w-full">
                          <PackagePlus className="h-4 w-4" /> Create Product
                        </Button>
                      </Link>
                      <Link to="/products?import=skums">
                        <Button variant="outline" className="w-full">
                          <CloudDownload className="h-4 w-4" /> Import SKUMS
                        </Button>
                      </Link>
                    </div>
                  </>
                )}
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
              </div>
            ) : (
              <div className="mb-4 flex flex-col gap-3 rounded-lg border border-dashed p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium">Standalone cashier demo</p>
                  <p className="text-xs text-muted-foreground">Sign in to attach this demo session to an account.</p>
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
                    'flex flex-col items-center gap-1 rounded-lg border p-3 text-sm font-medium transition-colors cursor-pointer',
                    role === r.role ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent'
                  )}
                >
                  <r.icon className="h-5 w-5" />
                  {r.label}
                </button>
              ))}
            </div>

            <p className="mb-2 text-center text-sm text-muted-foreground">
              Enter PIN for <span className="font-medium text-foreground">{selected?.name}</span>
            </p>

            <div className="mb-4 flex justify-center gap-2">
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
              onPress={(k) => {
                setError(false)
                setPin((p) => (p.length < 4 ? p + k : p))
              }}
              onBackspace={() => {
                setError(false)
                setPin((p) => p.slice(0, -1))
              }}
            />

            <Button className="mt-4 h-11 w-full text-base" onClick={submit} disabled={pin.length < 4}>
              Sign In
            </Button>

            <p className="mt-4 text-center text-xs text-muted-foreground">
              Demo PINs - Cashier: <span className="font-mono">1111</span> - Manager:{' '}
              <span className="font-mono">9999</span>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
