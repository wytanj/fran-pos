import { useEffect, useState } from 'react'
import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom'
import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
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
  ChevronsLeft,
  ChevronsRight,
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

const NAV_COLLAPSED_KEY = 'fran-pos-nav-collapsed'

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

function readNavCollapsed(): boolean {
  try {
    const raw = localStorage.getItem(NAV_COLLAPSED_KEY)
    if (raw === null) return true
    return raw === '1'
  } catch {
    return true
  }
}

export function PosShell() {
  const { user: posUser, setUser, clearSale, mode } = usePos()
  const { user: accountUser, company } = useAuth()
  const { data: settings } = useCompanySettings()
  const { connector: stripe } = useStripeConnector()
  const s700Status = useS700Status(stripe)
  const navigate = useNavigate()
  const [now, setNow] = useState(new Date())
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [navCollapsed, setNavCollapsed] = useState(readNavCollapsed)
  const [rosterZoneLabel, setRosterZoneLabel] = useState<string | null>(null)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000 * 30)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(NAV_COLLAPSED_KEY, navCollapsed ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [navCollapsed])

  // Load current floor zone from SKUMS roster for the logged-in staff member
  useEffect(() => {
    let cancelled = false
    async function loadZone() {
      if (!posUser) {
        setRosterZoneLabel(null)
        return
      }
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

  // Android hardware back: close the top-most overlay first (every dialog and
  // drawer already closes on Escape), then step back through POS pages, and
  // only minimize — never exit — at the root sale screen.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let handle: PluginListenerHandle | undefined
    let removed = false
    CapacitorApp.addListener('backButton', () => {
      const overlayHost = document.getElementById('fran-overlay-root')
      const overlayOpen = Number(overlayHost?.dataset.openCount || '0') > 0
      const anyDialog = document.querySelector('[role="dialog"]')
      if (overlayOpen || anyDialog || mobileNavOpen) {
        if (mobileNavOpen) {
          setMobileNavOpen(false)
          return
        }
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
        return
      }
      const routerIdx = (window.history.state as { idx?: number } | null)?.idx ?? 0
      if (window.location.pathname !== '/pos/sale' && routerIdx > 0) {
        window.history.back()
        return
      }
      void CapacitorApp.minimizeApp()
    }).then((h) => {
      if (removed) void h.remove()
      else handle = h
    })
    return () => {
      removed = true
      void handle?.remove()
    }
  }, [mobileNavOpen])

  if (!posUser) return <Navigate to="/pos/login" replace />

  const syncLabel = now.toLocaleString('en-SG', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })
  const s700Label =
    s700Status === 'online' ? 'S700 ready' : s700Status === 'checking' ? 'S700…' : s700Status === 'idle' ? null : 'S700 offline'
  const s700Class =
    s700Status === 'online' ? 'text-success' : s700Status === 'checking' ? 'text-muted-foreground' : 'text-warning'

  const store = getActiveStore()
  const companyLine = company?.name ?? (accountUser && mode === 'demo' ? 'Account demo' : null)

  const renderBrandBlock = (opts?: { collapsed?: boolean; showClose?: boolean; onClose?: () => void }) => (
    <div className={cn('flex items-start gap-2 border-b border-line', opts?.collapsed ? 'justify-center px-1 py-3' : 'px-3 py-3')}>
      <BrandMark size={opts?.collapsed ? 'sm' : 'md'} />
      {!opts?.collapsed && (
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate font-display text-[15px] font-bold tracking-tight">{store.name}</p>
          {companyLine && <p className="truncate text-xs font-medium text-foreground">{companyLine}</p>}
          <p className="truncate text-xs text-muted-foreground">
            Store {store.code} · Register 01
          </p>
        </div>
      )}
      {opts?.showClose && (
        <button
          type="button"
          aria-label="Close POS menu"
          onClick={opts.onClose}
          className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-white transition-colors hover:bg-surface-sunken"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )

  const renderStatusPanel = (opts?: { collapsed?: boolean }) => (
    <div className={cn('space-y-2', opts?.collapsed && 'flex flex-col items-center px-0')}>
      <div className="flex items-center gap-2 text-xs text-success" title="Online">
        <Wifi className="h-3.5 w-3.5 shrink-0" />
        {!opts?.collapsed && <span>Online</span>}
      </div>
      {s700Label && (
        <div
          className={cn('flex items-center gap-2 text-xs', s700Class)}
          title="Galaxy Tab talks to this S700 over Stripe. Cards are taken on the reader, not on the tablet."
        >
          <Nfc className="h-3.5 w-3.5 shrink-0" />
          {!opts?.collapsed && <span>{s700Label}</span>}
        </div>
      )}
      <div className="flex items-center gap-2 text-xs text-muted-foreground" title="Cloud synced">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
        {!opts?.collapsed && <span>Cloud synced</span>}
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground" title={syncLabel}>
        <Clock className="h-3.5 w-3.5 shrink-0" />
        {!opts?.collapsed && <span>{syncLabel}</span>}
      </div>
      {rosterZoneLabel && (
        <div
          className={cn(
            'flex items-center gap-2 rounded-full border border-line bg-yellow-soft text-[11px] font-medium text-brown',
            opts?.collapsed ? 'p-1.5' : 'px-2 py-1',
          )}
          title={rosterZoneLabel}
        >
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          {!opts?.collapsed && <span className="truncate">{rosterZoneLabel}</span>}
        </div>
      )}
      {!opts?.collapsed && (
        <div className="border-t border-line pt-2">
          <p className="truncate text-sm font-medium">{posUser.name}</p>
          <p className="text-xs capitalize text-muted-foreground">{posUser.role}</p>
        </div>
      )}
    </div>
  )

  const lockTerminal = () => {
    clearSale()
    setUser(null)
    navigate('/pos/login')
  }

  const renderNavLinks = (opts: { collapsed?: boolean; onNavigate?: () => void }) =>
    navItems.map((item) => (
      <NavLink
        key={item.to}
        to={item.to}
        aria-label={item.label}
        title={item.label}
        onClick={opts.onNavigate}
        className={({ isActive }) =>
          cn(
            'press flex items-center gap-3 rounded-sm px-2 py-2.5 text-sm font-medium transition-colors',
            opts?.collapsed ? 'justify-center px-2' : 'px-3',
            isActive
              ? 'bg-yellow font-semibold text-brown'
              : 'text-ink-soft hover:bg-surface-sunken hover:text-ink',
          )
        }
      >
        <item.icon className="h-5 w-5 shrink-0" />
        {!opts?.collapsed && <span className="truncate">{item.label}</span>}
      </NavLink>
    ))

  return (
    // Safe-area padding keeps the register clear of the status bar, notch, and
    // gesture/dock bars on edge-to-edge Android 15+ and iPhone. env() reads 0
    // on desktop browsers and when the native shell already insets the WebView.
    <div className="relative flex h-screen flex-col overflow-hidden bg-cream text-foreground pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      {/* Mobile-only floating hamburger — no full top bar so sale keeps vertical space */}
      <button
        type="button"
        aria-label="Open POS menu"
        onClick={() => setMobileNavOpen(true)}
        className="press absolute left-[max(0.5rem,env(safe-area-inset-left))] top-[max(0.5rem,env(safe-area-inset-top))] z-40 flex h-10 w-10 items-center justify-center rounded-full border border-line bg-white shadow-warm-xs transition-colors hover:bg-surface-sunken md:hidden"
      >
        <Menu className="h-4 w-4" />
      </button>

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
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-nav pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
          >
            {renderBrandBlock({ showClose: true, onClose: () => setMobileNavOpen(false) })}
            <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
              {renderNavLinks({ onNavigate: () => setMobileNavOpen(false) })}
            </nav>
            <div className="space-y-3 border-t p-3">
              {renderStatusPanel()}
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
        {/* Desktop / tablet left nav — collapsible icon rail */}
        <nav
          className={cn(
            'hidden shrink-0 flex-col border-r border-line bg-white transition-[width] duration-200 md:flex',
            navCollapsed ? 'w-16' : 'w-52',
          )}
        >
          {renderBrandBlock({ collapsed: navCollapsed })}
          <div className={cn('flex shrink-0 items-center border-b border-line px-2 py-1.5', navCollapsed ? 'justify-center' : 'justify-end')}>
            <button
              type="button"
              aria-label={navCollapsed ? 'Expand POS menu' : 'Collapse POS menu'}
              title={navCollapsed ? 'Expand menu' : 'Collapse menu'}
              onClick={() => setNavCollapsed((v) => !v)}
              className="press flex h-8 w-8 items-center justify-center rounded-full border border-line bg-white transition-colors hover:bg-surface-sunken"
            >
              {navCollapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            </button>
          </div>
          <div className={cn('flex flex-1 flex-col gap-1 overflow-y-auto py-2', navCollapsed ? 'px-1' : 'px-2')}>
            {renderNavLinks({ collapsed: navCollapsed })}
          </div>
          <div className={cn('mt-auto space-y-2 border-t border-line py-3', navCollapsed ? 'px-1' : 'px-3')}>
            {renderStatusPanel({ collapsed: navCollapsed })}
            <button
              type="button"
              onClick={lockTerminal}
              title="Lock terminal"
              className={cn(
                'press flex w-full items-center gap-2 rounded-full border-[1.5px] border-brown bg-white py-2 text-xs font-semibold transition-colors hover:bg-surface-sunken',
                navCollapsed ? 'justify-center px-2' : 'justify-center px-3 text-sm',
              )}
            >
              <LockKeyhole className="h-4 w-4 shrink-0" />
              {!navCollapsed && <span>Lock</span>}
            </button>
          </div>
        </nav>

        {/* Page — full height; no top bar */}
        <main className="relative min-w-0 flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
      <div id="fran-overlay-root" className="hidden" />
    </div>
  )
}
