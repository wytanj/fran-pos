import { useEffect, useState } from 'react'
import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom'
import {
  ShoppingBag,
  RefreshCcw,
  Truck,
  Boxes,
  ClipboardList,
  PackageCheck,
  Receipt,
  BarChart3,
  LockKeyhole,
  Wifi,
  CheckCircle2,
  Clock,
  Menu,
  X,
  MapPin,
  Users,
  Nfc,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePos } from '@/pos/lib/pos-context'
import { getActiveStore } from '@/pos/lib/pos-store-config'
import { useAuth } from '@/providers/auth-provider'
import { fetchSkumsRosterAssignment } from '@/pos/lib/skums-client'
import { toSkumsConnectorConfig } from '@/pos/lib/skums-connector'
import { useCompanySettings } from '@/hooks/use-settings'
import { BrandMark } from '@/components/brand-mark'
import { useStripeConnector } from '@/hooks/use-stripe-connector'
import { useS700Status } from '@/hooks/use-s700-status'

const navItems = [
  { to: '/pos/sale', icon: ShoppingBag, label: 'Sale' },
  { to: '/pos/returns', icon: RefreshCcw, label: 'Returns & Exchange' },
  { to: '/pos/transfers', icon: Truck, label: 'Transfers' },
  { to: '/pos/stock', icon: Boxes, label: 'Stock' },
  { to: '/pos/request-stock', icon: ClipboardList, label: 'Request stock' },
  { to: '/pos/receive', icon: PackageCheck, label: 'Receive' },
  { to: '/pos/roster', icon: Users, label: 'Roster' },
  { to: '/pos/transactions', icon: Receipt, label: 'Transactions' },
  { to: '/pos/reports', icon: BarChart3, label: 'Reports & Closing' },
]

