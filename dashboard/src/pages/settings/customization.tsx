import { useState, useEffect } from 'react'
import { useCompanySettings, useUpdateSettings } from '@/hooks/use-settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { toast } from 'sonner'
import type { Branding, ReceiptTemplate, PosConfig } from '@pos/shared'

export default function CustomizationPage() {
  const { data: settings } = useCompanySettings()
  const updateSettings = useUpdateSettings()

  const [branding, setBranding] = useState<Branding>({ primary_color: '#000000', logo_url: null })
  const [receipt, setReceipt] = useState<ReceiptTemplate>({
    show_logo: true, header_text: '', footer_text: 'Thank you for your purchase!', show_tax_breakdown: true,
  })
  const [posConfig, setPosConfig] = useState<PosConfig>({
    quick_sale_mode: false, require_customer: false, allow_negative_inventory: false, default_tax_rate_id: null,
  })

  useEffect(() => {
    if (settings) {
      setBranding(settings.branding)
      setReceipt(settings.receipt_template)
      setPosConfig(settings.pos_config)
    }
  }, [settings])

  const handleSave = async () => {
    try {
      await updateSettings.mutateAsync({
        branding,
        receipt_template: receipt,
        pos_config: posConfig,
      })
      toast.success('Customization saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  return (
    <div className="space-y-6">
      {/* Branding */}
      <Card>
        <CardHeader>
          <CardTitle>Branding</CardTitle>
          <CardDescription>Customize your business appearance</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Primary Color</Label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={branding.primary_color}
                onChange={(e) => setBranding({ ...branding, primary_color: e.target.value })}
                className="h-9 w-14 cursor-pointer rounded border p-1"
              />
              <Input
                value={branding.primary_color}
                onChange={(e) => setBranding({ ...branding, primary_color: e.target.value })}
                className="w-28"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Receipt Template */}
      <Card>
        <CardHeader>
          <CardTitle>Receipt Template</CardTitle>
          <CardDescription>Customize how receipts look</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Header Text</Label>
            <Textarea
              placeholder="Text shown at the top of receipts"
              value={receipt.header_text}
              onChange={(e) => setReceipt({ ...receipt, header_text: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Footer Text</Label>
            <Textarea
              value={receipt.footer_text}
              onChange={(e) => setReceipt({ ...receipt, footer_text: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch checked={receipt.show_logo} onCheckedChange={(v) => setReceipt({ ...receipt, show_logo: v })} />
              <Label>Show Logo</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={receipt.show_tax_breakdown} onCheckedChange={(v) => setReceipt({ ...receipt, show_tax_breakdown: v })} />
              <Label>Show Tax Breakdown</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* POS Config */}
      <Card>
        <CardHeader>
          <CardTitle>POS Configuration</CardTitle>
          <CardDescription>Control POS terminal behavior</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Quick Sale Mode</Label>
              <p className="text-sm text-muted-foreground">Skip item details for faster checkout</p>
            </div>
            <Switch checked={posConfig.quick_sale_mode} onCheckedChange={(v) => setPosConfig({ ...posConfig, quick_sale_mode: v })} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Require Customer</Label>
              <p className="text-sm text-muted-foreground">Require customer info for every order</p>
            </div>
            <Switch checked={posConfig.require_customer} onCheckedChange={(v) => setPosConfig({ ...posConfig, require_customer: v })} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Allow Negative Inventory</Label>
              <p className="text-sm text-muted-foreground">Allow selling items even when out of stock</p>
            </div>
            <Switch checked={posConfig.allow_negative_inventory} onCheckedChange={(v) => setPosConfig({ ...posConfig, allow_negative_inventory: v })} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateSettings.isPending}>
          Save All Changes
        </Button>
      </div>
    </div>
  )
}
