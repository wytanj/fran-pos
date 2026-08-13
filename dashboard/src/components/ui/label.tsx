import * as React from "react"
import { cn } from "@/lib/utils"

const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => {
    return (
      <label
        ref={ref}
        className={cn(
          "text-xs font-semibold tracking-wide text-ink-soft peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
          className
        )}
        {...props}
      />
    )
  }
)
Label.displayName = "Label"

export { Label }
