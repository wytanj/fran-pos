import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CloudDownload, CreditCard, KeyRound, Mail, ShieldCheck, UsersRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useSaveCustomerEmailConnector } from '@/hooks/use-customer-email-connector'
import { useSaveSkumsConnector, useSkumsConnector } from '@/hooks/use-skums-connector'
import { useSaveStripeConnector, useStripeConnector } from '@/hooks/use-stripe-connector'
import {
  cancelStripeReader,
  collectS700Inputs,
  createStripeLocation,
  listStripeLocations,
  registerStripeReader,
  stripeTerminalHealth,
  waitForS700Action,
  type S700DemoForm,
} from '@/pos/lib/stripe-terminal-api'
import { maskCustomerEmailToken } from '@/pos/lib/customer-email-connector'
import { listSkumsPosCatalog } from '@/pos/lib/skums-client'
import { buildSkumsConnectorSettings, maskSkumsApiKey, toSkumsConnectorConfig } from '@/pos/lib/skums-connector'
import { setFranCrmDebugOverride } from '@/pos/fran/lib/fran-crm-client'

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
  const { connector: stripe } = useStripeConnector()
  const saveStripeConnector = useSaveStripeConnector()
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
  const [stripeForm, setStripeForm] = useState({
    enabled: false,
    simulated: true,
    location_id: '',
    s700_reader_id: '',
    merchant_display_name: 'Fran Beauty',
    default_reader: 's700' as 's700' | 'tap_to_pay' | 'auto',
    registration_code: '',
  })
  const [stripeHealth, setStripeHealth] = useState('')
  const [readerDemoBusy, setReaderDemoBusy] = useState(false)
  const [readerDemoResult, setReaderDemoResult] = useState('')
  const [franForm, setFranForm] = useState(() => {
    if (typeof window === 'undefined') {
      return {
        endpoint_url: '',
        offline_mode: true,
        workspace_id: '11111111-1111-4111-8111-111111111111',
      }
    }
    return {
      endpoint_url: localStorage.getItem('fran_crm_endpoint_url') || '',
      offline_mode: localStorage.getItem('fran_crm_offline_mode') !== 'false',
      workspace_id:
        localStorage.getItem('fran_crm_workspace_id') ||
        '11111111-1111-4111-8111-111111111111',
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
    const saved = settings?.pos_config?.stripe_terminal
    if (!saved) return
    setStripeForm((current) => ({
      ...current,
      enabled: saved.enabled,
      simulated: saved.simulated,
      location_id: saved.location_id || '',
      s700_reader_id: saved.s700_reader_id || '',
      merchant_display_name: saved.merchant_display_name || 'Fran Beauty',
      default_reader: saved.default_reader || 's700',
    }))
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

  const handleSaveStripe = async () => {
    try {
      await saveStripeConnector.mutateAsync(stripeForm)
      toast.success('Stripe Terminal settings saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save Stripe Terminal')
    }
  }

  const handleStripeHealth = async () => {
    try {
      const result = await stripeTerminalHealth()
      setStripeHealth(result.simulated_ready ? 'Test-mode secret is ready' : 'Live-mode secret is ready')
      toast.success(result.ok ? 'Stripe backend is reachable' : 'Stripe backend responded unexpectedly')
    } catch (err) {
      setStripeHealth('')
      toast.error(err instanceof Error ? err.message : 'Stripe health check failed')
    }
  }

  const handleCreateLocation = async () => {
    try {
      const { location } = await createStripeLocation({ display_name: stripeForm.merchant_display_name || 'Fran store' })
      setStripeForm((current) => ({ ...current, location_id: location.id }))
      toast.success(`Created location ${location.id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create location')
    }
  }

  const handleListLocations = async () => {
    try {
      const { locations } = await listStripeLocations()
      if (locations[0] && !stripeForm.location_id) {
        setStripeForm((current) => ({ ...current, location_id: locations[0].id }))
      }
      toast.success(locations.length ? `${locations.length} Terminal location(s)` : 'No locations yet')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not list locations')
    }
  }

  const handleRegisterReader = async () => {
    try {
      if (!stripeForm.location_id) throw new Error('Create or paste a location first')
      const { reader } = await registerStripeReader({
        registration_code: stripeForm.registration_code,
        location_id: stripeForm.location_id,
        label: stripeForm.merchant_display_name || 'Fran S700',
      })
      setStripeForm((current) => ({ ...current, s700_reader_id: reader.id, registration_code: '' }))
      toast.success(`Registered reader ${reader.id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not register reader')
    }
  }

  const handleReaderDemo = async (form: S700DemoForm, label: string) => {
    if (readerDemoBusy) return
    const readerId = stripeForm.s700_reader_id.trim()
    if (!readerId) {
      toast.error('Set the S700 reader ID first')
      return
    }
    setReaderDemoBusy(true)
    setReaderDemoResult(`Showing "${label}" on the S700 — hand the reader to the customer…`)
    try {
      await collectS700Inputs(readerId, form)
      const reader = await waitForS700Action(readerId, { timeoutMs: 120_000 })
      const parts = (reader.collected_inputs || []).map((inp) =>
        inp.skipped ? `${inp.type}: skipped` : `${inp.type}: ${inp.value ?? '(no value)'}`,
      )
      setReaderDemoResult(parts.length ? `Customer answered → ${parts.join(' · ')}` : 'Completed, no inputs returned')
      toast.success('S700 demo completed')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'S700 demo failed'
      setReaderDemoResult(message)
      toast.error(message)
      void cancelStripeReader(readerId).catch(() => {})
    } finally {
      setReaderDemoBusy(false)
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
    localStorage.setItem(
      'fran_crm_workspace_id',
      franForm.workspace_id.trim() || '11111111-1111-4111-8111-111111111111',
    )
    // Workspace routing is SKUMS's decision alone. This legacy path may only run for the
    // current browser tab's session — never persisted, never assumed from a bare endpoint URL —
    // so saving it here is the one explicit, conscious act that grants that temporary trust.
    const goingLive = !franForm.offline_mode && Boolean(franForm.endpoint_url.trim())
    setFranCrmDebugOverride(goingLive)
    toast.success(
      goingLive
        ? 'Fran CRM live endpoint saved for this session only — reload Sale to use CRM policy/members'
        : 'Fran CRM settings saved (mock/offline)',
    )
  }

  const handleTestFranCrm = async () => {
    const base = franForm.endpoint_url.trim().replace(/\/+$/, '')
    if (!base) {
      toast.error('Enter Fran CRM API URL first')
      return
    }
    try {
      const ws = franForm.workspace_id.trim() || '11111111-1111-4111-8111-111111111111'
      const res = await fetch(
        `${base}/api/fran/loyalty/policy-versions/active?workspaceId=${encodeURIComponent(ws)}&programKey=fran-v2&format=pos`,
        { headers: { 'x-pos-client': 'fran-pos' } },
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.json()
      if (!body?.policyVersionId && !body?.posPolicyBundle?.policyVersionId) {
        throw new Error('Response missing policyVersionId')
      }
      toast.success('Fran CRM policy endpoint OK (format=pos)')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fran CRM policy test failed')
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>SKUMS Connector</CardTitle>
          <CardDescription>
            Required for live catalog, sales, and loyalty. POS holds only this workspace key — CRM is linked on SKUMS HQ
            (Integrations → Fran CRM).
          </CardDescription>
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
          <CardTitle>Stripe Terminal</CardTitle>
          <CardDescription>
            Store kit: Galaxy Tab runs Fran POS. The Stripe S700 takes the customer card. Tap on tablet is backup only.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-start gap-3 rounded-lg border p-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-yellow-soft text-brown">
              <CreditCard className="h-5 w-5" />
            </div>
            <div className="min-w-0 text-sm text-muted-foreground">
              Pair one S700 to this store location. Cashiers stay on the Galaxy Tab; the customer taps, inserts, or swipes on the S700. Set <code>STRIPE_SECRET_KEY</code> on Vercel.
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>Enable Stripe Terminal</Label>
              <p className="text-sm text-muted-foreground">Opens Pay on the S700 from the Galaxy Tab register.</p>
            </div>
            <Switch checked={stripeForm.enabled} onCheckedChange={(enabled) => setStripeForm({ ...stripeForm, enabled })} />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>Simulated / test mode</Label>
              <p className="text-sm text-muted-foreground">Uses Stripe test helpers so reviewers can complete a sale without a physical card.</p>
            </div>
            <Switch checked={stripeForm.simulated} onCheckedChange={(simulated) => setStripeForm({ ...stripeForm, simulated })} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Merchant display name</Label>
              <Input
                value={stripeForm.merchant_display_name}
                onChange={(e) => setStripeForm({ ...stripeForm, merchant_display_name: e.target.value })}
                placeholder="Fran Beauty"
              />
            </div>
            <div className="space-y-2">
              <Label>Default reader</Label>
              <Select
                value={stripeForm.default_reader}
                onChange={(e) => setStripeForm({ ...stripeForm, default_reader: e.target.value as typeof stripeForm.default_reader })}
              >
                <option value="s700">S700 (Galaxy Tab + reader)</option>
                <option value="tap_to_pay">Tap on tablet (backup)</option>
                <option value="auto">Auto</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Location ID</Label>
              <Input
                value={stripeForm.location_id}
                onChange={(e) => setStripeForm({ ...stripeForm, location_id: e.target.value })}
                placeholder="tml_..."
              />
            </div>
            <div className="space-y-2">
              <Label>S700 reader ID</Label>
              <Input
                value={stripeForm.s700_reader_id}
                onChange={(e) => setStripeForm({ ...stripeForm, s700_reader_id: e.target.value })}
                placeholder="tmr_..."
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Register S700 pairing code</Label>
              <Input
                value={stripeForm.registration_code}
                onChange={(e) => setStripeForm({ ...stripeForm, registration_code: e.target.value })}
                placeholder="Three-word code from the reader, or simulated-wpe for test"
              />
            </div>
          </div>

          {stripe && (
            <div className="rounded-lg bg-secondary p-3 text-sm">
              <p className="font-medium">Stripe Terminal configured</p>
              <p className="mt-1 text-muted-foreground">
                Location {stripe.location_id || 'not set'} · Reader {stripe.s700_reader_id || 'not set'}
                {stripe.simulated ? ' · Simulated' : ' · Live hardware'}
              </p>
              {stripeHealth && <p className="mt-1 text-xs text-muted-foreground">{stripeHealth}</p>}
            </div>
          )}

          <div className="rounded-lg border p-3">
            <Label>Reader demos — customer input on the S700</Label>
            <p className="mt-1 text-sm text-muted-foreground">
              Sends an on-reader form to the S700 so the customer can answer on its screen. Results appear here.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={readerDemoBusy} onClick={() => void handleReaderDemo('rewards_optin', 'Join Fran Rewards?')}>
                Rewards opt-in
              </Button>
              <Button variant="outline" size="sm" disabled={readerDemoBusy} onClick={() => void handleReaderDemo('phone', 'Mobile number')}>
                Phone capture
              </Button>
              <Button variant="outline" size="sm" disabled={readerDemoBusy} onClick={() => void handleReaderDemo('rating', 'How was your visit?')}>
                Visit rating
              </Button>
              <Button variant="outline" size="sm" disabled={readerDemoBusy} onClick={() => void handleReaderDemo('receipt_email', 'E-receipt email')}>
                E-receipt email
              </Button>
            </div>
            {readerDemoResult && (
              <p className="mt-3 rounded-sm bg-secondary px-3 py-2 text-sm">{readerDemoResult}</p>
            )}
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => void handleStripeHealth()}>Check Stripe backend</Button>
            <Button variant="outline" onClick={() => void handleListLocations()}>Load locations</Button>
            <Button variant="outline" onClick={() => void handleCreateLocation()}>Create location</Button>
            <Button variant="outline" onClick={() => void handleRegisterReader()}>Register reader</Button>
            <Button onClick={() => void handleSaveStripe()} disabled={saveStripeConnector.isPending}>
              {saveStripeConnector.isPending ? 'Saving...' : 'Save Stripe Terminal'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Loyalty (via SKUMS)</CardTitle>
          <CardDescription>
            Production registers do not store CRM secrets. Link CRM on{' '}
            <strong>SKUMS → Integrations → Fran CRM (POS loyalty)</strong>, then Sale uses{' '}
            <code className="text-xs">/fran/pos/loyalty/*</code> with the SKUMS key.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-line bg-surface-sunken p-3 text-sm text-muted-foreground space-y-1">
            <p>
              Demo member when CRM is linked: <code className="text-xs">FRAN-0001</code> · phone{' '}
              <code className="text-xs">81234470</code> → F3.
            </p>
            <p>If SKUMS is not configured, Sale falls back to in-browser mock members (Mei Lin).</p>
          </div>

          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Advanced / dev: direct CRM URL (not for production)
            </summary>
            <div className="mt-4 space-y-4">
              <p className="text-xs text-muted-foreground">
                Only use when debugging CRM without SKUMS. Production path is SKUMS-only.
                Saving here only takes effect for this browser tab or app session — closing the
                tab or force-closing the app clears it, so it can never silently carry over to
                another company or store the way a saved field otherwise would.
              </p>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label>Offline/mock CRM mode</Label>
                  <p className="text-sm text-muted-foreground">
                    Ignored when SKUMS connector is enabled.
                  </p>
                </div>
                <Switch
                  checked={franForm.offline_mode}
                  onCheckedChange={(offline_mode) => setFranForm({ ...franForm, offline_mode })}
                />
              </div>
              <div className="space-y-2">
                <Label>Legacy Fran CRM API URL</Label>
                <Input
                  value={franForm.endpoint_url}
                  onChange={(event) => setFranForm({ ...franForm, endpoint_url: event.target.value })}
                  placeholder="http://localhost:3000"
                />
              </div>
              <div className="space-y-2">
                <Label>Legacy workspace ID</Label>
                <Input
                  value={franForm.workspace_id}
                  onChange={(event) => setFranForm({ ...franForm, workspace_id: event.target.value })}
                  placeholder="11111111-1111-4111-8111-111111111111"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={handleTestFranCrm}>
                  Test legacy CRM
                </Button>
                <Button onClick={handleSaveFranCrm}>
                  <ShieldCheck className="h-4 w-4" /> Save advanced CRM
                </Button>
              </div>
            </div>
          </details>
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
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-yellow-soft text-brown">
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
