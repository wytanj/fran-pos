import { cn } from '@/lib/utils'

export function BrandMark({
  className,
  size = 'md',
}: {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const box =
    size === 'lg'
      ? 'h-12 w-12 text-[15px] rounded-[10px]'
      : size === 'sm'
        ? 'h-7 w-7 text-[11px] rounded-[6px]'
        : 'h-8 w-8 text-[12px] rounded-[6px]'

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center bg-yellow font-display font-bold text-brown',
        box,
        className,
      )}
    >
      FR
    </span>
  )
}

export function AuthBrand({ subtitle }: { subtitle: string }) {
  return (
    <div className="mb-6 text-center">
      <BrandMark size="lg" className="mx-auto" />
      <p className="eyebrow mt-4">Fran team</p>
      <h1 className="h1-display">Fran POS</h1>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{subtitle}</p>
    </div>
  )
}
