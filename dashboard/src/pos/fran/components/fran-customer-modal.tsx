import { useState, type FormEvent } from 'react'
import { Loader2, QrCode, Search, UserPlus, UsersRound } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Customer } from '@/pos/data/mock'
import type { FranCrmClient } from '../lib/fran-crm-client'
import {
  customerFromFranMember,
  type FranCounterSession,
  type FranCounterTier,
  type FranMemberLookupMethod,
  type FranMemberResolution,
} from '../types'

interface FranCustomerModalProps {
  open: boolean
  client: FranCrmClient
  onClose: () => void
  onResolved: (session: FranCounterSession, customer: Customer | null) => void
}

const emptyResolution: FranMemberResolution = {
  status: 'none',
  input: { raw: '', method: 'manual' },
  matches: [],
  warnings: [],
}

function lookupMethod(value: string): FranMemberLookupMethod {
  const trimmed = value.trim()
  if (/^fran/i.test(trimmed)) return 'member_number'
  if (/^\+?\d[\d\s-]{5,}$/.test(trimmed)) return 'mobile'
  return 'manual'
}

function offlineSessionId(mode: string) {
  return `fran_offline_${mode}_${Date.now()}`
}

function addMinutesIso(minutes: number) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString()
}

function offlineMemberSession(raw: string, method: FranMemberLookupMethod): FranCounterSession {
  const trimmed = raw.trim()
  const memberNo = method === 'mobile' ? `MOBILE-${trimmed.replace(/\D/g, '') || 'PENDING'}` : trimmed.toUpperCase()
  return {
    sessionId: offlineSessionId('member'),
    mode: 'member',
    member: {
      id: `fran-offline-${Date.now()}`,
      crmCustomerId: `pending:${trimmed}`,
      memberNo,
      name: 'Offline member',
      phone: method === 'mobile' ? trimmed : '',
      email: null,
      tier: 'Base',
      pointsBalance: 0,
      memberSince: null,
      birthday: null,
      birthdayMonth: null,
      pointsExpireAt: null,
      expiresAt: null,
      rewardCount: 0,
      tourist: false,
      warnings: ['Fran CRM offline: member profile and points will reconcile from queued POS events.'],
    },
    activePerks: [],
    pointsExpiryAlert: null,
    startedAt: new Date().toISOString(),
    expiresAt: addMinutesIso(45),
    prompts: ['Fran CRM offline. Complete checkout; points earn will queue locally.'],
    warnings: ['Fran CRM offline. Loyalty is queued and must not block checkout.'],
  }
}

function offlineExceptionSession(mode: 'non_member' | 'tourist'): FranCounterSession {
  return {
    sessionId: offlineSessionId(mode),
    mode,
    member: null,
    activePerks: [],
    pointsExpiryAlert: null,
    startedAt: new Date().toISOString(),
    expiresAt: addMinutesIso(45),
    prompts: [`${mode === 'tourist' ? 'Tourist' : 'Non-member'} selected while Fran CRM is offline.`],
    warnings: ['Fran CRM offline. Sale can continue without loyalty decisions.'],
  }
}

