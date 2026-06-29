import { useState } from 'react'
import { toast } from 'sonner'
import { AlertCircle, CheckCircle2, Clock, Loader2, Mail, Plus, Printer, RefreshCcw } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ReceiptPreview } from '@/pos/components/receipt-preview'
import { useCustomerEmailConnector } from '@/hooks/use-customer-email-connector'
import {
  buildCustomerEmailReceiptPayload,
  CUSTOMER_EMAIL_CONNECTOR_MISSING_MESSAGE,
  invokeCustomerEmailConnector,
} from '@/pos/lib/customer-email-connector'
import type { CompletedSale, PosSaleSyncState } from '@/pos/lib/pos-context'

interface SaleCompleteModalProps {
  open: boolean
  sale: CompletedSale | null
  skumsSync?: PosSaleSyncState | null
  pendingSkumsSaleWrites?: number
  retryingSkumsSync?: boolean
  onRetrySkumsSync?: () => void
  onNewSale: () => void
}

export function SaleCompleteModal({
  open,
  sale,
  skumsSync,
  pendingSkumsSaleWrites = 0,
  retryingSkumsSync = false,
  onRetrySkumsSync,
  onNewSale,
}: SaleCompleteModalProps) {
  const { connector } = useCustomerEmailConnector()
  const [emailSending, setEmailSending] = useState(false)

  if (!sale) return null
  const sync = skumsSync ?? sale.skumsSync

  const handleEmail = async () => {
    if (!connector) {
      toast.info(CUSTOMER_EMAIL_CONNECTOR_MISSING_MESSAGE)
      return
    }

    setEmailSending(true)
    try {
      const payload = buildCustomerEmailReceiptPayload(sale)
      await invokeCustomerEmailConnector(connector, payload)
      toast.success(`Receipt email sent to ${payload.recipient.email}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send receipt email')
    } finally {
      setEmailSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <div className="mb-3 flex flex-col items-center text-center">
          <CheckCircle2 className="h-10 w-10 text-green-600" />
          <h2 className="mt-2 text-lg font-semibold">
            {sale.isExchange ? 'Exchange completed' : 'Sale completed'}
          </h2>
          <p className="text-sm text-muted-foreground">
            Receipt {sale.receiptNo} - {sync.status === 'synced' ? 'SKUMS synced' : 'receipt ready'}
            {sale.customer && sale.customer.points > 0 && ` - +${sale.pointsEarned} pts to ${sale.customer.name}`}
          </p>
        </div>

        <SkumsSaleSyncStatus
          sync={sync}
          pendingCount={pendingSkumsSaleWrites}
          retrying={retryingSkumsSync}
          onRetry={onRetrySkumsSync}
        />

        <div className="rounded-lg bg-secondary p-3">
          <ReceiptPreview sale={sale} />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <Button variant="outline">
            <Printer className="h-4 w-4" /> Print
          </Button>
          <Button variant="outline" onClick={handleEmail} disabled={emailSending}>
            <Mail className="h-4 w-4" /> {emailSending ? 'Sending' : 'Email'}
          </Button>
          <Button onClick={onNewSale}>
            <Plus className="h-4 w-4" /> New Sale
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SkumsSaleSyncStatus({
  sync,
  pendingCount,
  retrying,
  onRetry,
}: {
  sync: PosSaleSyncState
  pendingCount: number
  retrying: boolean
  onRetry?: () => void
}) {
  if (sync.status === 'not_required' && pendingCount === 0) {
    return (
      <div className="mb-3 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
        Sale is recorded locally for this register session.
      </div>
    )
  }

  const icon =
    sync.status === 'synced' ? (
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
    ) : sync.status === 'syncing' ? (
      <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
    ) : sync.status === 'queued' || pendingCount > 0 ? (
      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
    ) : (
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
    )

  const message =
    sync.status === 'synced'
      ? `SKUMS sale ${sync.saleId ?? sync.idempotencyKey} synced.`
      : sync.status === 'syncing'
        ? 'Writing sale to SKUMS. Receipt display is not blocked.'
        : sync.status === 'queued'
          ? 'SKUMS sale write is queued for retry.'
          : sync.error || 'SKUMS sale sync needs attention.'

  return (
    <div className="mb-3 flex items-start justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm">
      <div className="flex min-w-0 items-start gap-2">
        {icon}
        <div className="min-w-0">
          <p className="font-medium">{message}</p>
          {pendingCount > 0 && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {pendingCount} pending SKUMS sale write{pendingCount === 1 ? '' : 's'} on this register.
            </p>
          )}
        </div>
      </div>
      {pendingCount > 0 && onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} disabled={retrying}>
          {retrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
          Retry
        </Button>
      )}
    </div>
  )
}
