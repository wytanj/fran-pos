import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/providers/auth-provider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
  ArrowRight,
  BarChart3,
  CloudDownload,
  DollarSign,
  HeartHandshake,
  Package,
  PackagePlus,
  PlugZap,
  ReceiptText,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  TrendingUp,
  UserCog,
  Users,
} from 'lucide-react'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { ORDER_STATUSES } from '@pos/shared'
import type { Order, OrderStatus } from '@pos/shared'

type DashboardTab = 'overview' | 'sales' | 'analytics' | 'users' | 'customers' | 'integrations'

const dashboardTabs: Array<{ id: DashboardTab; label: string; icon: typeof BarChart3 }> = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'sales', label: 'Sales', icon: ReceiptText },
  { id: 'analytics', label: 'Analytics', icon: TrendingUp },
  { id: 'users', label: 'User Management', icon: UserCog },
  { id: 'customers', label: 'Customers & Loyalty', icon: HeartHandshake },
  { id: 'integrations', label: 'Integrations', icon: PlugZap },
]

function useDashboardStats() {
  const { company } = useAuth()
  return useQuery({
    queryKey: ['dashboard-stats', company?.id],
    queryFn: async () => {
      if (!company) return null
      const today = new Date().toISOString().split('T')[0]
      const weekAgo = new Date(Date.now() - 6 * 86400000).toISOString().split('T')[0]

      // Today's stats
      const { data: todayOrders } = await supabase
        .from('orders')
        .select('total')
        .eq('company_id', company.id)
        .eq('status', 'completed')
        .gte('created_at', today)

      // Week stats - daily breakdown
      const { data: weekOrders } = await supabase
        .from('orders')
        .select('total, created_at')
        .eq('company_id', company.id)
        .eq('status', 'completed')
        .gte('created_at', weekAgo)

      // Product count
      const { count: productCount } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', company.id)
        .eq('is_active', true)

      // Recent orders
      const { data: recentOrders } = await supabase
        .from('orders')
        .select('*, payment_method:payment_methods(id, name)')
        .eq('company_id', company.id)
        .order('created_at', { ascending: false })
        .limit(5)

      const todayRevenue = todayOrders?.reduce((sum, o) => sum + Number(o.total), 0) || 0
      const todayCount = todayOrders?.length || 0
      const weekRevenue = weekOrders?.reduce((sum, o) => sum + Number(o.total), 0) || 0

      // Build daily chart data
      const dailyMap: Record<string, number> = {}
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000)
        const key = d.toLocaleDateString('en-US', { weekday: 'short' })
        dailyMap[key] = 0
      }
      weekOrders?.forEach((o) => {
        const key = new Date(o.created_at).toLocaleDateString('en-US', { weekday: 'short' })
        if (key in dailyMap) dailyMap[key] += Number(o.total)
      })
      const chartData = Object.entries(dailyMap).map(([day, revenue]) => ({ day, revenue }))

      return {
        todayRevenue,
        todayCount,
        weekRevenue,
        avgOrder: todayCount > 0 ? todayRevenue / todayCount : 0,
        productCount: productCount || 0,
        chartData,
        recentOrders: (recentOrders || []) as Order[],
      }
    },
    enabled: !!company,
  })
}

function statusVariant(status: OrderStatus) {
  const map: Record<OrderStatus, 'default' | 'success' | 'warning' | 'destructive'> = {
    draft: 'default', completed: 'success', refunded: 'warning', voided: 'destructive',
  }
  return map[status]
}

