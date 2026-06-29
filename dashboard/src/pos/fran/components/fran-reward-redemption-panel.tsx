import { CheckCircle2, Gift, Loader2, ShieldCheck, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { STORE } from '@/pos/data/mock'
import type { FranAppliedReward, FranBasketPreview, FranRewardDecision, FranRewardQuote } from '../types'

interface FranRewardRedemptionPanelProps {
  preview: FranBasketPreview | null
  quote: FranRewardQuote | null
  appliedReward: FranAppliedReward | null
  quoteLoading: boolean
  onQuote: (reward: FranRewardDecision) => void
  onConfirmQuote: () => void
  onClearReward: () => void
}

export function FranRewardRedemptionPanel({
  preview,
  quote,
  appliedReward,
  quoteLoading,
  onQuote,
  onConfirmQuote,
  onClearReward,
}: FranRewardRedemptionPanelProps) {
  if (!preview) {
    return (
      <div className="rounded-lg border bg-background p-3 text-sm text-muted-foreground">
        Add products and resolve a Fran sale mode to preview earn and rewards.
      </div>
    )
  }

  if (appliedReward) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0">
              <p className="font-medium">{appliedReward.quote.title}</p>
              <p className="mt-0.5 text-xs">
                {formatCurrency(appliedReward.quote.amount, STORE.currency)} applied as a separate sale line.
                Commit status: {appliedReward.status}.
              </p>
            </div>
          </div>
          {appliedReward.status === 'quoted' && (
            <Button variant="outline" size="sm" onClick={onClearReward}>
              <X className="h-4 w-4" /> Remove
            </Button>
          )}
        </div>
      </div>
    )
  }

  if (quote) {
    return (
      <div className="rounded-lg border bg-background p-3">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-semibold">{quote.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{quote.confirmationText}</p>
            {quote.pointsCost > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Points cost: {quote.pointsCost.toLocaleString()}.
              </p>
            )}
          </div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Button variant="outline" onClick={onClearReward}>
            Cancel
          </Button>
          <Button onClick={onConfirmQuote}>
            Confirm redemption
          </Button>
        </div>
      </div>
    )
  }

  const rewards = preview.rewardsAvailable

  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Gift className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Fran rewards</p>
        </div>
        <Badge variant="outline">{rewards.filter((reward) => reward.eligible).length} eligible</Badge>
      </div>

      <div className="space-y-2">
        {rewards.length === 0 && (
          <p className="rounded-md bg-secondary p-2 text-xs text-muted-foreground">
            No rewards for this sale mode.
          </p>
        )}
        {rewards.map((reward) => (
          <div key={reward.id} className="rounded-md border p-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">{reward.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{reward.description}</p>
                {!reward.eligible && reward.reason && (
                  <p className="mt-1 text-xs text-amber-700">{reward.reason}</p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold">{formatCurrency(reward.value, STORE.currency)}</p>
                {reward.pointsCost > 0 && (
                  <p className="text-xs text-muted-foreground">{reward.pointsCost.toLocaleString()} pts</p>
                )}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-2 w-full"
              onClick={() => onQuote(reward)}
              disabled={!reward.eligible || quoteLoading}
            >
              {quoteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Quote redemption
            </Button>
          </div>
        ))}
      </div>

      {preview.warnings[0] && (
        <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
          {preview.warnings[0]}
        </p>
      )}
    </div>
  )
}
