'use client'

import { cn } from "@/lib/utils"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

interface SkeletonProps extends React.ComponentProps<"div"> {}

/**
 * Shimmering skeleton for loading states.
 * Respects prefers-reduced-motion (disables animation).
 * Set aria-busy on wrapper and aria-hidden on skeleton.
 */
export function Skeleton({ className, ...props }: SkeletonProps) {
  const prefersReducedMotion = useReducedMotion()

  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn(
        "rounded-md bg-border-strong/20",
        !prefersReducedMotion && "animate-pulse",
        className
      )}
      {...props}
    />
  )
}
