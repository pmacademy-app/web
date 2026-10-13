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
 * Reusable feature card: icon, title, description. Flat surface, hairline border.
 * No homepage section uses it after the redesign; kept for its API.
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
    'relative flex h-full flex-col gap-5 p-6 lg:p-7 rounded-lg border bg-surface',
    'transition-[background-color,border-color] duration-200 ease-out-quint',
    // Flat by design (homepage redesign UI-7): no glow, no tinted shadow, no lift.
    variant === 'default'
      ? 'border-border hover:border-border-strong'
      : 'border-primary/60 hover:border-primary',
    className,
  )

  const content = (
    <>
      {/* Highlighted badge */}
      {variant === 'comparison-highlighted' && (
        <div className="absolute -top-3 left-6">
          <span className="text-caption font-semibold text-primary-foreground bg-primary px-2.5 py-1 rounded-full">
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
