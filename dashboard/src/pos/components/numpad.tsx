import { Delete } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NumpadProps {
  onPress: (key: string) => void
  onBackspace: () => void
  decimal?: boolean
  className?: string
  dense?: boolean
  /** Stretch keys to fill available height (login tablet layout). */
  fill?: boolean
}

/** Touch-friendly numeric keypad used for PIN entry and cash/amount input. */
export function Numpad({ onPress, onBackspace, decimal = false, className, dense = false, fill = false }: NumpadProps) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', decimal ? '.' : '', '0']
  return (
    <div
      className={cn(
        'grid grid-cols-3',
        fill ? 'h-full min-h-0 flex-1 gap-2 auto-rows-fr' : dense ? 'gap-1.5' : 'gap-2',
        className,
      )}
    >
      {keys.map((k, i) =>
        k === '' ? (
          <div key={`empty-${i}`} />
        ) : (
          <button
            key={k}
            type="button"
            onClick={() => onPress(k)}
            className={cn(
              'press rounded-sm border border-line bg-white font-display font-bold text-ink shadow-warm-xs transition-colors hover:bg-yellow-soft active:scale-[0.98] cursor-pointer',
              fill ? 'h-full min-h-[3.25rem] text-3xl' : dense ? 'h-11 text-xl' : 'h-14 text-2xl',
            )}
          >
            {k}
          </button>
        ),
      )}
      <button
        type="button"
        onClick={onBackspace}
        className={cn(
          'press flex items-center justify-center rounded-sm border border-line bg-white text-ink shadow-warm-xs transition-colors hover:bg-yellow-soft active:scale-[0.98] cursor-pointer',
          fill ? 'h-full min-h-[3.25rem]' : dense ? 'h-11' : 'h-14',
        )}
      >
        <Delete className={fill ? 'h-7 w-7' : 'h-5 w-5'} />
      </button>
    </div>
  )
}
