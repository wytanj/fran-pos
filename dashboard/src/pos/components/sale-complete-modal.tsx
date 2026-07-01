import { useState } from 'react'
import { toast } from 'sonner'
import { AlertCircle, Ban, CheckCircle2, Clock, Loader2, Mail, Plus, Printer, RefreshCcw } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ReceiptPreview } from '@/pos/components/receipt-preview'
import { cn } from '@/lib/utils'
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
  pendingSourceEvents?: number
  retryingSourceEvents?: boolean
  onRetrySourceEvents?: () => void
  voidingSale?: boolean
  onRetrySkumsSync?: () => void
  onVoidSale?: () => void
  onNewSale: () => void
}

export function SaleCompleteModal({
  open,
  sale,
  skumsSync,
  pendingSkumsSaleWrites = 0,
  retryingSkumsSync = false,
  pendingSourceEvents = 0,
  retryingSourceEvents = false,
  onRetrySourceEvents,
  voidingSale = false,
  onRetrySkumsSync,
  onVoidSale,
  onNewSale,
}: SaleCompleteModalProps) {
  const { connector } = useCustomerEmailConnector()
  const [emailSending, setEmailSending] = useState(false)

  if (!sale) return null
  const sync = skumsSync ?? sale.skumsSync
  const pointsSummary = buildFranPointsSummary(sale)
  const isVoided = sale.saleStatus === 'voided'

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
          {isVoided ? (
            <Ban className="h-10 w-10 text-destructive" />
          ) : (
            <CheckCircle2 className="h-10 w-10 text-green-600" />
          )}
          <h2 className="mt-2 text-lg font-semibold">
            {isVoided ? 'Sale voided' : sale.isExchange ? 'Exchange completed' : 'Sale completed'}
          </h2>
          <p className="text-sm text-muted-foreground">
            Receipt {sale.receiptNo} - {isVoided ? 'void recorded' : sync.status === 'synced' ? 'SKUMS synced' : 'receipt ready'}
            {!isVoided && sale.customer && sale.customer.points > 0 && ` - +${sale.pointsEarned} pts to ${sale.customer.name}`}
          </p>
        </div>

        <SkumsSaleSyncStatus
          sync={sync}
          pendingCount={pendingSkumsSaleWrites}
          retrying={retryingSkumsSync}
          onRetry={onRetrySkumsSync}
        />

        <FranLoyaltySyncStatus
          sale={sale}
          pendingCount={pendingSourceEvents}
          retrying={retryingSourceEvents}
          onRetry={onRetrySourceEvents}
        />

        {pointsSummary && (
          <div className="mb-3 rounded-lg border bg-background p-3">
            <p className="text-sm font-semibold">Fran points summary</p>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-md bg-secondary px-2 py-2">
                <p className="text-xs text-muted-foreground">Points earned</p>
                <p className="font-semibold tabular-nums">+{pointsSummary.earned.toLocaleString()}</p>
              </div>
              <div className="rounded-md bg-secondary px-2 py-2">
                <p className="text-xs text-muted-foreground">Points redeemed</p>
                <p className="font-semibold tabular-nums">
                  {pointsSummary.redeemed > 0 ? '-' : ''}
                  {pointsSummary.redeemed.toLocaleString()}
                </p>
              </div>
              <div className="rounded-md bg-secondary px-2 py-2">
                <p className="text-xs text-muted-foreground">Updated running balance</p>
                <p className="font-semibold tabular-nums">{pointsSummary.runningBalance.toLocaleString()}</p>
              </div>
            </div>
          </div>
        )}

        <FranRewardReversalStatus sale={sale} />

        <div className="rounded-lg bg-secondary p-3">
          <ReceiptPreview sale={sale} />
        </div>

        <div className={cn('mt-4 grid gap-2', onVoidSale ? 'grid-cols-4' : 'grid-cols-3')}>
          {onVoidSale && (
            <Button variant="outline" onClick={onVoidSale} disabled={isVoided || voidingSale}>
              {voidingSale ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
              {isVoided ? 'Voided' : 'Void'}
            </Button>
          )}
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

function buildFranPointsSummary(sale: CompletedSale) {
  const member = sale.fran?.counterSession?.member ?? null
  if (!member) return null

  const reward = sale.fran?.appliedReward ?? null
  const rewardReversed = reward?.status === 'reversed'
  const earned = sale.saleStatus === 'voided' ? 0 : sale.pointsEarned
  const redeemed = rewardReversed ? 0 : reward?.quote.pointsCost ?? 0
  const balanceAfterRedemption =
    rewardReversed
      ? reward.reverse?.pointsBalanceAfter ?? member.pointsBalance
      : reward?.commit?.pointsBalanceAfter ?? Math.max(0, member.pointsBalance - redeemed)

  return {
    earned,
    redeemed,
    runningBalance: Math.max(0, balanceAfterRedemption + earned),
  }
}

function FranRewardReversalStatus({ sale }: { sale: CompletedSale }) {
  const reward = sale.fran?.appliedReward ?? null
  if (!reward) return null

  if (reward.status === 'reversed' && reward.reverse) {
    return (
      <div className="mb-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
        <p className="font-medium">Fran reward reversed</p>
        <p className="mt-0.5 text-xs">
          {reward.reverse.pointsRestored.toLocaleString()} pts restored. Balance is{' '}
          {(reward.reverse.pointsBalanceAfter ?? 0).toLocaleString()}. Reward available:{' '}
          {reward.reverse.rewardAvailable ? 'yes' : 'pending'}.
        </p>
      </div>
    )
  }

  if (reward.status === 'reverse_failed') {
    return (
      <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        <p className="font-medium">Fran reward reversal needs attention</p>
        <p className="mt-0.5 text-xs">{reward.error ?? 'Fran CRM did not confirm points restoration.'}</p>
      </div>
    )
  }

  if (reward.status === 'committed') {
    return (
      <div className="mb-3 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
        Fran reward committed. Voiding this transaction will reverse the CRM reward and restore{' '}
        {reward.quote.pointsCost.toLocaleString()} pts.
      </div>
    )
  }

  if (reward.status === 'failed') {
    return (
      <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        Fran reward was not committed. {reward.error ?? 'No points were deducted.'}
      </div>
    )
  }

  return null
}

function FranLoyaltySyncStatus({
  sale,
  pendingCount,
  retrying,
  onRetry,
}: {
  sale: CompletedSale
  pendingCount: number
  retrying: boolean
  onRetry?: () => void
}) {
  const sync = sale.fran?.loyaltySync ?? null
  const hasQueuedEarn = sync?.status === 'queued'
  if (!hasQueuedEarn && pendingCount === 0) return null

  const queuedPoints = sync?.pointsEarnQueued ?? 0
  return (
    <div className="mb-3 flex items-start justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <div className="flex min-w-0 items-start gap-2">
        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
        <div className="min-w-0">
          <p className="font-medium">
            {hasQueuedEarn
              ? `Fran CRM offline - ${queuedPoints.toLocaleString()} pts earn queued.`
              : 'Fran source events queued.'}
          </p>
          <p className="mt-0.5 text-xs text-amber-800">
            Sale is complete. Loyalty will sync on reconnect and must not block checkout.
          </p>
          {pendingCount > 0 && (
            <p className="mt-0.5 text-xs text-amber-800">
              {pendingCount} pending POS source event{pendingCount === 1 ? '' : 's'} on this register.
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
