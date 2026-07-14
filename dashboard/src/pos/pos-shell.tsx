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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePos } from '@/pos/lib/pos-context'
import { getActiveStore } from '@/pos/lib/pos-store-config'
import { useAuth } from '@/providers/auth-provider'

const navItems = [
  { to: '/pos/sale', icon: ShoppingBag, label: 'Sale' },
  { to: '/pos/returns', icon: RefreshCcw, label: 'Returns & Exchange' },
  { to: '/pos/transfers', icon: Truck, label: 'Transfers' },
  { to: '/pos/stock', icon: Boxes, label: 'Stock' },
  { to: '/pos/request-stock', icon: ClipboardList, label: 'Request stock' },
  { to: '/pos/receive', icon: PackageCheck, label: 'Receive' },
  { to: '/pos/transactions', icon: Receipt, label: 'Transactions' },
  { to: '/pos/reports', icon: BarChart3, label: 'Reports & Closing' },
]

export function PosShell() {
  const { user: posUser, setUser, clearSale, mode } = usePos()
  const { user: accountUser, company } = useAuth()
  const navigate = useNavigate()
  const [now, setNow] = useState(new Date())
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000 * 30)
    return () => clearInterval(t)
  }, [])

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
    <div className="flex h-screen flex-col overflow-hidden bg-secondary text-foreground">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card px-2 shadow-sm sm:px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            aria-label="Open POS menu"
            onClick={() => setMobileNavOpen(true)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-background transition-colors hover:bg-accent md:hidden"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ShoppingBag className="h-4 w-4" />
          </div>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold">{getActiveStore().name}</p>
            {(company || (accountUser && mode === 'demo')) && (
              <p className="truncate text-xs font-medium text-foreground">{company?.name ?? 'Account demo'}</p>
            )}
            <p className="truncate text-xs text-muted-foreground">
              Store {STORE.code} · Register 01
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 text-sm sm:gap-4">
          <span className="hidden items-center gap-1.5 text-green-600 sm:flex">
            <Wifi className="h-4 w-4" /> Online
          </span>
          <span className="hidden items-center gap-1.5 text-muted-foreground md:flex">
            <CheckCircle2 className="h-4 w-4 text-green-600" /> Cloud synced
          </span>
          <span className="hidden items-center gap-1.5 text-muted-foreground min-[380px]:flex">
            <Clock className="h-4 w-4" />
            {now.toLocaleString('en-SG', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}
          </span>
          <div className="flex items-center gap-2 border-l pl-2 sm:pl-4">
            <div className="hidden text-right leading-tight min-[380px]:block">
              <p className="text-sm font-medium">{posUser.name}</p>
              <p className="text-xs capitalize text-muted-foreground">{posUser.role}</p>
            </div>
            <button
              onClick={lockTerminal}
              title="Lock terminal"
              className="flex h-9 w-9 items-center justify-center rounded-md border bg-background transition-colors hover:bg-accent cursor-pointer"
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
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="POS menu"
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-card shadow-xl"
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
                className="flex h-9 w-9 items-center justify-center rounded-md border bg-background transition-colors hover:bg-accent"
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
                      'flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
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
                className="flex w-full items-center justify-center gap-2 rounded-md border bg-background px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
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
        <nav className="hidden w-16 shrink-0 flex-col items-center gap-1 border-r bg-card py-3 md:flex lg:w-44 lg:items-stretch lg:px-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              aria-label={item.label}
              title={item.label}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-1 rounded-lg px-2 py-2.5 text-xs font-medium transition-colors lg:flex-row lg:gap-3 lg:px-3 lg:text-sm',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
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
    </div>
  )
}
