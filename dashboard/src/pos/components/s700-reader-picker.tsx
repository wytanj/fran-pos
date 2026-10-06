import { cn } from '@/lib/utils'
import type { S700Link, S700SendPlan } from '@/pos/lib/s700-readers'

const DOT: Record<S700Link, string> = {
  online: 'bg-success',
  offline: 'bg-muted-foreground',
  busy: 'bg-warning',
  unknown: 'bg-muted-foreground/40',
  unpaired: 'border border-muted-foreground bg-transparent',
}

export function S700ReaderPicker({
  plan,
  onSelect,
}: {
  plan: Extract<S700SendPlan, { kind: 'choose' }>
  onSelect: (readerId: string) => void
}) {
  return (
    <div className="mb-3 space-y-1">
      {plan.notice && <p className="text-xs text-muted-foreground">{plan.notice}</p>}
      {plan.message && <p className="text-xs text-destructive">{plan.message}</p>}
      {plan.readers.map((reader) => {
        const selected = reader.id !== '' && reader.id === plan.selectedId
        return (
          <button
            key={reader.key}
            type="button"
            disabled={!reader.selectable}
            onClick={() => onSelect(reader.id)}
            className={cn(
              'flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm',
              selected ? 'border-primary bg-accent' : 'hover:bg-accent',
              !reader.selectable && 'cursor-not-allowed opacity-60',
            )}
          >
            <span className={cn('h-2 w-2 shrink-0 rounded-full', DOT[reader.link])} />
            <span className="min-w-0 flex-1 truncate">{reader.label}</span>
            {reader.link === 'unpaired' && (
              <span className="shrink-0 text-xs text-muted-foreground">Not paired yet</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
