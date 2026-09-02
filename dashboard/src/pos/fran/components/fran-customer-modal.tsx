import { useState, type FormEvent } from 'react'
import { Loader2, Nfc, Plane, QrCode, Search, UserPlus, UsersRound, X } from 'lucide-react'
import { useStripeConnector } from '@/hooks/use-stripe-connector'
import { stripeS700Ready } from '@/pos/lib/stripe-connector'
import { cancelStripeReader, collectS700Inputs, waitForS700Action } from '@/pos/lib/stripe-terminal-api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import type { Customer } from '@/pos/data/mock'
import type { FranCrmClient } from '../lib/fran-crm-client'
import { tierBadgeClass, tierLabel, tierSummaryLine } from '../lib/tier-display'
import {
  customerFromFranMember,
  type FranCounterSession,
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

// Staff pick the country on the register (our UI, no widget limits); the S700
// only collects the number itself. 'other' falls back to free-text entry with
// the country code typed on the reader.
const LOOKUP_COUNTRIES: Array<{ dial: string; label: string }> = [
  { dial: '+65', label: 'Singapore +65' },
  { dial: '+60', label: 'Malaysia +60' },
  { dial: '+62', label: 'Indonesia +62' },
  { dial: '+86', label: 'China +86' },
  { dial: '+852', label: 'Hong Kong +852' },
  { dial: '+886', label: 'Taiwan +886' },
  { dial: '+91', label: 'India +91' },
  { dial: '+81', label: 'Japan +81' },
  { dial: '+82', label: 'South Korea +82' },
  { dial: '+63', label: 'Philippines +63' },
  { dial: '+66', label: 'Thailand +66' },
  { dial: '+84', label: 'Vietnam +84' },
  { dial: '+673', label: 'Brunei +673' },
  { dial: '+61', label: 'Australia +61' },
  { dial: '+64', label: 'New Zealand +64' },
  { dial: '+44', label: 'United Kingdom +44' },
  { dial: '+1', label: 'US / Canada +1' },
  { dial: '+49', label: 'Germany +49' },
  { dial: '+33', label: 'France +33' },
  { dial: '+971', label: 'UAE +971' },
  { dial: 'other', label: 'Other country…' },
]

// The S700 returns E.164 (+6591234567) from the phone widget, and free text
// from the international entry. Fran CRM stores local SG numbers, so strip the
// +65 country code; other prefixes pass through as full international numbers.
function normalizeReaderPhone(value: string) {
  const compact = value.replace(/[\s()-]/g, '')
  const sg = compact.match(/^(?:\+?65)?(\d{8})$/)
  return sg ? sg[1] : compact
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
      tier: 'F1',
      tierLabel: 'Tier 1',
      calendarYtdSpend: 0,
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

export function createFranExceptionSession(mode: 'non_member' | 'tourist'): FranCounterSession {
  return {
    sessionId: offlineSessionId(mode),
    mode,
    member: null,
    activePerks: [],
    pointsExpiryAlert: null,
    startedAt: new Date().toISOString(),
    expiresAt: addMinutesIso(45),
    prompts: [`${mode === 'tourist' ? 'Tourist' : 'Non-member'} exception selected.`],
    warnings: [],
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

  // Customer keys their own mobile on the S700 (server-driven collect_inputs);
  // staff typing into the search box above stays available the whole time.
  const { connector: stripeConnector } = useStripeConnector()
  const s700ReaderId =
    stripeS700Ready(stripeConnector) && !stripeConnector?.simulated ? stripeConnector!.s700_reader_id : ''
  const [readerWait, setReaderWait] = useState(false)
  const [lookupDial, setLookupDial] = useState('+65')

  // Staff pick the country on the register; the reader shows exactly one
  // screen — the +65 phone widget for Singapore, the numeric keypad for a
  // chosen country (the app prepends the dial code), or free text for Other.
  const askOnReader = async () => {
    if (!s700ReaderId || readerWait) return
    setReaderWait(true)
    setError(null)
    try {
      const sg = lookupDial === '+65'
      const other = lookupDial === 'other'
      const form = sg ? 'phone' : other ? 'intl_phone' : 'intl_number'
      const entryType = sg ? 'phone' : other ? 'text' : 'numeric'
      await collectS700Inputs(s700ReaderId, form)
      const reader = await waitForS700Action(s700ReaderId, { timeoutMs: 120_000 })
      const entry = reader.collected_inputs?.find((inp) => inp.type === entryType)
      if (!entry || entry.skipped || !entry.value) {
        setError('Customer skipped the number entry on the S700. Enter it here instead.')
        return
      }
      const rawNumber = sg || other ? entry.value : `${lookupDial}${entry.value.replace(/^0+/, '')}`
      const normalized = normalizeReaderPhone(rawNumber)
      setQuery(normalized)
      await runResolve(normalized, 'mobile')
    } catch (err) {
      void cancelStripeReader(s700ReaderId).catch(() => {})
      setError(err instanceof Error ? err.message : 'Could not collect the number on the S700.')
    } finally {
      setReaderWait(false)
    }
  }

  const cancelReaderAsk = () => {
    if (!s700ReaderId) return
    // cancelAction makes the pending waitForS700Action throw, which resets state.
    void cancelStripeReader(s700ReaderId).catch(() => {})
  }

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

  const chooseException = (mode: 'non_member' | 'tourist') => {
    onResolved(createFranExceptionSession(mode), null)
    close()
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

  if (!open) return null

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-card">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <h2 className="font-display text-xl font-bold tracking-tight">Fran member lookup</h2>

        <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
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
          <Button type="button" onClick={() => void runResolve(query)} disabled={loading || !query.trim()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Search
          </Button>
        </div>

        {s700ReaderId && (
          <div className="mt-2 flex gap-2">
            <Select
              aria-label="Country for S700 number entry"
              className="h-10 w-40 shrink-0"
              value={lookupDial}
              disabled={readerWait}
              onChange={(e) => setLookupDial(e.target.value)}
            >
              {LOOKUP_COUNTRIES.map((c) => (
                <option key={c.dial} value={c.dial}>{c.label}</option>
              ))}
            </Select>
            <Button
              type="button"
              variant="outline"
              className="min-w-0 flex-1 border-line bg-yellow-soft text-brown hover:bg-yellow"
              onClick={() => (readerWait ? cancelReaderAsk() : void askOnReader())}
            >
              {readerWait ? <Loader2 className="h-4 w-4 animate-spin" /> : <Nfc className="h-4 w-4" />}
              <span className="truncate">
                {readerWait ? 'Customer entering number on S700 — tap to cancel' : 'Ask for number on S700'}
              </span>
            </Button>
          </div>
        )}
        <Button
          type="button"
          variant="outline"
          className="mt-2 w-full border-line bg-yellow-soft text-brown hover:bg-yellow"
          onClick={() => { setQuery('FRAN1001'); void runResolve('FRAN1001', 'qr') }}
        >
          <QrCode className="h-4 w-4" /> QR demo
        </Button>
        <Button
          type="button"
          variant="outline"
          className="mt-2 w-full border-line bg-yellow-soft text-brown hover:bg-yellow"
          onClick={() => chooseException('tourist')}
        >
          <Plane className="h-4 w-4" /> Tourist
        </Button>
        <Button type="button" variant="outline" className="mt-2 w-full" onClick={() => chooseException('non_member')}>
          <UsersRound className="h-4 w-4" /> Non-member
        </Button>
        <Button type="button" variant="outline" className="mt-2 w-full" onClick={close}>
          <X className="h-4 w-4" /> Close
        </Button>

        {error && (
          <div className="mt-3 rounded-sm border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning">
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
              className="flex w-full items-start justify-between gap-3 rounded-md border border-line bg-yellow-soft p-3 text-left text-brown transition-colors hover:bg-yellow"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{member.name}</span>
                  <Badge variant="outline" className={tierBadgeClass(member.tier)}>
                    {tierLabel(member.tier, member.tierLabel)}
                  </Badge>
                  {member.tourist && <Badge variant="outline" className="border-line-strong bg-white text-ink-soft">Tourist</Badge>}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                  <Badge variant="outline" className="border-line bg-white text-brown">
                    {tierSummaryLine({
                      tier: member.tier,
                      tierLabel: member.tierLabel,
                      calendarYtdSpend: member.calendarYtdSpend,
                      trailingTwelveMonthSpend: member.trailingTwelveMonthSpend,
                      currency: 'SGD',
                    })}
                  </Badge>
                  <Badge variant="outline" className="border-transparent bg-success-soft text-success">
                    Can spend {member.pointsBalance.toLocaleString()} pts
                  </Badge>
                  {member.pointsExpireAt && (
                    <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
                      Expires {formatLookupDate(member.pointsExpireAt)}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-ink-soft">
                  {member.memberNo} - {member.phone}
                </p>
                {member.warnings[0] && <p className="mt-1 text-xs text-amber-700">{member.warnings[0]}</p>}
              </div>
              <Badge variant="outline" className="shrink-0 border-line bg-white text-brown">
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
      </div>
    </div>
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
