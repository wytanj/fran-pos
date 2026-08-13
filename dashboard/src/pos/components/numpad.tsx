import { Delete } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NumpadProps {
  onPress: (key: string) => void
  onBackspace: () => void
  decimal?: boolean
  className?: string
}

/** Touch-friendly numeric keypad used for PIN entry and cash/amount input. */
export function Numpad({ onPress, onBackspace, decimal = false, className }: NumpadProps) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', decimal ? '.' : '', '0']
  return (
    <div className={cn('grid grid-cols-3 gap-2', className)}>
      {keys.map((k, i) =>
        k === '' ? (
          <div key={`empty-${i}`} />
        ) : (
          <button
            key={k}
            type="button"
            onClick={() => onPress(k)}
            className="press h-14 rounded-sm border border-line bg-white font-display text-2xl font-bold text-ink shadow-warm-xs transition-colors hover:bg-yellow-soft active:scale-[0.98] cursor-pointer"
          >
            {k}
          </button>
        )
      )}
      <button
        type="button"
        onClick={onBackspace}
        className="press flex h-14 items-center justify-center rounded-sm border border-line bg-white text-ink shadow-warm-xs transition-colors hover:bg-yellow-soft active:scale-[0.98] cursor-pointer"
      >
        <Delete className="h-5 w-5" />
      </button>
    </div>
  )
}
