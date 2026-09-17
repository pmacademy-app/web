import * as React from "react"
import { cn } from "@/lib/utils"

export type SkeletonProps = React.HTMLAttributes<HTMLDivElement>

/**
 * Shimmering skeleton for loading states.
 * Respects prefers-reduced-motion via pure CSS utility.
 * Safe for both React Server Components and Client Components.
 */
export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn(
        "rounded-md bg-secondary/80 animate-pulse motion-reduce:animate-none",
        className
      )}
      {...props}
    />
  )
}
