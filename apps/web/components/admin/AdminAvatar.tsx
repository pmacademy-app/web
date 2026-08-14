import React from 'react'
import { Avatar as AvatarPrimitive } from '@base-ui/react/avatar'
import { cn } from '@/lib/utils'

/**
 * Admin avatar — user/entity avatar with fallback initials.
 * Use in tables, detail views and the header.
 */
export function AdminAvatar({
  name,
  src,
  size = 'md',
  className,
}: {
  name: string
  src?: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const sizeClass =
    size === 'sm'
      ? 'w-7 h-7 text-[10px]'
      : size === 'lg'
        ? 'w-12 h-12 text-base'
        : 'w-9 h-9 text-xs'

  const initials = name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <AvatarPrimitive.Root
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-admin-surface-raised border border-admin-border text-admin-fg-muted font-semibold',
        sizeClass,
        className
      )}
    >
      {src && <AvatarPrimitive.Image src={src} alt={name} className="h-full w-full object-cover" />}
      <AvatarPrimitive.Fallback>{initials || '?'}</AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  )
}
