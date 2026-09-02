import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import { X } from "lucide-react"

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}

function overlayRoot() {
  return document.getElementById('fran-overlay-root')
}

function Dialog({ open, onOpenChange, children }: DialogProps) {
  React.useEffect(() => {
    if (!open) return
    const host = overlayRoot()
    if (host) {
      const next = Number(host.dataset.openCount || '0') + 1
      host.dataset.openCount = String(next)
      host.className = 'absolute inset-0 z-[80]'
      host.style.pointerEvents = 'auto'
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      if (!host) return
      const next = Math.max(0, Number(host.dataset.openCount || '1') - 1)
      host.dataset.openCount = String(next)
      if (next > 0) {
        host.style.pointerEvents = 'auto'
      } else {
        host.className = 'hidden'
        host.style.pointerEvents = 'none'
      }
    }
  }, [open, onOpenChange])

  if (!open) return null

  const root = overlayRoot() || document.body
  const hosted = root.id === 'fran-overlay-root'

  return createPortal(
    <div
      className={cn(
        hosted ? 'absolute inset-0' : 'fixed inset-0',
        'flex items-center justify-center bg-brown/45 p-4',
      )}
      onClick={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false)
      }}
    >
      {children}
    </div>,
    root,
  )
}

const DialogContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { onClose?: () => void }>(
  ({ className, children, onClose, onClick, ...props }, ref) => (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      className={cn(
        "relative mx-auto w-full max-w-lg touch-manipulation rounded-lg border border-line bg-card p-6 shadow-warm-md",
        className
      )}
      {...props}
      onClick={(event) => {
        event.stopPropagation()
        onClick?.(event)
      }}
    >
      {children}
      {onClose && (
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute right-3 top-3 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-line bg-white text-brown shadow-sm ring-offset-background transition-colors hover:bg-surface-sunken focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer"
        >
          <X className="h-5 w-5" />
        </button>
      )}
    </div>
  )
)
DialogContent.displayName = "DialogContent"

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
}

function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("font-display text-xl font-bold leading-none tracking-tight", className)} {...props} />
}

function DialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />
}

export { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription }
