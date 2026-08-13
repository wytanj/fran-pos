import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Package,
  FolderOpen,
  ShoppingCart,
  Users,
  Settings,
  LogOut,
  ChevronDown,
} from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { cn } from '@/lib/utils'
import { BrandMark } from '@/components/brand-mark'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/products', icon: Package, label: 'Products' },
  { to: '/categories', icon: FolderOpen, label: 'Categories' },
  { to: '/orders', icon: ShoppingCart, label: 'Orders' },
  { to: '/customers', icon: Users, label: 'Customers' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export function Sidebar() {
  const { company, companies, profile, signOut, switchCompany } = useAuth()

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-line bg-white">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line-soft px-4">
        <BrandMark size="sm" />
        <div className="min-w-0 leading-tight">
          <p className="truncate font-display text-[19px] font-bold tracking-tight text-ink">Fran POS</p>
          <p className="truncate text-[11px] text-muted-foreground">Register &amp; catalog</p>
        </div>
      </div>

      <div className="border-b border-line-soft p-3">
        {companies.length > 1 ? (
          <div className="relative">
            <select
              value={company?.id || ''}
              onChange={(e) => switchCompany(e.target.value)}
              className="w-full appearance-none rounded-sm border border-line bg-white px-3 py-2 pr-8 text-sm font-semibold focus:border-brown focus:outline-none"
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
        ) : (
          <h2 className="truncate font-display text-[17px] font-bold tracking-tight">{company?.name || 'My Business'}</h2>
        )}
        <p className="mt-1 text-xs capitalize text-muted-foreground">{profile?.role || ''}</p>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2.5">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cn(
                'press flex items-center gap-3 rounded-sm px-2.5 py-2 text-[13.5px] font-medium transition-colors',
                isActive
                  ? 'bg-yellow-soft font-semibold text-brown'
                  : 'text-ink-soft hover:bg-surface-sunken hover:text-ink'
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-line-soft p-2.5">
        <button
          onClick={() => signOut()}
          className="press flex w-full items-center gap-3 rounded-sm px-2.5 py-2 text-[13.5px] font-medium text-ink-soft transition-colors hover:bg-surface-sunken hover:text-ink cursor-pointer"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </aside>
  )
}
