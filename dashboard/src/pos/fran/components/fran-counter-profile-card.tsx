import { AlertTriangle, CalendarDays, Cake, Gift, Star, Trophy, UserRound } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn, formatCurrency } from '@/lib/utils'
import { STORE } from '@/pos/data/mock'
import { tierBadgeClass, tierLabel } from '../lib/tier-display'
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

  const nextTierSpend = nextTierSpendLabel(preview)
  const earnProjection = preview?.earnProjection ?? null
  const rewardCount = preview?.redeemableRewards.length ?? member.rewardCount
  const activePerks = session.activePerks ?? []
  const pointsExpiryAlert = session.pointsExpiryAlert
  const memberTierLabel = tierLabel(member.tier, member.tierLabel)

  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold">{member.name}</p>
            <Badge variant="outline" className={tierBadgeClass(member.tier)}>{memberTierLabel}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {member.memberNo} - {member.phone}
          </p>
        </div>
        <Badge variant="outline" className="border-transparent bg-success-soft text-success">
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
        <div className="mt-3 rounded-sm border border-warning/30 bg-warning-soft p-2 text-warning">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
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
        <div className="mt-3 rounded-sm border border-line bg-peach-soft p-2 text-brown">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold">Use now: active perks</p>
            <Badge variant="outline" className="border-line bg-white text-brown">{activePerks.length}</Badge>
          </div>
          <div className="space-y-1.5">
            {activePerks.map((perk) => (
              <div key={perk.id} className="rounded-sm border border-line-soft bg-white px-2 py-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium">{perk.title}</p>
                    <p className="mt-0.5 text-[11px] text-ink-soft">{perk.description}</p>
                  </div>
                  <Badge variant="outline" className="shrink-0 border-line bg-yellow-soft text-brown">
                    {perk.valueLabel}
                  </Badge>
                </div>
                {(perk.thresholdAmount != null || perk.expiresAt) && (
                  <p className="mt-1 text-[11px] text-ink-soft">
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
        <div className="mt-3 rounded-sm border border-transparent bg-success-soft p-2 text-success">
          <div className="flex items-start gap-2">
            <Trophy className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <div>
              <p className="text-xs font-semibold">Tier upgrade available</p>
              <p className="mt-0.5 text-xs">{preview.tierProgress.upgradeAlert}</p>
            </div>
          </div>
        </div>
      )}

      {preview?.tierProgress && (
        <div className="mt-3 rounded-sm border border-line bg-surface-sunken p-2 text-ink">
          <p className="mb-1 text-xs font-semibold">Tier spend progress</p>
          <div className="flex justify-between text-xs">
            <span>{preview.tierProgress.currentTierLabel}</span>
            <span>{preview.tierProgress.nextTierLabel ?? 'Top tier'}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-white">
            <div className="h-full bg-yellow" style={{ width: `${preview.tierProgress.progressPercent}%` }} />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            <ProgressMetric
              label="Current YTD spend"
              value={formatCurrency(preview.tierProgress.currentWindowSpend, STORE.currency)}
            />
            <ProgressMetric
              label={preview.tierProgress.nextTierLabel ? `${preview.tierProgress.nextTierLabel} requires` : 'Requirement'}
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
          <p className="mt-0.5 text-[11px] text-ink-soft">
            Calendar-year window: {formatMemberDate(preview.tierProgress.windowStart, 'Unknown')} -{' '}
            {formatMemberDate(preview.tierProgress.windowEnd, 'Unknown')}
          </p>
        </div>
      )}

      {earnProjection && (
        <div className="mt-3 rounded-sm border border-line bg-yellow-soft p-2 text-brown">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold">Earn after basket</p>
            <Badge variant="outline" className="border-line bg-white text-brown">+{earnProjection.projectedEarnPoints.toLocaleString()} pts</Badge>
          </div>
          <p className="mt-1 text-xs text-ink-soft">
            {formatEarnPolicyBasis(earnProjection.policy.basis)} on{' '}
            {formatCurrency(earnProjection.baseAmount, STORE.currency)} - x{formatMultiplier(earnProjection.totalMultiplier)}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {earnProjection.multipliers.map((multiplier) => (
              <Badge
                key={multiplier.code}
                variant="outline"
                className={multiplier.applied ? 'border-line bg-white text-brown' : 'border-line bg-white text-muted-foreground'}
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
        <p className="mt-2 rounded-sm border border-warning/30 bg-warning-soft px-2 py-1.5 text-xs text-warning">
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
  const nextLabel = progress.nextTierLabel ?? progress.nextTier
  if (progress.gapRemaining <= 0) return `Ready for ${nextLabel}`
  return `${formatCurrency(progress.gapRemaining, STORE.currency)} to ${nextLabel}`
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
      <p className="text-[10px] text-ink-soft">{label}</p>
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
        container: 'border-transparent bg-success-soft',
        label: 'text-success',
        value: 'text-ink',
      }
    case 'use':
      return {
        container: 'border-line bg-peach-soft',
        label: 'text-brown',
        value: 'text-ink',
      }
    case 'birthday':
      return {
        container: 'border-line bg-yellow-soft',
        label: 'text-brown',
        value: 'text-ink',
      }
    case 'expire':
      return {
        container: 'border-warning/30 bg-warning-soft',
        label: 'text-warning',
        value: 'text-ink',
      }
    case 'tier':
      return {
        container: 'border-line bg-yellow',
        label: 'text-brown',
        value: 'text-ink',
      }
    case 'profile':
    default:
      return {
        container: 'border-line bg-surface-sunken',
        label: 'text-ink-soft',
        value: 'text-ink',
      }
  }
}


