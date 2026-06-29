import { useState } from 'react'
import { useTaxRates, useCreateTaxRate, useDeleteTaxRate } from '@/hooks/use-settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

export default function TaxSettingsPage() {
  const { data: taxRates = [], isLoading } = useTaxRates()
  const createTaxRate = useCreateTaxRate()
  const deleteTaxRate = useDeleteTaxRate()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState('')
  const [rate, setRate] = useState('')
  const [isInclusive, setIsInclusive] = useState(false)
  const [isDefault, setIsDefault] = useState(false)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createTaxRate.mutateAsync({
        name,
        rate: parseFloat(rate) / 100,
        is_inclusive: isInclusive,
        is_default: isDefault,
      })
      toast.success('Tax rate created')
      setDialogOpen(false)
      setName('')
      setRate('')
      setIsInclusive(false)
      setIsDefault(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this tax rate?')) return
    try {
      await deleteTaxRate.mutateAsync(id)
      toast.success('Tax rate deleted')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Tax Rates</CardTitle>
          <CardDescription>Configure tax rates for your products</CardDescription>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" /> Add Tax Rate
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : taxRates.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center">No tax rates configured.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Default</TableHead>
                <TableHead className="w-16">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {taxRates.map((tax) => (
                <TableRow key={tax.id}>
                  <TableCell className="font-medium">{tax.name}</TableCell>
                  <TableCell>{(tax.rate * 100).toFixed(2)}%</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{tax.is_inclusive ? 'Inclusive' : 'Exclusive'}</Badge>
                  </TableCell>
                  <TableCell>{tax.is_default ? 'Yes' : '-'}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(tax.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent onClose={() => setDialogOpen(false)}>
          <DialogHeader>
            <DialogTitle>New Tax Rate</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input placeholder="e.g., Sales Tax, VAT" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Rate (%)</Label>
              <Input type="number" step="0.01" min="0" max="100" placeholder="e.g., 12" value={rate} onChange={(e) => setRate(e.target.value)} required />
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch checked={isInclusive} onCheckedChange={setIsInclusive} />
                <Label>Tax Inclusive</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={isDefault} onCheckedChange={setIsDefault} />
                <Label>Default</Label>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createTaxRate.isPending}>Create</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
