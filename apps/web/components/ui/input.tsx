import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const inputVariants = cva(
  "w-full min-w-0 rounded-lg border border-input bg-background text-foreground transition-all outline-none placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:border-primary disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-muted/30 dark:border-input dark:bg-input/20",
  {
    variants: {
      inputSize: {
        default: "h-10 px-3 py-2 text-sm",
        sm: "h-8 px-2.5 py-1 text-xs",
        lg: "h-11 px-3.5 py-2.5 text-base",
      },
    },
    defaultVariants: {
      inputSize: "default",
    },
  }
)

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">,
    VariantProps<typeof inputVariants> {
  error?: boolean
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, inputSize = "default", error, ...props }, ref) => {
    const isInvalid = error || props["aria-invalid"]

    return (
      <input
        type={type}
        ref={ref}
        data-slot="input"
        aria-invalid={isInvalid ? true : undefined}
        className={cn(
          inputVariants({ inputSize }),
          isInvalid &&
            "border-destructive focus-visible:ring-destructive/30 focus-visible:border-destructive",
          className
        )}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input, inputVariants }