export default function DashboardPage() {
  const { company, user, signOut } = useAuth()
  const { data: stats, isLoading } = useDashboardStats()
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview')
  const posRegisterPath = '/pos?mode=live'

  if (!company) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Card>
          <CardHeader>
            <CardTitle>Workspace setup incomplete</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Signed in as {user?.email}, but no company workspace is linked to this account.
            </p>
            <p className="text-sm text-muted-foreground">
              This usually happens when the Auth user was created before the signup trigger ran, or the user was created without signup metadata.
            </p>
            <Button variant="outline" onClick={() => void signOut()}>
              Sign out
            </Button>
            <Link to="/pos?mode=demo">
              <Button>
                <ShoppingBag className="h-4 w-4" /> Open Cashier Demo
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isLoading || !stats) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <Link to={posRegisterPath}>
            <Button>
              <ShoppingBag className="h-4 w-4" /> Open POS Register
            </Button>
          </Link>
        </div>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Welcome, {company?.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Run POS operations, sales controls, customer work, staff access, and source integrations from one place.</p>
        </div>
        <Link to={posRegisterPath}>
          <Button>
            <ShoppingBag className="h-4 w-4" /> Open POS Register
          </Button>
        </Link>
      </div>

      <div className="flex gap-2 overflow-x-auto border-b pb-2">
        {dashboardTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            aria-pressed={activeTab === tab.id}
            className={`flex h-10 shrink-0 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'border-primary bg-primary text-primary-foreground'
                : 'bg-background text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {stats.productCount === 0 && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle>Choose your product source</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border p-4">
                <PackagePlus className="mb-3 h-6 w-6 text-primary" />
                <h2 className="font-semibold">Create product manually</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add the first live POS item directly into this company catalog.
                </p>
                <Link to="/products?new=1">
                  <Button className="mt-4 w-full">Create Product</Button>
                </Link>
              </div>
              <div className="rounded-lg border p-4">
                <CloudDownload className="mb-3 h-6 w-6 text-primary" />
                <h2 className="font-semibold">Import from SKUMS</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Pull POS-enabled products from the SKUMS connector into this live catalog.
                </p>
                <Link to="/products?import=skums">
                  <Button variant="outline" className="mt-4 w-full">Import from SKUMS</Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'overview' && <OverviewTab stats={stats} />}
      {activeTab === 'sales' && <SalesTab stats={stats} posRegisterPath={posRegisterPath} />}
      {activeTab === 'analytics' && <AnalyticsTab stats={stats} />}
      {activeTab === 'users' && <UsersTab />}
      {activeTab === 'customers' && <CustomersLoyaltyTab />}
      {activeTab === 'integrations' && <IntegrationsTab />}
    </div>
  )
}

function OverviewTab({ stats }: { stats: NonNullable<ReturnType<typeof useDashboardStats>['data']> }) {
  return (
    <div className="space-y-6">
      <MetricGrid stats={stats} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SalesChart stats={stats} title="Sales This Week" />
        <RecentOrdersTable orders={stats.recentOrders} title="Recent Orders" />
      </div>
    </div>
  )
}

function SalesTab({
  stats,
  posRegisterPath,
}: {
  stats: NonNullable<ReturnType<typeof useDashboardStats>['data']>
  posRegisterPath: string
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <ActionPanel
          icon={ShoppingBag}
          title="Live Register"
          body="Open the cashier terminal for sale, payment, receipt email, customer attach, and outbox event capture."
          to={posRegisterPath}
          action="Open register"
        />
        <ActionPanel
          icon={ReceiptText}
          title="Transactions"
          body="Review receipts, reprint proof, inspect payment mix, and trace refund or exchange history."
          to="/orders"
          action="View orders"
        />
        <ActionPanel
          icon={Package}
          title="Catalog Readiness"
          body="Maintain POS-enabled products, SKUMS imports, stock counts, and register-visible pricing."
          to="/products"
          action="Manage products"
        />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
        <RecentOrdersTable orders={stats.recentOrders} title="Sales Work Queue" />
        <Card>
          <CardHeader>
            <CardTitle>Register Controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <StatusRow label="Sale event outbox" value="Enabled" tone="success" />
            <StatusRow label="Customer attach event" value="Enabled" tone="success" />
            <StatusRow label="Return event outbox" value="Enabled" tone="success" />
            <StatusRow label="Reward redemption events" value="Contract ready" tone="default" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function AnalyticsTab({ stats }: { stats: NonNullable<ReturnType<typeof useDashboardStats>['data']> }) {
  return (
    <div className="space-y-6">
      <MetricGrid stats={stats} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <SalesChart stats={stats} title="Revenue Trend" />
        <Card>
          <CardHeader>
            <CardTitle>Analytics Readiness</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <StatusRow label="Daily sales projection" value="Live" tone="success" />
            <StatusRow label="Order status mix" value="Live" tone="success" />
            <StatusRow label="Return rate" value="Next projection" tone="default" />
            <StatusRow label="Customer value profile" value="CRM-owned" tone="default" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function UsersTab() {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Card>
        <CardHeader>
          <CardTitle>User Management</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <ActionPanel
            icon={UserCog}
            title="POS Staff"
            body="Manage cashier access, manager roles, passcodes, staff sessions, and roster-source identity."
            to="/settings/staff"
            action="Manage staff"
          />
          <ActionPanel
            icon={ShieldCheck}
            title="Approvals"
            body="Manager authorizations are recorded against POS sessions for discounts, overrides, and sensitive actions."
            to="/settings/staff"
            action="Review access"
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Access Model</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <StatusRow label="Cashier register login" value="Passcode" tone="success" />
          <StatusRow label="Manager override" value="Session-bound" tone="success" />
          <StatusRow label="External roster sync" value="Source-neutral" tone="success" />
          <StatusRow label="Dashboard admin roles" value="Workspace role" tone="default" />
        </CardContent>
      </Card>
    </div>
  )
}

function CustomersLoyaltyTab() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <ActionPanel
        icon={Users}
        title="Customers"
        body="Search and maintain customer profiles by mobile number, full name, email, and birthday."
        to="/customers"
        action="Open customers"
      />
      <ActionPanel
        icon={HeartHandshake}
        title="Loyalty Handoff"
        body="POS owns customer attach, sale, return, reward redeem, and reward refund facts for downstream loyalty."
        to="/settings/integrations"
        action="Configure"
      />
      <ActionPanel
        icon={ReceiptText}
        title="Customer Timeline"
        body="Receipt email and source events keep CRM and loyalty systems aligned without POS owning those projections."
        to="/customers"
        action="View profiles"
      />
    </div>
  )
}

function IntegrationsTab() {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Card>
        <CardHeader>
          <CardTitle>Integration Control Plane</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <ActionPanel
            icon={CloudDownload}
            title="SKUMS Connector"
            body="Import POS-ready catalog data and resolve scans without making POS the product master."
            to="/settings/integrations"
            action="Open integrations"
          />
          <ActionPanel
            icon={PlugZap}
            title="Customer Email Connector"
            body="Send receipt email requests to a merchant-owned endpoint with provider-neutral payloads."
            to="/settings/integrations"
            action="Configure email"
          />
          <ActionPanel
            icon={PackagePlus}
            title="Catalog Imports"
            body="Start SKUMS imports or create a manual product source for first-run live mode."
            to="/products?import=skums"
            action="Import catalog"
          />
          <ActionPanel
            icon={ReceiptText}
            title="Source Event Outbox"
            body="Persist replay-safe POS source events for CRM, loyalty, and SKUMS consumers."
            to="/settings/integrations"
            action="Review contract"
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Source Ownership</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <StatusRow label="Checkout facts" value="POS" tone="success" />
          <StatusRow label="Product taxonomy" value="SKUMS" tone="default" />
          <StatusRow label="Rewards ledger" value="Loyalty" tone="default" />
          <StatusRow label="Customer memory" value="CRM" tone="default" />
        </CardContent>
      </Card>
    </div>
  )
}

function MetricGrid({ stats }: { stats: NonNullable<ReturnType<typeof useDashboardStats>['data']> }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard icon={DollarSign} label="Today's Revenue" value={formatCurrency(stats.todayRevenue)} />
      <MetricCard icon={ShoppingCart} label="Today's Orders" value={stats.todayCount.toLocaleString()} />
      <MetricCard icon={TrendingUp} label="Week Revenue" value={formatCurrency(stats.weekRevenue)} />
      <MetricCard icon={Package} label="Active Products" value={stats.productCount.toLocaleString()} />
    </div>
  )
}

function MetricCard({ icon: Icon, label, value }: { icon: typeof DollarSign; label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  )
}

function SalesChart({
  stats,
  title,
}: {
  stats: NonNullable<ReturnType<typeof useDashboardStats>['data']>
  title: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={stats.chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" />
            <YAxis />
            <Tooltip formatter={(value) => formatCurrency(Number(value))} />
            <Bar dataKey="revenue" fill="#18181b" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

function RecentOrdersTable({ orders, title }: { orders: Order[]; title: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {orders.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">No orders yet</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>{order.order_number}</TableCell>
                  <TableCell className="text-sm">{formatDateTime(order.created_at)}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(order.status)}>
                      {ORDER_STATUSES[order.status].label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(order.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function ActionPanel({
  icon: Icon,
  title,
  body,
  to,
  action,
}: {
  icon: typeof ShoppingBag
  title: string
  body: string
  to: string
  action: string
}) {
  return (
    <div className="rounded-md border bg-background p-4">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-secondary">
        <Icon className="h-5 w-5" />
      </div>
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-1 min-h-16 text-sm text-muted-foreground">{body}</p>
      <Link to={to}>
        <Button variant="outline" className="mt-4 w-full justify-between">
          {action}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </Link>
    </div>
  )
}

function StatusRow({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'success' | 'default'
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <Badge variant={tone === 'success' ? 'success' : 'secondary'}>{value}</Badge>
    </div>
  )
}
