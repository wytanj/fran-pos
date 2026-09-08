/**
 * Screen A pair hint — the only customer-display UI on the register.
 * Shows what staff type into the Active5 (`/pos/customer-display`):
 * store code + 6-char pair code. Non-blocking; never a second POS.
 */

import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { CustomerDisplayState } from '@/pos/lib/customer-display-types'
import type { CustomerDisplayPublisher } from '@/pos/lib/use-customer-display-publisher'

const STATE_LABEL: Record<CustomerDisplayState, string> = {
  idle: 'Idle brand screen',
  cart: 'Mirroring cart',
  paying: 'Showing amount due',
  done: 'Thank-you flash',
}

export function CustomerDisplayPairDialog({
  open,
  onClose,
  publisher,
  storeCode,
  state,
}: {
  open: boolean
  onClose: () => void
  publisher: CustomerDisplayPublisher
  storeCode: string
  state: CustomerDisplayState
}) {
  const lane = publisher.lane
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Customer display</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          On the customer tablet open <span className="font-mono">/pos/customer-display</span> and enter these codes.
          The tablet only shows what this register publishes.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border bg-surface-sunken p-3">
            <p className="eyebrow">Store code</p>
            <p className="mt-1 font-mono text-2xl font-semibold tracking-wider">{lane?.storeCode || storeCode}</p>
          </div>
          <div className="rounded-lg border bg-surface-sunken p-3">
            <p className="eyebrow">Pair code</p>
            <p className="mt-1 font-mono text-2xl font-semibold tracking-[0.3em]">
              {lane ? lane.pairToken : publisher.status === 'connecting' ? '······' : '—'}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="flex items-center gap-2 text-muted-foreground">
            <span
              className={cn(
                'h-2 w-2 rounded-full',
                publisher.status === 'ready' && 'bg-success',
                publisher.status === 'connecting' && 'bg-yellow-deep',
                publisher.status === 'error' && 'bg-danger',
                publisher.status === 'disabled' && 'bg-line-strong',
              )}
            />
            {publisher.status === 'ready'
              ? `Publishing · ${STATE_LABEL[state]}`
              : publisher.status === 'connecting'
                ? 'Connecting lane…'
                : publisher.status === 'error'
                  ? publisher.error || 'Customer display offline'
                  : 'Customer display off'}
          </span>
          {lane && <span className="font-mono text-muted-foreground">lane {lane.laneCode}</span>}
        </div>

        {publisher.status === 'error' && (
          <p className="rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">
            The register keeps working without the display. Retry once the network is back.
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={publisher.reconnect} disabled={publisher.status === 'connecting'}>
            {publisher.status === 'connecting' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Reconnect
          </Button>
          <Button size="sm" onClick={onClose}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
