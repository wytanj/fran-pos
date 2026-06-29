import { CalendarDays, Gift, Star, UserRound } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'
import { STORE } from '@/pos/data/mock'
import type { FranBasketPreview, FranCounterSession } from '../types'

interface FranCounterProfileCardProps {
  session: FranCounterSession
  preview: FranBasketPreview | null
}

export function FranCounterProfileCard({ session, preview }: FranCounterProfileCardProps) {
  const member = session.member

  if (!member) {
    return (
      <div className="rounded-lg border bg-background p-3">
        <div className="flex items-center gap-2">
          <UserRound className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-semibold">
              {session.mode === 'tourist' ? 'Tourist exception' : 'Non-member sale'}
            </p>
            <p className="text-xs text-muted-foreground">No loyalty accrual or reward redemption for this basket.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold">{member.name}</p>
            <Badge variant={member.tourist ? 'outline' : 'secondary'}>{member.tier}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {member.memberNo} - {member.phone}
          </p>
        </div>
        <Badge variant="outline">{member.rewardCount} rewards</Badge>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <Fact icon={Star} label="Points" value={member.pointsBalance.toLocaleString()} />
        <Fact
          icon={Gift}
          label="Earn"
          value={preview ? `+${preview.earnPoints.toLocaleString()}` : 'Preview pending'}
        />
        <Fact icon={CalendarDays} label="Birthday" value={member.birthday ?? 'Not set'} />
        <Fact icon={CalendarDays} label="Expiry" value={member.expiresAt ?? 'No expiry'} />
      </div>

      {preview?.tierProgress && (
        <div className="mt-3 rounded-md bg-secondary p-2">
          <div className="flex justify-between text-xs">
            <span>{preview.tierProgress.currentTier}</span>
            <span>{preview.tierProgress.nextTier ?? 'Top tier'}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-background">
            <div className="h-full bg-primary" style={{ width: `${preview.tierProgress.progressPercent}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {preview.tierProgress.upgradeAlert ??
              (preview.tierProgress.spendToNextTier > 0
                ? `${formatCurrency(preview.tierProgress.spendToNextTier, STORE.currency)} to next tier`
                : 'Tier maintained')}
          </p>
        </div>
      )}

      {session.warnings.length > 0 && (
        <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
          {session.warnings[0]}
        </p>
      )}
    </div>
  )
}

function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Star
  label: string
  value: string
}) {
  return (
    <div className="rounded-md bg-secondary/60 p-2">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <p className="mt-1 truncate font-medium">{value}</p>
    </div>
  )
}
