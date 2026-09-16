import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { Delete } from 'lucide-react'
import { cn } from '@/lib/utils'

const PRESS_FLASH_MS = 100

interface NumpadProps {
  onPress: (key: string) => void
  onBackspace: () => void
  decimal?: boolean
  className?: string
  dense?: boolean
  /** Stretch keys to fill available height (login tablet layout). */
  fill?: boolean
}

function NumpadKey({
  onFire,
  className,
  children,
}: {
  onFire: () => void
  className?: string
  children: ReactNode
}) {
  const [pressed, setPressed] = useState(false)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (flashTimer.current !== null) clearTimeout(flashTimer.current)
    }
  }, [])

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault()
    setPressed(true)
    if (flashTimer.current !== null) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => {
      setPressed(false)
      flashTimer.current = null
    }, PRESS_FLASH_MS)
    onFire()
  }

  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      className={cn(
        'select-none touch-manipulation rounded-sm border border-line bg-white font-display font-bold text-ink shadow-warm-xs transition-[transform,background-color] duration-100 cursor-pointer',
        pressed ? 'scale-[0.94] bg-yellow-soft' : 'hover:bg-yellow-soft',
        className,
      )}
    >
      {children}
    </button>
  )
}

/** Touch-friendly numeric keypad used for PIN entry and cash/amount input. */
export function Numpad({ onPress, onBackspace, decimal = false, className, dense = false, fill = false }: NumpadProps) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', decimal ? '.' : '', '0']
  const keySize = fill ? 'h-full min-h-[3.25rem] text-3xl' : dense ? 'h-11 text-xl' : 'h-14 text-2xl'
  const backSize = fill ? 'h-full min-h-[3.25rem]' : dense ? 'h-11' : 'h-14'

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
          <NumpadKey key={k} onFire={() => onPress(k)} className={keySize}>
            {k}
          </NumpadKey>
        ),
      )}
      <NumpadKey onFire={onBackspace} className={cn('flex items-center justify-center', backSize)}>
        <Delete className={fill ? 'h-7 w-7' : 'h-5 w-5'} />
      </NumpadKey>
    </div>
  )
}
