import { NavLink, Outlet } from 'react-router-dom'
import { cn } from '@/lib/utils'

const tabs = [
  { to: '/settings', label: 'Company', end: true },
  { to: '/settings/tax', label: 'Tax Rates', end: false },
  { to: '/settings/payments', label: 'Payment Methods', end: false },
  { to: '/settings/staff', label: 'Staff', end: false },
  { to: '/settings/integrations', label: 'Integrations', end: false },
  { to: '/settings/customization', label: 'Customization', end: false },
]

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <nav className="flex border-b">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              cn(
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  )
}
