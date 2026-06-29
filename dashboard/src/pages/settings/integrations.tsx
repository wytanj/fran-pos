import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CloudDownload, KeyRound, Mail, ShieldCheck, UsersRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useSaveCustomerEmailConnector } from '@/hooks/use-customer-email-connector'
import { useSaveSkumsConnector, useSkumsConnector } from '@/hooks/use-skums-connector'
import { maskCustomerEmailToken } from '@/pos/lib/customer-email-connector'
import { listSkumsPosCatalog } from '@/pos/lib/skums-client'
import { buildSkumsConnectorSettings, maskSkumsApiKey, toSkumsConnectorConfig } from '@/pos/lib/skums-connector'

const defaultPosConfig = {
  quick_sale_mode: false,
  require_customer: false,
  allow_negative_inventory: false,
  default_tax_rate_id: null,
}

export default function IntegrationsPage() {
  const { data: settings, connector } = useSkumsConnector()
  const saveSkumsConnector = useSaveSkumsConnector()
  const saveCustomerEmailConnector = useSaveCustomerEmailConnector()
  const [testing, setTesting] = useState(false)
  const [skumsHealth, setSkumsHealth] = useState<'unchecked' | 'healthy' | 'failed'>('unchecked')
  const [lastSkumsCheck, setLastSkumsCheck] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem('pos_skums_connector_last_success')
  })
  const [form, setForm] = useState({
    enabled: true,
    api_url: 'https://skums.vercel.app',
    api_key: '',
  })
  const [emailForm, setEmailForm] = useState({
    enabled: false,
    provider_label: 'Customer email API',
    endpoint_url: '',
    auth_type: 'bearer' as 'none' | 'bearer',
    auth_token: '',
    from_email: '',
    reply_to_email: '',
  })
  const [franForm, setFranForm] = useState(() => {
    if (typeof window === 'undefined') {
      return { endpoint_url: '', offline_mode: true }
    }
    return {
      endpoint_url: localStorage.getItem('fran_crm_endpoint_url') || '',
      offline_mode: localStorage.getItem('fran_crm_offline_mode') !== 'false',
    }
  })

  useEffect(() => {
    const saved = settings?.pos_config?.skums_connector
    if (!saved) return
    setForm({
      enabled: saved.enabled,
      api_url: saved.api_url || 'https://skums.vercel.app',
      api_key: saved.api_key || '',
    })
  }, [settings])

  useEffect(() => {
    const saved = settings?.pos_config?.customer_email_connector
    if (!saved) return
    setEmailForm({
      enabled: saved.enabled,
      provider_label: saved.provider_label || 'Customer email API',
      endpoint_url: saved.endpoint_url || '',
      auth_type: saved.auth_type || 'bearer',
      auth_token: saved.auth_token || '',
      from_email: saved.from_email || '',
      reply_to_email: saved.reply_to_email || '',
    })
  }, [settings])

  const handleSave = async () => {
    try {
      await saveSkumsConnector.mutateAsync(form)
      toast.success('SKUMS connector saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save SKUMS connector')
    }
  }

  const handleTest = async () => {
    setTesting(true)
    try {
      const config = toSkumsConnectorConfig({
        pos_config: {
          ...defaultPosConfig,
          ...(settings?.pos_config || {}),
          skums_connector: buildSkumsConnectorSettings(form),
        },
      })
      if (!config) throw new Error('Enter the SKUMS API URL and account key first')
      const result = await listSkumsPosCatalog({ limit: 1 }, config)
      const checkedAt = new Date().toISOString()
      setSkumsHealth('healthy')
      setLastSkumsCheck(checkedAt)
      localStorage.setItem('pos_skums_connector_last_success', checkedAt)
      toast.success(`Connected to SKUMS. ${result.total.toLocaleString()} POS catalog item${result.total === 1 ? '' : 's'} available.`)
    } catch (err) {
      setSkumsHealth('failed')
      toast.error(err instanceof Error ? err.message : 'Failed to connect to SKUMS')
    } finally {
      setTesting(false)
    }
  }

  const handleSaveCustomerEmail = async () => {
    try {
      await saveCustomerEmailConnector.mutateAsync(emailForm)
      toast.success('Customer email connector saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save email connector')
    }
  }

  const handleSaveFranCrm = () => {
    localStorage.setItem('fran_crm_endpoint_url', franForm.endpoint_url.trim())
    localStorage.setItem('fran_crm_offline_mode', String(franForm.offline_mode))
    toast.success('Fran CRM settings saved for this register')
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Fran CRM</CardTitle>
          <CardDescription>Configure the POS-side CRM decision endpoint once the Fran CRM fork is live.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>Offline/mock CRM mode</Label>
              <p className="text-sm text-muted-foreground">Use mocked member, preview, and reward decisions for cashier workflow design.</p>
            </div>
            <Switch
              checked={franForm.offline_mode}
              onCheckedChange={(offline_mode) => setFranForm({ ...franForm, offline_mode })}
            />
          </div>

          <div className="space-y-2">
            <Label>Fran CRM API URL</Label>
            <Input
              value={franForm.endpoint_url}
              onChange={(event) => setFranForm({ ...franForm, endpoint_url: event.target.value })}
              placeholder="https://fran-crm.example.com"
            />
          </div>

          <div className="rounded-lg border p-3 text-sm text-muted-foreground">
            Browser code should call a POS-safe CRM endpoint or proxy. Do not place CRM, loyalty, SKUMS, or service-role secrets in VITE_ variables.
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSaveFranCrm}>
              <ShieldCheck className="h-4 w-4" /> Save Fran CRM
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>SKUMS Connector</CardTitle>
          <CardDescription>Connect this POS company to a SKUMS account catalog.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <Label>Enable SKUMS import</Label>
            <p className="text-sm text-muted-foreground">Use this connector for catalog imports and SKUMS sale writes.</p>
          </div>
          <Switch checked={form.enabled} onCheckedChange={(enabled) => setForm({ ...form, enabled })} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>SKUMS API URL</Label>
            <Input
              value={form.api_url}
              onChange={(e) => setForm({ ...form, api_url: e.target.value })}
              placeholder="https://skums.vercel.app"
            />
          </div>
          <div className="space-y-2">
            <Label>SKUMS Account Key</Label>
            <Input
              type="password"
              value={form.api_key}
              onChange={(e) => setForm({ ...form, api_key: e.target.value })}
              placeholder="sk_live_..."
            />
          </div>
        </div>

        {connector && (
          <div className="rounded-lg bg-secondary p-3 text-sm">
            <p className="font-medium">Connector configured</p>
            <p className="mt-1 text-muted-foreground">
              {connector.apiUrl} - {maskSkumsApiKey(connector.apiKey)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Health: {skumsHealth === 'healthy' ? 'Connected' : skumsHealth === 'failed' ? 'Last check failed' : 'Not checked this session'}
              {lastSkumsCheck ? ` - Last successful check ${new Date(lastSkumsCheck).toLocaleString()}` : ''}
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleTest} disabled={testing}>
            <CloudDownload className="h-4 w-4" /> {testing ? 'Testing...' : 'Test Connection'}
          </Button>
          <Button onClick={handleSave} disabled={saveSkumsConnector.isPending}>
            <KeyRound className="h-4 w-4" /> {saveSkumsConnector.isPending ? 'Saving...' : 'Save Connector'}
          </Button>
        </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Customer Email Connector</CardTitle>
          <CardDescription>Send receipt email requests to each merchant's own email platform API.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>Enable receipt email API</Label>
              <p className="text-sm text-muted-foreground">POS posts a receipt payload to this endpoint when Email is tapped.</p>
            </div>
            <Switch checked={emailForm.enabled} onCheckedChange={(enabled) => setEmailForm({ ...emailForm, enabled })} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Provider label</Label>
              <Input
                value={emailForm.provider_label}
                onChange={(e) => setEmailForm({ ...emailForm, provider_label: e.target.value })}
                placeholder="Marketing email API, custom webhook..."
              />
            </div>
            <div className="space-y-2">
              <Label>Endpoint URL</Label>
              <Input
                value={emailForm.endpoint_url}
                onChange={(e) => setEmailForm({ ...emailForm, endpoint_url: e.target.value })}
                placeholder="https://email.example.com/pos/receipt"
              />
            </div>
            <div className="space-y-2">
              <Label>Auth type</Label>
              <Select
                value={emailForm.auth_type}
                onChange={(e) => setEmailForm({ ...emailForm, auth_type: e.target.value as 'none' | 'bearer' })}
              >
                <option value="bearer">Bearer token</option>
                <option value="none">No auth</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>API token</Label>
              <Input
                type="password"
                value={emailForm.auth_token}
                onChange={(e) => setEmailForm({ ...emailForm, auth_token: e.target.value })}
                placeholder="Optional bearer token"
                disabled={emailForm.auth_type === 'none'}
              />
            </div>
            <div className="space-y-2">
              <Label>From email</Label>
              <Input
                type="email"
                value={emailForm.from_email}
                onChange={(e) => setEmailForm({ ...emailForm, from_email: e.target.value })}
                placeholder="receipts@merchant.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Reply-to email</Label>
              <Input
                type="email"
                value={emailForm.reply_to_email}
                onChange={(e) => setEmailForm({ ...emailForm, reply_to_email: e.target.value })}
                placeholder="support@merchant.com"
              />
            </div>
          </div>

          {settings?.pos_config?.customer_email_connector?.enabled && (
            <div className="rounded-lg bg-secondary p-3 text-sm">
              <p className="font-medium">Email connector configured</p>
              <p className="mt-1 text-muted-foreground">
                {settings.pos_config.customer_email_connector.provider_label} -{' '}
                {settings.pos_config.customer_email_connector.endpoint_url}
                {settings.pos_config.customer_email_connector.auth_type === 'bearer' &&
                  ` - ${maskCustomerEmailToken(settings.pos_config.customer_email_connector.auth_token)}`}
              </p>
            </div>
          )}

          <div className="rounded-lg border p-3 text-sm text-muted-foreground">
            Receipt email requests are posted as JSON with recipient, customer, receipt, line, payment, and message fields.
            The receiving endpoint owns template rendering, suppression rules, deliverability, and audit logging.
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSaveCustomerEmail} disabled={saveCustomerEmailConnector.isPending}>
              <Mail className="h-4 w-4" /> {saveCustomerEmailConnector.isPending ? 'Saving...' : 'Save Email Connector'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rippling Workforce</CardTitle>
          <CardDescription>Sync EOR-backed workers into POS staff when the Rippling token source is configured.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3 rounded-lg border p-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary">
              <UsersRound className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="font-medium">Roster sync ready at the POS staff API layer</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Staff records already support source provider, external worker IDs, employment type, EOR provider, and sync timestamps. Token storage and scheduling can be added without changing register login.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
