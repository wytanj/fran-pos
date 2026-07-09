import { AlertCircle, Coins, Gift, Loader2, Search, ShieldCheck, Star, UserPlus, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { STORE } from '@/pos/data/mock'
import type { FranAppliedReward, FranBasketPreview, FranCounterSession, FranCounterTier, FranLoyaltySyncState } from '../types'

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
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
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
              {session?.mode === 'tourist' && <Badge variant="outline" className="border-cyan-200 bg-cyan-50 text-cyan-800">Tourist</Badge>}
              {session?.mode === 'non_member' && <Badge variant="outline">No member</Badge>}
              {appliedReward && <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800">Reward applied</Badge>}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {member && <span className="font-medium text-emerald-700">Can spend {member.pointsBalance.toLocaleString()} pts</span>}
              {previewLoading && (
                <span className="flex items-center gap-1 text-sky-700">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading earn from Fran CRM
                </span>
              )}
              {preview?.projectedPointsBalance != null && (
                <span className="text-blue-700">Projected {preview.projectedPointsBalance.toLocaleString()} pts</span>
              )}
              {loyaltySync?.status === 'queued' && (
                <span className="flex items-center gap-1 font-medium text-amber-700">
                  <AlertCircle className="h-3 w-3" /> CRM offline - earn queued
                  {loyaltySync.pointsEarnQueued > 0 ? ` (${loyaltySync.pointsEarnQueued.toLocaleString()} pts)` : ''}
                </span>
              )}
              {appliedReward && (
                <span className="font-medium text-emerald-700">{formatCurrency(appliedReward.quote.amount, STORE.currency)} reward line pending commit</span>
              )}
              {previewError && (
                <span className="flex items-center gap-1 text-destructive">
                  <AlertCircle className="h-3 w-3" /> {previewError}
                </span>
              )}
            </div>
            {member && earnPoints != null && (
              <div className="mt-1.5 flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs text-sky-950">
                <Coins className="h-3.5 w-3.5 shrink-0 text-sky-700" />
                <span className="min-w-0 break-words font-medium">
                  Customer will earn {earnPoints.toLocaleString()} points on this order.
                </span>
                <span className="text-sky-700">Loaded from Fran CRM.</span>
              </div>
            )}
            {member && loyaltySync?.status === 'queued' && loyaltySync.pointsEarnQueued > 0 && (
              <div className="mt-1.5 flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-950">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-700" />
                <span className="min-w-0 break-words font-medium">
                  Customer earn will queue for {loyaltySync.pointsEarnQueued.toLocaleString()} points when payment completes.
                </span>
              </div>
            )}
            {activePerks.length > 0 && (
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="flex items-center gap-1 font-medium text-teal-700">
                  <Gift className="h-3.5 w-3.5" /> Active perks
                </span>
                {activePerks.slice(0, 3).map((perk) => (
                  <Badge key={perk.id} variant="outline" className="border-teal-200 bg-teal-50 text-teal-800">
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

function tierBadgeClass(tier: FranCounterTier) {
  switch (tier) {
    case 'Gold':
      return 'border-amber-300 bg-amber-50 text-amber-800'
    case 'Silver':
      return 'border-slate-300 bg-slate-100 text-slate-800'
    case 'Base':
      return 'border-blue-200 bg-blue-50 text-blue-800'
    case 'Tourist':
      return 'border-cyan-200 bg-cyan-50 text-cyan-800'
    default:
      return ''
  }
}

function tierLabel(tier: FranCounterTier, label?: string | null) {
  return label || tier
}
