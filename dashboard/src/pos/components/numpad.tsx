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
            className="h-14 rounded-lg border bg-card text-xl font-semibold text-card-foreground shadow-sm transition-colors hover:bg-accent active:scale-[0.98] cursor-pointer"
          >
            {k}
          </button>
        )
      )}
      <button
        type="button"
        onClick={onBackspace}
        className="flex h-14 items-center justify-center rounded-lg border bg-card text-card-foreground shadow-sm transition-colors hover:bg-accent active:scale-[0.98] cursor-pointer"
      >
        <Delete className="h-5 w-5" />
      </button>
    </div>
  )
}
