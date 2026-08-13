import type { LucideIcon } from 'lucide-react'

export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  action,
}: {
  icon: LucideIcon
  title: string
  subtitle: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line bg-white px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-sm bg-yellow-soft text-brown">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-display text-[22px] font-bold tracking-tight">{title}</h1>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {action}
    </div>
  )
}
