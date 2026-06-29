import { useState, useEffect } from 'react'
import { useAuth } from '@/providers/auth-provider'
import { useCompanySettings, useUpdateSettings, useUpdateCompany } from '@/hooks/use-settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { toast } from 'sonner'

const currencies = ['USD', 'EUR', 'GBP', 'PHP', 'SGD', 'AUD', 'CAD', 'JPY', 'KRW', 'MYR']
const timezones = [
  'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'Europe/London', 'Europe/Paris', 'Asia/Singapore', 'Asia/Manila', 'Asia/Tokyo', 'Australia/Sydney',
]

export default function CompanySettingsPage() {
  const { company } = useAuth()
  const { data: settings } = useCompanySettings()
  const updateSettings = useUpdateSettings()
  const updateCompany = useUpdateCompany()

  const [companyName, setCompanyName] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [timezone, setTimezone] = useState('UTC')

  useEffect(() => {
    if (company) setCompanyName(company.name)
    if (settings) {
      setCurrency(settings.currency)
      setTimezone(settings.timezone)
    }
  }, [company, settings])

  const handleSave = async () => {
    try {
      await Promise.all([
        updateCompany.mutateAsync({ name: companyName }),
        updateSettings.mutateAsync({ currency, timezone }),
      ])
      toast.success('Settings saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Company Profile</CardTitle>
        <CardDescription>Manage your business information</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Business Name</Label>
          <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Currency</Label>
            <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {currencies.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Timezone</Label>
            <Select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {timezones.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </Select>
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={updateSettings.isPending || updateCompany.isPending}>
            Save Changes
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
