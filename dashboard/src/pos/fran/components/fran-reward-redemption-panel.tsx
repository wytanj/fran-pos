import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, Gift, Loader2, ShieldCheck, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn, formatCurrency } from '@/lib/utils'
import { STORE } from '@/pos/data/mock'
import type {
  FranAppliedReward,
  FranBasketPreview,
  FranRewardCatalogueItem,
  FranRewardDecision,
  FranRewardQuote,
} from '../types'

interface FranRewardRedemptionPanelProps {
  preview: FranBasketPreview | null
  quote: FranRewardQuote | null
  appliedReward: FranAppliedReward | null
  quoteLoading: boolean
  onQuote: (reward: FranRewardDecision, pointsToRedeem?: number) => void
  onConfirmQuote: () => void
  onClearReward: () => void
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function formatRewardExpiry(expiresAt: string | null) {
  if (!expiresAt) return null
  const expiry = new Date(expiresAt)
  if (Number.isNaN(expiry.getTime())) return null
  return `expires ${new Intl.DateTimeFormat('en-SG', {
    day: '2-digit',
    month: 'short',
  }).format(expiry)}`
}

function rewardDecisionFromCatalogueItem(reward: FranRewardCatalogueItem): FranRewardDecision {
  return {
    id: reward.id,
    title: reward.name,
    description: reward.description,
    kind: 'catalogue_reward',
    value: reward.value,
    pointsCost: reward.pointsCost,
    expiresAt: reward.expiresAt,
    eligible: true,
    reason: null,
    requiresConfirmation: true,
  }
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
  const pointsOffer = preview?.pointsRedemption ?? null
  const pointsReward = preview?.rewardsAvailable.find((reward) => reward.kind === 'points_redemption') ?? null
  const redeemableRewards = preview?.redeemableRewards ?? []
  const basketTotal = preview?.earnProjection.totalAfterDiscount ?? 0
  const [pointsInput, setPointsInput] = useState('')
  const [catalogueOpen, setCatalogueOpen] = useState(false)
  const [selectedCatalogueReward, setSelectedCatalogueReward] = useState<FranRewardCatalogueItem | null>(null)

  useEffect(() => {
    if (!pointsOffer?.eligible) {
      setPointsInput('')
      return
    }
    setPointsInput((current) => {
      const parsed = Number(current)
      if (
        !current.trim() ||
        !Number.isInteger(parsed) ||
        parsed < pointsOffer.minimumPoints ||
        parsed > pointsOffer.maximumPoints
      ) {
        return String(pointsOffer.minimumPoints)
      }
      return current
    })
  }, [pointsOffer?.eligible, pointsOffer?.maximumPoints, pointsOffer?.minimumPoints])

  const pointsDraft = useMemo(() => {
    if (!pointsOffer) {
      return {
        parsed: 0,
        amount: 0,
        valid: false,
        error: null as string | null,
      }
    }

    const trimmed = pointsInput.trim()
    const parsed = Number(trimmed)
    const wholeNumber = /^\d+$/.test(trimmed) && Number.isInteger(parsed)
    const amount = wholeNumber ? roundCurrency(parsed * pointsOffer.pointsToCurrencyRate) : 0
    let error: string | null = null

    if (!pointsOffer.eligible) error = pointsOffer.reason ?? 'Points redemption is not available.'
    else if (!trimmed) error = 'Enter points to redeem.'
    else if (!wholeNumber) error = 'Enter whole points only.'
    else if (parsed < pointsOffer.minimumPoints) {
      error = `Minimum redemption is ${pointsOffer.minimumPoints.toLocaleString()} points.`
    } else if (parsed > pointsOffer.maximumPoints) {
      error = `Maximum redemption is ${pointsOffer.maximumPoints.toLocaleString()} points.`
    } else if (basketTotal <= 0) {
      error = 'Add sale items before applying redemption.'
    } else if (amount > basketTotal) {
      error = 'Redemption value cannot exceed current basket total.'
    }

    return {
      parsed,
      amount,
      valid: error === null,
      error,
    }
  }, [basketTotal, pointsInput, pointsOffer])

  if (!preview) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
        Add products and resolve a Fran sale mode to preview earn and rewards.
      </div>
    )
  }

  if (appliedReward) {
    return (
      <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-950">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <div className="min-w-0">
              <p className="font-medium">{appliedReward.quote.title}</p>
              <p className="mt-0.5 text-xs">
                {formatCurrency(appliedReward.quote.amount, STORE.currency)} applied as a separate sale line.
                {appliedReward.quote.pointsCost > 0
                  ? ' Points deduct only when payment is confirmed.'
                  : ' Commit status: ' + appliedReward.status + '.'}
              </p>
              {appliedReward.quote.pointsCost > 0 && (
                <p className="mt-0.5 text-xs text-emerald-800">
                  Points redemption line: {appliedReward.quote.pointsCost.toLocaleString()} pts.
                  Commit status: {appliedReward.status}.
                </p>
              )}
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
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-blue-950">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          <div>
            <p className="text-sm font-semibold">{quote.title}</p>
            <p className="mt-1 text-xs text-blue-800">{quote.confirmationText}</p>
            {quote.pointsCost > 0 && (
              <div className="mt-2 grid gap-1 rounded-md border border-blue-100 bg-white px-2 py-1.5 text-xs text-blue-800 sm:grid-cols-3">
                <span>Points redeemed: {quote.pointsCost.toLocaleString()}</span>
                <span>Dollar value: {formatCurrency(quote.amount, quote.currency)}</span>
                <span>
                  After redemption:{' '}
                  {quote.pointsBalanceAfterRedemption == null
                    ? '-'
                    : quote.pointsBalanceAfterRedemption.toLocaleString()}
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Button variant="outline" onClick={onClearReward}>
            Cancel
          </Button>
          <Button onClick={onConfirmQuote}>
            Customer confirmed
          </Button>
        </div>
      </div>
    )
  }

  const rewards = preview.rewardsAvailable.filter((reward) => reward.kind !== 'points_redemption')
  const showPointsPrompt = Boolean(pointsOffer?.eligible && pointsReward)
  const showRewardCatalogue = redeemableRewards.length > 0
  const eligibleCount = rewards.filter((reward) => reward.eligible).length + (showPointsPrompt ? 1 : 0)
  const selectedRewardBalanceAfter =
    selectedCatalogueReward && pointsOffer
      ? Math.max(0, pointsOffer.availablePoints - selectedCatalogueReward.pointsCost)
      : null

  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Gift className="h-4 w-4 text-teal-600" />
          <p className="text-sm font-semibold">Fran rewards</p>
        </div>
        <Badge variant="outline" className="border-teal-200 bg-teal-50 text-teal-800">{eligibleCount} usable now</Badge>
      </div>

      <div className="space-y-2">
        {showRewardCatalogue && (
          <div className="rounded-md border border-teal-200 bg-teal-50 p-2.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full justify-between border-teal-300 bg-white text-teal-900 hover:bg-teal-100"
              aria-expanded={catalogueOpen}
              onClick={() => setCatalogueOpen((open) => !open)}
            >
              <span className="flex items-center gap-2">
                <Gift className="h-4 w-4" />
                Rewards Available: use now
              </span>
              <Badge variant="outline" className="border-teal-300 bg-teal-50 text-teal-800">{redeemableRewards.length}</Badge>
            </Button>

            {catalogueOpen && (
              <div className="mt-2 space-y-2">
                {selectedCatalogueReward && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-amber-950">
                    <p className="text-sm font-semibold">
                      Apply {selectedCatalogueReward.name} ({selectedCatalogueReward.pointsCost.toLocaleString()} pts)?
                    </p>
                    <div className="mt-2 grid gap-1.5 text-xs sm:grid-cols-3">
                      <div className="rounded-sm bg-white px-2 py-1">
                        <p className="text-amber-700">Reward to use</p>
                        <p className="font-medium">{selectedCatalogueReward.name}</p>
                        {formatRewardExpiry(selectedCatalogueReward.expiresAt) && (
                          <p className="text-amber-700">{formatRewardExpiry(selectedCatalogueReward.expiresAt)}</p>
                        )}
                      </div>
                      <div className="rounded-sm bg-white px-2 py-1">
                        <p className="text-amber-700">Points cost</p>
                        <p className="font-medium text-amber-950">{selectedCatalogueReward.pointsCost.toLocaleString()}</p>
                      </div>
                      <div className="rounded-sm bg-white px-2 py-1">
                        <p className="text-emerald-700">Remaining balance</p>
                        <p className="font-medium text-emerald-950">{selectedRewardBalanceAfter?.toLocaleString() ?? '-'}</p>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedCatalogueReward(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={quoteLoading}
                        onClick={() => {
                          if (!selectedCatalogueReward) return
                          const reward = selectedCatalogueReward
                          setSelectedCatalogueReward(null)
                          onQuote(rewardDecisionFromCatalogueItem(reward))
                        }}
                      >
                        {quoteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                        Yes
                      </Button>
                    </div>
                  </div>
                )}

                {redeemableRewards.map((reward) => (
                  <button
                    key={reward.id}
                    type="button"
                    className="w-full rounded-md border border-teal-200 bg-white p-2 text-left transition-colors hover:bg-teal-100"
                    onClick={() => setSelectedCatalogueReward(reward)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          <span>{reward.name}</span>
                          {formatRewardExpiry(reward.expiresAt) && (
                            <>
                              {' '}
                              <span className="ml-1.5 text-xs font-normal text-amber-700">
                                - {formatRewardExpiry(reward.expiresAt)}
                              </span>
                            </>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs text-teal-800">{reward.description}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold text-teal-950">{reward.pointsCost.toLocaleString()} pts</p>
                        <p className="text-xs text-emerald-700">{reward.valueLabel}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {showPointsPrompt && pointsOffer && pointsReward && (
          <div className="rounded-md border border-emerald-300 bg-emerald-50 p-2.5 text-emerald-950">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  Member has {pointsOffer.availablePoints.toLocaleString()} pts available (worth{' '}
                  {formatCurrency(pointsOffer.availableValue, pointsOffer.currency)}). Apply redemption?
                </p>
                <p className="mt-0.5 text-xs text-emerald-800">
                  Minimum threshold: {pointsOffer.minimumPoints.toLocaleString()} pts (
                  {formatCurrency(pointsOffer.minimumValue, pointsOffer.currency)}).
                </p>
              </div>
              <Badge variant="outline" className="border-emerald-300 bg-white text-emerald-800">Can spend</Badge>
            </div>

            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
              <div>
                <Label htmlFor="fran-points-redemption" className="text-xs">
                  Points to redeem
                </Label>
                <Input
                  id="fran-points-redemption"
                  className="mt-1 h-9 border-emerald-200 bg-white"
                  inputMode="numeric"
                  min={pointsOffer.minimumPoints}
                  max={pointsOffer.maximumPoints}
                  step={1}
                  type="number"
                  value={pointsInput}
                  onChange={(event) => setPointsInput(event.target.value)}
                />
              </div>
              <Button
                size="sm"
                onClick={() => onQuote(pointsReward, pointsDraft.parsed)}
                disabled={!pointsDraft.valid || quoteLoading}
              >
                {quoteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Apply redemption
              </Button>
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-medium text-emerald-900">
                Dollar equivalent: {formatCurrency(pointsDraft.amount, pointsOffer.currency)}
              </span>
              <span className="text-emerald-700">
                Customer confirmation required.
              </span>
            </div>
            {pointsDraft.error && (
              <p className="mt-1.5 flex items-center gap-1 text-xs text-amber-700">
                <AlertCircle className="h-3.5 w-3.5" />
                {pointsDraft.error}
              </p>
            )}
          </div>
        )}

        {rewards.length === 0 && !showPointsPrompt && (
          <p className="rounded-md bg-secondary p-2 text-xs text-muted-foreground">
            No rewards for this sale mode.
          </p>
        )}
        {rewards.map((reward) => (
          <div
            key={reward.id}
            className={cn(
              'rounded-md border p-2',
              reward.eligible
                ? 'border-indigo-200 bg-indigo-50 text-indigo-950'
                : 'border-amber-200 bg-amber-50 text-amber-950'
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">{reward.title}</p>
                <p className={cn('mt-0.5 text-xs', reward.eligible ? 'text-indigo-800' : 'text-amber-800')}>{reward.description}</p>
                {!reward.eligible && reward.reason && (
                  <p className="mt-1 text-xs text-amber-700">{reward.reason}</p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold">{formatCurrency(reward.value, STORE.currency)}</p>
                {reward.pointsCost > 0 && (
                  <p className={cn('text-xs', reward.eligible ? 'text-indigo-700' : 'text-amber-700')}>{reward.pointsCost.toLocaleString()} pts</p>
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