export function PosShell() {
  const { user: posUser, setUser, clearSale, mode } = usePos()
  const { user: accountUser, company } = useAuth()
  const { data: settings } = useCompanySettings()
  const { connector: stripe } = useStripeConnector()
  const s700Status = useS700Status(stripe)
  const navigate = useNavigate()
  const [now, setNow] = useState(new Date())
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [rosterZoneLabel, setRosterZoneLabel] = useState<string | null>(null)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000 * 30)
    return () => clearInterval(t)
  }, [])

  // Load current floor zone from SKUMS roster for the logged-in staff member
  useEffect(() => {
    let cancelled = false
    async function loadZone() {
      if (!posUser) {
        setRosterZoneLabel(null)
        return
      }
      // Demo users: map to sample seed refs when available
      const staffRef =
        posUser.staffMemberId ||
        (posUser.id === 'u-cashier'
          ? 'demo-staff-tiffany'
          : posUser.id === 'u-manager'
            ? 'demo-staff-jarrell'
            : null)

      if (!staffRef) return

      try {
        const connector = toSkumsConnectorConfig(settings ?? null)
        if (!connector) return
        const assignment = await fetchSkumsRosterAssignment(
          { pos_staff_ref: staffRef },
          connector,
        )
        if (cancelled) return
        setRosterZoneLabel(assignment?.zone?.name || null)
      } catch {
        // Soft-fail: POS still works without roster
        if (!cancelled) setRosterZoneLabel(null)
      }
    }
    void loadZone()
    const refresh = setInterval(() => void loadZone(), 5 * 60 * 1000)
    return () => {
      cancelled = true
      clearInterval(refresh)
    }
  }, [posUser?.id, posUser?.staffMemberId, mode, settings])

  useEffect(() => {
    if (!mobileNavOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNavOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [mobileNavOpen])

  if (!posUser) return <Navigate to="/pos/login" replace />

  const lockTerminal = () => {
    clearSale()
    setUser(null)
    navigate('/pos/login')
  }

  return (
    // Safe-area padding keeps the register clear of the status bar, notch, and
    // gesture/dock bars on edge-to-edge Android 15+ and iPhone. env() reads 0
    // on desktop browsers and when the native shell already insets the WebView.
    <div className="relative flex h-screen flex-col overflow-hidden bg-cream text-foreground pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-white px-2 shadow-warm-xs sm:px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            aria-label="Open POS menu"
            onClick={() => setMobileNavOpen(true)}
            className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-white transition-colors hover:bg-surface-sunken md:hidden"
          >
            <Menu className="h-4 w-4" />
          </button>
          <BrandMark />
          <div className="min-w-0 leading-tight">
            <p className="truncate font-display text-[17px] font-bold tracking-tight">{getActiveStore().name}</p>
            {(company || (accountUser && mode === 'demo')) && (
              <p className="truncate text-xs font-medium text-foreground">{company?.name ?? 'Account demo'}</p>
            )}
            <p className="truncate text-xs text-muted-foreground">
              Store {getActiveStore().code} · Register 01
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 text-sm sm:gap-4">
          <span className="hidden items-center gap-1.5 text-success sm:flex">
            <Wifi className="h-4 w-4" /> Online
          </span>
          {s700Status !== 'idle' && (
            <span
              className={cn(
                'hidden items-center gap-1.5 md:flex',
                s700Status === 'online' ? 'text-success' : s700Status === 'checking' ? 'text-muted-foreground' : 'text-warning',
              )}
              title="Galaxy Tab talks to this S700 over Stripe. Cards are taken on the reader, not on the tablet."
            >
              <Nfc className="h-4 w-4" />
              {s700Status === 'online' ? 'S700 ready' : s700Status === 'checking' ? 'S700…' : 'S700 offline'}
            </span>
          )}
          <span className="hidden items-center gap-1.5 text-muted-foreground md:flex">
            <CheckCircle2 className="h-4 w-4 text-success" /> Cloud synced
          </span>
          <span className="hidden items-center gap-1.5 text-muted-foreground min-[380px]:flex">
            <Clock className="h-4 w-4" />
            {now.toLocaleString('en-SG', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}
          </span>
          {rosterZoneLabel && (
            <span className="hidden items-center gap-1.5 rounded-full border border-line bg-yellow-soft px-2.5 py-1 text-xs font-medium text-brown sm:flex">
              <MapPin className="h-3.5 w-3.5 text-brown" />
              {rosterZoneLabel}
            </span>
          )}
          <div className="flex items-center gap-2 border-l pl-2 sm:pl-4">
            <div className="hidden text-right leading-tight min-[380px]:block">
              <p className="text-sm font-medium">{posUser.name}</p>
              <p className="text-xs capitalize text-muted-foreground">
                {posUser.role}
                {rosterZoneLabel && (
                  <span className="ml-1 font-medium normal-case text-primary sm:hidden">
                    · {rosterZoneLabel}
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={lockTerminal}
              title="Lock terminal"
              className="press flex h-9 w-9 items-center justify-center rounded-full border border-brown bg-white transition-colors hover:bg-surface-sunken cursor-pointer"
            >
              <LockKeyhole className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Dismiss POS menu"
            className="absolute inset-0 bg-brown/45"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="POS menu"
            // fixed overlay escapes the root's safe-area padding, so re-apply it
            // here: without it the close button sits under the status bar and
            // taps never reach the app (Android 15 edge-to-edge).
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-nav pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
          >
            <div className="flex items-center justify-between border-b px-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{getActiveStore().name}</p>
                <p className="text-xs text-muted-foreground">Register navigation</p>
              </div>
              <button
                type="button"
                aria-label="Close POS menu"
                onClick={() => setMobileNavOpen(false)}
                className="press flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white transition-colors hover:bg-surface-sunken"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileNavOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'press flex items-center gap-3 rounded-sm px-3 py-3 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-yellow font-semibold text-brown'
                        : 'text-ink-soft hover:bg-surface-sunken hover:text-ink'
                    )
                  }
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </nav>
            <div className="border-t p-3">
              <button
                type="button"
                onClick={() => {
                  setMobileNavOpen(false)
                  lockTerminal()
                }}
                className="press flex w-full items-center justify-center gap-2 rounded-full border-[1.5px] border-brown bg-white px-3 py-2.5 text-sm font-semibold transition-colors hover:bg-surface-sunken"
              >
                <LockKeyhole className="h-4 w-4" />
                Lock terminal
              </button>
            </div>
          </aside>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Left nav */}
        <nav className="hidden w-16 shrink-0 flex-col items-center gap-1 border-r border-line bg-white py-3 md:flex lg:w-44 lg:items-stretch lg:px-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              aria-label={item.label}
              title={item.label}
              className={({ isActive }) =>
                cn(
                  'press flex flex-col items-center gap-1 rounded-sm px-2 py-2.5 text-xs font-medium transition-colors lg:flex-row lg:gap-3 lg:px-3 lg:text-sm',
                  isActive
                    ? 'bg-yellow font-semibold text-brown'
                    : 'text-ink-soft hover:bg-surface-sunken hover:text-ink'
                )
              }
            >
              <item.icon className="h-5 w-5 shrink-0" />
              <span className="hidden text-center leading-tight lg:inline lg:text-left">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Page */}
        <main className="min-w-0 flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
      <div id="fran-overlay-root" className="hidden" />
    </div>
  )
}
