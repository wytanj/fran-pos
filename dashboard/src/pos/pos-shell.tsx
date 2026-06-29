import { useEffect, useState } from 'react'
import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom'
import {
  ShoppingBag,
  RefreshCcw,
  Truck,
  Boxes,
  Receipt,
  BarChart3,
  LockKeyhole,
  Wifi,
  CheckCircle2,
  Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePos } from '@/pos/lib/pos-context'
import { STORE } from '@/pos/data/mock'
import { useAuth } from '@/providers/auth-provider'

const navItems = [
  { to: '/pos/sale', icon: ShoppingBag, label: 'Sale' },
  { to: '/pos/returns', icon: RefreshCcw, label: 'Returns & Exchange' },
  { to: '/pos/transfers', icon: Truck, label: 'Transfers' },
  { to: '/pos/stock', icon: Boxes, label: 'Stock' },
  { to: '/pos/transactions', icon: Receipt, label: 'Transactions' },
  { to: '/pos/reports', icon: BarChart3, label: 'Reports & Closing' },
]

export function PosShell() {
  const { user: posUser, setUser, clearSale, mode } = usePos()
  const { user: accountUser, company } = useAuth()
  const navigate = useNavigate()
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000 * 30)
    return () => clearInterval(t)
  }, [])

  if (!posUser) return <Navigate to="/pos/login" replace />

  const lockTerminal = () => {
    clearSale()
    setUser(null)
    navigate('/pos/login')
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-secondary text-foreground">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card px-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ShoppingBag className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold">{STORE.name}</p>
            {(company || (accountUser && mode === 'demo')) && (
              <p className="text-xs font-medium text-foreground">{company?.name ?? 'Account demo'}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Store {STORE.code} · Register 01
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <span className="hidden items-center gap-1.5 text-green-600 sm:flex">
            <Wifi className="h-4 w-4" /> Online
          </span>
          <span className="hidden items-center gap-1.5 text-muted-foreground md:flex">
            <CheckCircle2 className="h-4 w-4 text-green-600" /> Cloud synced
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-4 w-4" />
            {now.toLocaleString('en-SG', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}
          </span>
          <div className="flex items-center gap-2 border-l pl-4">
            <div className="text-right leading-tight">
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

      <div className="flex min-h-0 flex-1">
        {/* Left nav */}
        <nav className="flex w-20 shrink-0 flex-col items-center gap-1 border-r bg-card py-3 lg:w-44 lg:items-stretch lg:px-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
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
              <span className="text-center leading-tight lg:text-left">{item.label}</span>
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