export function FranCustomerModal({ open, client, onClose, onResolved }: FranCustomerModalProps) {
  const [query, setQuery] = useState('')
  const [resolution, setResolution] = useState<FranMemberResolution>(emptyResolution)
  const [loading, setLoading] = useState(false)
  const [registering, setRegistering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [registration, setRegistration] = useState({
    fullName: '',
    phone: '',
    birthday: '',
  })

  const reset = () => {
    setQuery('')
    setResolution(emptyResolution)
    setRegistering(false)
    setError(null)
  }

  const close = () => {
    reset()
    onClose()
  }

  const runResolve = async (raw: string, method: FranMemberLookupMethod = lookupMethod(raw)) => {
    const trimmed = raw.trim()
    if (!trimmed) return
    setLoading(true)
    setError(null)
    try {
      const next = await client.resolveMember({ raw: trimmed, method })
      setResolution(next)
      if (next.status === 'none') {
        setRegistration((current) => ({
          ...current,
          phone: method === 'mobile' ? trimmed : current.phone,
          fullName: method === 'manual' ? trimmed : current.fullName,
        }))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to resolve member.')
    } finally {
      setLoading(false)
    }
  }

  const selectMember = async (memberId: string) => {
    setLoading(true)
    setError(null)
    try {
      const session = await client.getCounterSession({
        mode: 'member',
        memberId,
        lookup: resolution.input,
      })
      onResolved(session, session.member ? customerFromFranMember(session.member) : null)
      close()
    } catch (err) {
      const raw = resolution.input.raw || query.trim()
      if (raw) {
        const session = offlineMemberSession(raw, resolution.input.raw ? resolution.input.method : lookupMethod(raw))
        onResolved(session, session.member ? customerFromFranMember(session.member) : null)
        close()
      } else {
        setError(err instanceof Error ? err.message : 'Unable to start member session.')
      }
    } finally {
      setLoading(false)
    }
  }

  const chooseException = async (mode: 'non_member' | 'tourist') => {
    setLoading(true)
    setError(null)
    try {
      const session = await client.getCounterSession({ mode })
      onResolved(session, null)
      close()
    } catch {
      const session = offlineExceptionSession(mode)
      onResolved(session, null)
      close()
    } finally {
      setLoading(false)
    }
  }

  const continueOfflineMember = () => {
    const raw = query.trim() || resolution.input.raw
    if (!raw) return
    const method = resolution.input.raw ? resolution.input.method : lookupMethod(raw)
    const session = offlineMemberSession(raw, method)
    onResolved(session, session.member ? customerFromFranMember(session.member) : null)
    close()
  }

  const submitRegistration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!registration.fullName.trim() || !registration.phone.trim()) return
    setLoading(true)
    setError(null)
    try {
      const session = await client.getCounterSession({
        mode: 'member',
        registration: {
          fullName: registration.fullName.trim(),
          phone: registration.phone.trim(),
          birthday: registration.birthday || null,
        },
        lookup: resolution.input.raw ? resolution.input : null,
      })
      onResolved(session, session.member ? customerFromFranMember(session.member) : null)
      close()
    } catch (err) {
      if (registration.phone.trim()) {
        const session = offlineMemberSession(registration.phone.trim(), 'mobile')
        if (session.member) {
          session.member.name = registration.fullName.trim() || session.member.name
          session.member.birthday = registration.birthday || null
          session.member.birthdayMonth = registration.birthday ? Number(registration.birthday.slice(5, 7)) : null
        }
        onResolved(session, session.member ? customerFromFranMember(session.member) : null)
        close()
      } else {
        setError(err instanceof Error ? err.message : 'Unable to register member.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && close()}>
      <DialogContent className="max-h-[92dvh] w-[calc(100vw-1rem)] max-w-xl overflow-y-auto p-4 sm:w-full" onClose={close}>
        <DialogHeader>
          <DialogTitle>Fran member lookup</DialogTitle>
        </DialogHeader>

        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              className="pl-9"
              value={query}
              placeholder="Scan QR, barcode, member number, or mobile"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void runResolve(query)
                }
              }}
            />
          </div>
          <Button onClick={() => void runResolve(query)} disabled={loading || !query.trim()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Search
          </Button>
        </div>

        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <Button variant="outline" className="border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100" onClick={() => { setQuery('FRAN1001'); void runResolve('FRAN1001', 'qr') }}>
            <QrCode className="h-4 w-4" /> QR demo
          </Button>
          <Button variant="outline" className="border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100" onClick={() => void chooseException('non_member')}>
            <UsersRound className="h-4 w-4" /> Non-member
          </Button>
          <Button variant="outline" className="border-cyan-200 bg-cyan-50 text-cyan-800 hover:bg-cyan-100" onClick={() => void chooseException('tourist')}>
            <UsersRound className="h-4 w-4" /> Tourist
          </Button>
        </div>

        {error && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <p>{error}</p>
            <p className="mt-1 text-xs text-amber-800">
              Sale can continue offline. Loyalty earn will queue locally and sync on reconnect.
            </p>
            {(query.trim() || resolution.input.raw) && (
              <Button type="button" variant="outline" size="sm" className="mt-2" onClick={continueOfflineMember}>
                Continue offline with identifier
              </Button>
            )}
          </div>
        )}

        <div className="mt-4 space-y-2">
          {resolution.matches.map((member) => (
            <button
              key={member.id}
              type="button"
              onClick={() => void selectMember(member.id)}
              className="flex w-full items-start justify-between gap-3 rounded-lg border border-teal-200 bg-teal-50 p-3 text-left text-teal-950 transition-colors hover:bg-teal-100"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{member.name}</span>
                  <Badge variant="outline" className={tierBadgeClass(member.tier)}>{member.tier}</Badge>
                  {member.tourist && <Badge variant="outline" className="border-cyan-200 bg-cyan-50 text-cyan-800">Tourist</Badge>}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                  <Badge variant="outline" className="border-emerald-300 bg-white text-emerald-800">
                    Can spend {member.pointsBalance.toLocaleString()} pts
                  </Badge>
                  {member.pointsExpireAt && (
                    <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
                      Expires {formatLookupDate(member.pointsExpireAt)}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-teal-800">
                  {member.memberNo} - {member.phone}
                </p>
                {member.warnings[0] && <p className="mt-1 text-xs text-amber-700">{member.warnings[0]}</p>}
              </div>
              <Badge variant="outline" className="shrink-0 border-teal-300 bg-white text-teal-800">
                Use {member.rewardCount} rewards
              </Badge>
            </button>
          ))}

          {resolution.input.raw && resolution.matches.length === 0 && (
            <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              No Fran member matched this input.
            </div>
          )}
        </div>

        <div className="mt-4 rounded-lg border bg-muted/30 p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">Inline member registration</p>
              <p className="text-xs text-muted-foreground">Create a counter-safe starter profile for this sale.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setRegistering((value) => !value)}>
              <UserPlus className="h-4 w-4" /> {registering ? 'Hide' : 'Register'}
            </Button>
          </div>

          {registering && (
            <form className="space-y-3" onSubmit={submitRegistration}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Full name</Label>
                  <Input
                    value={registration.fullName}
                    onChange={(event) => setRegistration({ ...registration, fullName: event.target.value })}
                    placeholder="Customer name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Mobile</Label>
                  <Input
                    value={registration.phone}
                    onChange={(event) => setRegistration({ ...registration, phone: event.target.value })}
                    placeholder="+65 9123 4567"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Birthday</Label>
                <Input
                  type="date"
                  value={registration.birthday}
                  onChange={(event) => setRegistration({ ...registration, birthday: event.target.value })}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading || !registration.fullName.trim() || !registration.phone.trim()}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Register and attach
              </Button>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function formatLookupDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-SG', {
    day: '2-digit',
    month: 'short',
  }).format(date)
}

function tierBadgeClass(tier: FranCounterTier) {
  switch (tier) {
    case 'Gold':
      return 'border-amber-300 bg-amber-50 text-amber-800'
    case 'Silver':
      return 'border-slate-300 bg-slate-100 text-slate-800'
    case 'Base':
      return 'border-blue-200 bg-blue-50 text-blue-800'
    case 'Tourist':
      return 'border-cyan-200 bg-cyan-50 text-cyan-800'
    default:
      return ''
  }
}
