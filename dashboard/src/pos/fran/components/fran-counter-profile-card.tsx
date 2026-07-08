import { AlertTriangle, CalendarDays, Cake, Gift, Star, Trophy, UserRound } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn, formatCurrency } from '@/lib/utils'
import { STORE } from '@/pos/data/mock'
import type { FranBasketPreview, FranCounterSession, FranCounterTier } from '../types'

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

  const nextTierSpend = nextTierSpendLabel(preview)
  const earnProjection = preview?.earnProjection ?? null
  const rewardCount = preview?.redeemableRewards.length ?? member.rewardCount
  const activePerks = session.activePerks ?? []
  const pointsExpiryAlert = session.pointsExpiryAlert

  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold">{member.name}</p>
            <Badge variant="outline" className={tierBadgeClass(member.tier)}>{member.tier}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {member.memberNo} - {member.phone}
          </p>
        </div>
        <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">
          Can spend {member.pointsBalance.toLocaleString()} pts
        </Badge>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <Fact icon={Star} tone="spend" label="Can spend" value={`${member.pointsBalance.toLocaleString()} pts`} />
        <Fact
          icon={Gift}
          tone="use"
          label="Use now"
          value={`${rewardCount} available`}
        />
        <Fact icon={CalendarDays} tone="profile" label="Member since" value={formatMemberDate(member.memberSince, 'Not set')} />
        <Fact icon={Cake} tone="birthday" label="Birthday" value={formatMemberDate(member.birthday, 'Not set')} />
        <Fact icon={CalendarDays} tone="expire" label="Expiry" value={formatMemberDate(member.pointsExpireAt, 'No expiry')} />
        <Fact icon={Trophy} tone="tier" label="Tier gap" value={nextTierSpend} />
      </div>

      {pointsExpiryAlert && (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-2 text-amber-950">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="min-w-0">
              <p className="text-xs font-semibold">Expiring soon</p>
              <p className="mt-0.5 text-xs">
                {pointsExpiryAlert.amountAtRisk.toLocaleString()} pts expire on{' '}
                {formatMemberDate(pointsExpiryAlert.expiresAt, 'Unknown')}
              </p>
              <p className="mt-0.5 text-[11px] text-amber-800">
                Within {pointsExpiryAlert.lookaheadDays}-day CRM lookahead window.
              </p>
            </div>
          </div>
        </div>
      )}

      {activePerks.length > 0 && (
        <div className="mt-3 rounded-md border border-teal-200 bg-teal-50 p-2 text-teal-950">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold">Use now: active perks</p>
            <Badge variant="outline" className="border-teal-300 bg-white text-teal-800">{activePerks.length}</Badge>
          </div>
          <div className="space-y-1.5">
            {activePerks.map((perk) => (
              <div key={perk.id} className="rounded-sm border border-teal-100 bg-white px-2 py-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium">{perk.title}</p>
                    <p className="mt-0.5 text-[11px] text-teal-800">{perk.description}</p>
                  </div>
                  <Badge variant="outline" className="shrink-0 border-teal-200 bg-teal-50 text-teal-800">
                    {perk.valueLabel}
                  </Badge>
                </div>
                {(perk.thresholdAmount != null || perk.expiresAt) && (
                  <p className="mt-1 text-[11px] text-teal-700">
                    {perk.thresholdAmount != null
                      ? `Threshold ${formatCurrency(perk.thresholdAmount, perk.currency)}`
                      : null}
                    {perk.thresholdAmount != null && perk.expiresAt ? ' - ' : ''}
                    {perk.expiresAt ? `Expires ${formatMemberDate(perk.expiresAt, 'Unknown')}` : null}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {preview?.tierProgress?.crossesTierThreshold && preview.tierProgress.upgradeAlert && (
        <div className="mt-3 rounded-md border border-emerald-300 bg-emerald-50 p-2 text-emerald-950">
          <div className="flex items-start gap-2">
            <Trophy className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <div>
              <p className="text-xs font-semibold">Tier upgrade available</p>
              <p className="mt-0.5 text-xs">{preview.tierProgress.upgradeAlert}</p>
            </div>
          </div>
        </div>
      )}

      {preview?.tierProgress && (
        <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 p-2 text-blue-950">
          <p className="mb-1 text-xs font-semibold">Tier spend progress</p>
          <div className="flex justify-between text-xs">
            <span>{preview.tierProgress.currentTier}</span>
            <span>{preview.tierProgress.nextTier ?? 'Top tier'}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-white">
            <div className="h-full bg-blue-500" style={{ width: `${preview.tierProgress.progressPercent}%` }} />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            <ProgressMetric
              label="Current T12 spend"
              value={formatCurrency(preview.tierProgress.currentWindowSpend, STORE.currency)}
            />
            <ProgressMetric
              label={preview.tierProgress.nextTier ? `${preview.tierProgress.nextTier} requires` : 'Requirement'}
              value={
                preview.tierProgress.spendRequiredForNextTier != null
                  ? formatCurrency(preview.tierProgress.spendRequiredForNextTier, STORE.currency)
                  : 'Top tier'
              }
            />
            <ProgressMetric
              label="Gap after basket"
              value={
                preview.tierProgress.gapRemaining > 0
                  ? formatCurrency(preview.tierProgress.gapRemaining, STORE.currency)
                  : 'Tier reached'
              }
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {preview.tierProgress.upgradeAlert ??
              (preview.tierProgress.gapRemaining > 0
                ? `${formatCurrency(preview.tierProgress.transactionValue, STORE.currency)} basket leaves ${formatCurrency(preview.tierProgress.gapRemaining, STORE.currency)} gap`
                : 'Tier maintained')}
          </p>
          <p className="mt-0.5 text-[11px] text-blue-700">
            Trailing 12-month window: {formatMemberDate(preview.tierProgress.windowStart, 'Unknown')} -{' '}
            {formatMemberDate(preview.tierProgress.windowEnd, 'Unknown')}
          </p>
        </div>
      )}

      {earnProjection && (
        <div className="mt-3 rounded-md border border-sky-200 bg-sky-50 p-2 text-sky-950">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold">Earn after basket</p>
            <Badge variant="outline" className="border-sky-300 bg-white text-sky-800">+{earnProjection.projectedEarnPoints.toLocaleString()} pts</Badge>
          </div>
          <p className="mt-1 text-xs text-sky-800">
            {formatEarnPolicyBasis(earnProjection.policy.basis)} on{' '}
            {formatCurrency(earnProjection.baseAmount, STORE.currency)} - x{formatMultiplier(earnProjection.totalMultiplier)}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {earnProjection.multipliers.map((multiplier) => (
              <Badge
                key={multiplier.code}
                variant="outline"
                className={multiplier.applied ? 'border-sky-300 bg-white text-sky-800' : 'border-slate-200 bg-white text-slate-500'}
              >
                {multiplier.applied
                  ? `${multiplier.label} x${formatMultiplier(multiplier.multiplier)}`
                  : `${multiplier.label} inactive`}
              </Badge>
            ))}
          </div>
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

function formatEarnPolicyBasis(basis: FranBasketPreview['earnProjection']['policy']['basis']) {
  return basis === 'pre_discount' ? 'Pre-discount earn' : 'Post-discount earn'
}

function formatMultiplier(value: number) {
  return value.toFixed(2).replace(/\.?0+$/, '')
}

function formatMemberDate(value: string | null | undefined, fallback: string) {
  if (!value) return fallback
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return value
  return new Intl.DateTimeFormat('en-SG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(year, month - 1, day))
}

function nextTierSpendLabel(preview: FranBasketPreview | null) {
  const progress = preview?.tierProgress
  if (!progress) return 'Preview pending'
  if (!progress.nextTier) return 'Top tier'
  if (progress.gapRemaining <= 0) return `Ready for ${progress.nextTier}`
  return `${formatCurrency(progress.gapRemaining, STORE.currency)} to ${progress.nextTier}`
}

function ProgressMetric({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-sm bg-white px-2 py-1">
      <p className="text-[10px] text-blue-700">{label}</p>
      <p className="truncate text-xs font-semibold">{value}</p>
    </div>
  )
}

type FactTone = 'spend' | 'use' | 'profile' | 'birthday' | 'expire' | 'tier'

function Fact({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Star
  label: string
  value: string
  tone: FactTone
}) {
  const classes = factToneClass(tone)

  return (
    <div className={cn('min-h-[58px] rounded-md border p-2', classes.container)}>
      <div className={cn('flex items-center gap-1.5', classes.label)}>
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <p className={cn('mt-1 break-words font-medium leading-tight', classes.value)}>{value}</p>
    </div>
  )
}

function factToneClass(tone: FactTone) {
  switch (tone) {
    case 'spend':
      return {
        container: 'border-emerald-200 bg-emerald-50',
        label: 'text-emerald-700',
        value: 'text-emerald-950',
      }
    case 'use':
      return {
        container: 'border-teal-200 bg-teal-50',
        label: 'text-teal-700',
        value: 'text-teal-950',
      }
    case 'birthday':
      return {
        container: 'border-rose-200 bg-rose-50',
        label: 'text-rose-700',
        value: 'text-rose-950',
      }
    case 'expire':
      return {
        container: 'border-amber-200 bg-amber-50',
        label: 'text-amber-700',
        value: 'text-amber-950',
      }
    case 'tier':
      return {
        container: 'border-blue-200 bg-blue-50',
        label: 'text-blue-700',
        value: 'text-blue-950',
      }
    case 'profile':
    default:
      return {
        container: 'border-slate-200 bg-slate-50',
        label: 'text-slate-600',
        value: 'text-slate-950',
      }
  }
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
