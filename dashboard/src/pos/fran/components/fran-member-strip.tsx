import {
  AlertCircle,
  Coins,
  Gift,
  Handshake,
  IdCard,
  Loader2,
  Lock,
  Megaphone,
  PackageX,
  Plane,
  Search,
  ShieldCheck,
  ShoppingBag,
  Star,
  Store,
  UserPlus,
  UserX,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency, cn } from '@/lib/utils'
import { SALES_TYPES, STORE, type SalesType } from '@/pos/data/mock'
import { tierBadgeClass, tierLabel } from '../lib/tier-display'
import type { FranAppliedReward, FranBasketPreview, FranCounterSession, FranLoyaltySyncState } from '../types'

const SALES_TYPE_ICONS: Record<SalesType, typeof ShoppingBag> = {
  normal: Store,
  sponsorship: Handshake,
  staff: IdCard,
  'vm-writeoff': PackageX,
  influencer: Megaphone,
}

interface FranMemberStripProps {
  session: FranCounterSession | null
  preview: FranBasketPreview | null
  appliedReward: FranAppliedReward | null
  previewLoading: boolean
  previewError: string | null
  loyaltySync: FranLoyaltySyncState | null
  salesType: SalesType
  onChooseSalesType: (next: SalesType) => void
  onFindMember: () => void
  onOpenDetails: () => void
  onClearSession: () => void
}

function sessionStatusLabel(session: FranCounterSession | null) {
  const member = session?.member ?? null
  if (member) return `${member.name} - ${member.memberNo}`
  if (session?.mode === 'tourist') return 'Tourist exception selected'
  if (session?.mode === 'non_member') return 'Non-member sale selected'
  return 'Fran member required'
}

function CompactSalesTypeIcons({
  salesType,
  onChooseSalesType,
}: {
  salesType: SalesType
  onChooseSalesType: (next: SalesType) => void
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5" role="group" aria-label="Sale type">
      {SALES_TYPES.map((s) => {
        const Icon = SALES_TYPE_ICONS[s.value]
        const selected = salesType === s.value
        return (
          <button
            key={s.value}
            type="button"
            title={`${s.label}${s.requiresManager ? ' (manager)' : ''} — ${s.hint}`}
            aria-label={s.label}
            aria-pressed={selected}
            onClick={() => onChooseSalesType(s.value)}
            className={cn(
              'relative flex h-9 w-9 items-center justify-center rounded-full border transition-colors',
              selected
                ? 'border-brown bg-yellow text-brown'
                : 'border-line bg-white text-ink-soft hover:bg-surface-sunken',
              s.requiresManager && !selected && 'text-muted-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
            {s.requiresManager && (
              <Lock className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 text-ink-soft" aria-hidden />
            )}
          </button>
        )
      })}
    </div>
  )
}

export function FranMemberStrip({
  session,
  preview,
  appliedReward,
  previewLoading,
  previewError,
  loyaltySync,
  salesType,
  onChooseSalesType,
  onFindMember,
  onOpenDetails,
  onClearSession,
}: FranMemberStripProps) {
  const member = session?.member ?? null
  const activePerks = session?.activePerks ?? []
  const earnPoints = preview?.earnPoints ?? null
  const memberTierLabel = member ? tierLabel(member.tier, member.tierLabel) : null
  const statusLabel = sessionStatusLabel(session)
  const StatusIcon = member
    ? Star
    : session?.mode === 'tourist'
      ? Plane
      : session?.mode === 'non_member'
        ? UserX
        : ShieldCheck
  const compactName = member
    ? member.name
    : session?.mode === 'tourist'
      ? 'Tourist'
      : session?.mode === 'non_member'
        ? 'Walk-in'
        : 'No member'

  return (
    <div className="shrink-0 border-b bg-card">
      <div className="flex items-center gap-1 px-2 py-1.5 lg:hidden">
        <button
          type="button"
          onClick={session ? onOpenDetails : onFindMember}
          title={statusLabel}
          aria-label={session ? `${statusLabel}. Open member details` : 'Fran member required. Find member'}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-full pr-1 hover:bg-surface-sunken"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-yellow text-brown">
            <StatusIcon className="h-4 w-4" />
          </div>
          <span className="hidden max-w-[7rem] truncate text-sm font-semibold sm:inline">{compactName}</span>
          {(previewError || loyaltySync?.status === 'queued') && (
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
          )}
        </button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          title={session ? 'Change member' : 'Find member'}
          aria-label={session ? 'Change member' : 'Find member'}
          onClick={onFindMember}
        >
          {session ? <Search className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
        </Button>
        {session && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0"
            title="Clear member"
            aria-label="Clear member"
            onClick={onClearSession}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
        <div className="ml-auto flex items-center gap-1">
          <div className="hidden h-6 w-px bg-line sm:block" aria-hidden />
          <CompactSalesTypeIcons salesType={salesType} onChooseSalesType={onChooseSalesType} />
        </div>
      </div>

      <div className="hidden px-3 py-2 lg:block">
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
    </div>
  )
}


