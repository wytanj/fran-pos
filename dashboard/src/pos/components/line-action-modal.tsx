import { useEffect, useState } from 'react'
import { Tag, Pencil } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, cn } from '@/lib/utils'
import { DISCOUNT_REASONS, PRICE_OVERRIDE_REASONS, STORE } from '@/pos/data/mock'
import type { CartLine } from '@/pos/lib/pos-context'

export type LineActionMode = 'discount' | 'override'

interface LineActionModalProps {
  open: boolean
  mode: LineActionMode
  line: CartLine | null
  onClose: () => void
  /** Both flows route through manager auth before committing. */
  onApplyDiscount: (lineId: string, amountOff: number, label: string) => void
  onApplyOverride: (lineId: string, newPrice: number, reason: string) => void
}

export function LineActionModal({
  open,
  mode,
  line,
  onClose,
  onApplyDiscount,
  onApplyOverride,
}: LineActionModalProps) {
  const [reasonCode, setReasonCode] = useState<string>(DISCOUNT_REASONS[0].code)
  const [customValue, setCustomValue] = useState('')
  const [overridePrice, setOverridePrice] = useState('')
  const [overrideReason, setOverrideReason] = useState(PRICE_OVERRIDE_REASONS[0])

  useEffect(() => {
    if (!open || !line) return
    setOverridePrice('')
    setOverrideReason(line.overrideReason ?? PRICE_OVERRIDE_REASONS[2])
  }, [line?.lineId, line?.overrideReason, open])

  if (!line) return null

  const reason = DISCOUNT_REASONS.find((r) => r.code === reasonCode)!
  const lineGross = line.unitPrice * Math.abs(line.qty)

  const computedDiscount = (() => {
    if (reason.type === 'percent') return (lineGross * reason.value) / 100
    const v = parseFloat(customValue)
    return isNaN(v) ? 0 : Math.min(v, lineGross)
  })()

  const submitDiscount = () => {
    if (computedDiscount <= 0) return
    onApplyDiscount(line.lineId, computedDiscount, reason.label)
  }

  const submitOverride = () => {
    const v = parseFloat(overridePrice)
    if (isNaN(v) || v < 0) return
    onApplyOverride(line.lineId, v, overrideReason)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" onClose={onClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === 'discount' ? <Tag className="h-5 w-5" /> : <Pencil className="h-5 w-5" />}
            {mode === 'discount' ? 'Manual Line Discount' : 'Price Override'}
          </DialogTitle>
        </DialogHeader>

        <div className="mt-2 rounded-lg border bg-muted/40 p-3 text-sm">
          <div className="flex justify-between font-medium">
            <span>{line.name}</span>
            <span>{formatCurrency(line.unitPrice, STORE.currency)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {line.sku} · Ticket {formatCurrency(line.listPrice, STORE.currency)}
            {line.isMarkdown && <Badge variant="warning" className="ml-2">Markdown</Badge>}
          </p>
        </div>

        {mode === 'discount' ? (
          <div className="mt-4 space-y-3">
            <div>
              <Label>Discount reason (keyword)</Label>
              <div className="mt-1 grid grid-cols-1 gap-1.5">
                {DISCOUNT_REASONS.map((r) => (
                  <button
                    key={r.code}
                    onClick={() => setReasonCode(r.code)}
                    className={cn(
                      'flex items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors cursor-pointer',
                      reasonCode === r.code ? 'border-primary bg-accent' : 'hover:bg-accent'
                    )}
                  >
                    <span>
                      <span className="font-mono text-xs text-muted-foreground">{r.code}</span> · {r.label}
                    </span>
                    {r.type === 'percent' && <Badge variant="secondary">{r.value}%</Badge>}
                  </button>
                ))}
              </div>
            </div>
            {reason.type === 'amount' && (
              <div>
                <Label htmlFor="amt">Amount off ({STORE.currency})</Label>
                <Input
                  id="amt"
                  type="number"
                  className="mt-1"
                  placeholder="0.00"
                  value={customValue}
                  onChange={(e) => setCustomValue(e.target.value)}
                />
              </div>
            )}
            <div className="flex items-center justify-between rounded-lg bg-primary/5 p-3 text-sm">
              <span className="text-muted-foreground">Discount applied</span>
              <span className="text-lg font-semibold">-{formatCurrency(computedDiscount, STORE.currency)}</span>
            </div>
            <p className="text-xs text-muted-foreground">Requires manager authorisation to apply.</p>
            <Button className="w-full" onClick={submitDiscount} disabled={computedDiscount <= 0}>
              Continue to authorisation
            </Button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div>
              <Label htmlFor="newprice">New unit price ({STORE.currency})</Label>
              <Input
                id="newprice"
                type="number"
                className="mt-1"
                placeholder={line.unitPrice.toFixed(2)}
                value={overridePrice}
                onChange={(e) => setOverridePrice(e.target.value)}
              />
            </div>
            <div>
              <Label>Reason</Label>
              <select
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
              >
                {PRICE_OVERRIDE_REASONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </div>
            <p className="text-xs text-muted-foreground">Requires manager authorisation to apply.</p>
            <Button className="w-full" onClick={submitOverride} disabled={!overridePrice}>
              Continue to authorisation
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
