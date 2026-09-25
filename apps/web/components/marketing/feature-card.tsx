import { cn } from '@/lib/utils'
import * as LucideIcons from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'

interface FeatureCardProps {
  icon: string
  title: string
  description: string
  href?: string
  variant?: 'default' | 'comparison-highlighted'
  className?: string
}

/**
 * Reusable feature card — icon + title + description.
 * Used in: Why section (comparison), Experience feature list, Community grid.
 */
export function FeatureCard({
  icon,
  title,
  description,
  href,
  variant = 'default',
  className,
}: FeatureCardProps) {
  // Dynamically resolve Lucide icon by name
  const IconComponent = (LucideIcons as unknown as Record<string, LucideIcon | undefined>)[icon]

  const cardClasses = cn(
    'relative flex h-full flex-col gap-5 p-6 lg:p-7 rounded-xl border',
    'transition-[transform,box-shadow,border-color] duration-300 ease-out-quint',
    'hover:-translate-y-0.5 motion-reduce:transition-colors motion-reduce:hover:translate-y-0',
    variant === 'default'
      ? 'bg-surface border-border hover:border-border-strong hover:shadow-[0_12px_32px_-12px_rgba(23,26,23,0.16)]'
      : 'bg-surface border-primary/60 shadow-glow-primary hover:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-primary)_18%,transparent),0_16px_40px_-16px_color-mix(in_srgb,var(--color-primary)_45%,transparent)]',
    className,
  )

  const content = (
    <>
      {/* Highlighted badge */}
      {variant === 'comparison-highlighted' && (
        <div className="absolute -top-3 left-6">
          <span className="text-caption font-semibold text-primary-foreground bg-primary px-2.5 py-1 rounded-full shadow-xs">
            Free forever
          </span>
        </div>
      )}

      {/* Icon */}
      {IconComponent && (
        <div
          className={cn(
            'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
            variant === 'comparison-highlighted'
              ? 'bg-primary-soft ring-1 ring-primary/20'
              : 'bg-surface-muted ring-1 ring-border',
          )}
        >
          <IconComponent
            size={18}
            className={variant === 'comparison-highlighted' ? 'text-primary' : 'text-ink-muted'}
            aria-hidden="true"
          />
        </div>
      )}

      {/* Copy */}
      <div>
        <h3 className="text-h4 font-semibold text-foreground mb-1.5">{title}</h3>
        <p className="text-body-sm text-ink-muted leading-relaxed">{description}</p>
      </div>
    </>
  )

  if (href) {
    return (
      <Link
        href={href}
        className={cn(cardClasses, 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus')}
      >
        {content}
      </Link>
    )
  }

  return <div className={cardClasses}>{content}</div>
}
