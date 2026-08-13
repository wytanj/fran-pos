import { AlertCircle, Coins, Gift, Loader2, Search, ShieldCheck, Star, UserPlus, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { STORE } from '@/pos/data/mock'
import { tierBadgeClass, tierLabel } from '../lib/tier-display'
import type { FranAppliedReward, FranBasketPreview, FranCounterSession, FranLoyaltySyncState } from '../types'

interface FranMemberStripProps {
  session: FranCounterSession | null
  preview: FranBasketPreview | null
  appliedReward: FranAppliedReward | null
  previewLoading: boolean
  previewError: string | null
  loyaltySync: FranLoyaltySyncState | null
  onFindMember: () => void
  onOpenDetails: () => void
  onClearSession: () => void
}

export function FranMemberStrip({
  session,
  preview,
  appliedReward,
  previewLoading,
  previewError,
  loyaltySync,
  onFindMember,
  onOpenDetails,
  onClearSession,
}: FranMemberStripProps) {
  const member = session?.member ?? null
  const activePerks = session?.activePerks ?? []
  const earnPoints = preview?.earnPoints ?? null
  const memberTierLabel = member ? tierLabel(member.tier, member.tierLabel) : null

  return (
    <div className="shrink-0 border-b bg-card px-3 py-2">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-yellow text-brown">
            {member ? <Star className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-semibold">
                {member
                  ? `${member.name} - ${member.memberNo}`
                  : session?.mode === 'tourist'
                    ? 'Tourist exception selected'
                    : session?.mode === 'non_member'
                      ? 'Non-member sale selected'
                      : 'Fran member required'}
              </p>
              {member && <Badge variant="outline" className={tierBadgeClass(member.tier)}>{memberTierLabel}</Badge>}
              {session?.mode === 'tourist' && <Badge variant="outline" className="border-line-strong bg-white text-ink-soft">Tourist</Badge>}
              {session?.mode === 'non_member' && <Badge variant="outline">No member</Badge>}
              {appliedReward && <Badge variant="outline" className="border-transparent bg-success-soft text-success">Reward applied</Badge>}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {member && <span className="font-medium text-success">Can spend {member.pointsBalance.toLocaleString()} pts</span>}
              {previewLoading && (
                <span className="flex items-center gap-1 text-brown">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading earn from Fran CRM
                </span>
              )}
              {preview?.projectedPointsBalance != null && (
                <span className="text-ink-soft">Projected {preview.projectedPointsBalance.toLocaleString()} pts</span>
              )}
              {loyaltySync?.status === 'queued' && (
                <span className="flex items-center gap-1 font-medium text-warning">
                  <AlertCircle className="h-3 w-3" /> CRM offline - earn queued
                  {loyaltySync.pointsEarnQueued > 0 ? ` (${loyaltySync.pointsEarnQueued.toLocaleString()} pts)` : ''}
                </span>
              )}
              {appliedReward && (
                <span className="font-medium text-success">{formatCurrency(appliedReward.quote.amount, STORE.currency)} reward line pending commit</span>
              )}
              {previewError && (
                <span className="flex items-center gap-1 text-destructive">
                  <AlertCircle className="h-3 w-3" /> {previewError}
                </span>
              )}
            </div>
            {member && earnPoints != null && (
              <div className="mt-1.5 flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-sm border border-line bg-yellow-soft px-2.5 py-1.5 text-xs text-brown">
                <Coins className="h-3.5 w-3.5 shrink-0 text-brown" />
                <span className="min-w-0 break-words font-medium">
                  Customer will earn {earnPoints.toLocaleString()} points on this order.
                </span>
                <span className="text-ink-soft">Loaded from Fran CRM.</span>
              </div>
            )}
            {member && loyaltySync?.status === 'queued' && loyaltySync.pointsEarnQueued > 0 && (
              <div className="mt-1.5 flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-sm border border-warning/30 bg-warning-soft px-2.5 py-1.5 text-xs text-warning">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 text-warning" />
                <span className="min-w-0 break-words font-medium">
                  Customer earn will queue for {loyaltySync.pointsEarnQueued.toLocaleString()} points when payment completes.
                </span>
              </div>
            )}
            {activePerks.length > 0 && (
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="flex items-center gap-1 font-medium text-brown">
                  <Gift className="h-3.5 w-3.5" /> Active perks
                </span>
                {activePerks.slice(0, 3).map((perk) => (
                  <Badge key={perk.id} variant="outline" className="border-line bg-peach-soft text-brown">
                    {perk.title}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {session && (
            <Button variant="outline" size="sm" onClick={onOpenDetails}>
              <Gift className="h-4 w-4" /> Details
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onFindMember}>
            {session ? <Search className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
            {session ? 'Change' : 'Find member'}
          </Button>
          {session && (
            <Button variant="outline" size="sm" onClick={onClearSession}>
              <X className="h-4 w-4" /> Clear
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}


