import { cn } from '@/lib/utils'
import * as LucideIcons from 'lucide-react'
import type { LucideProps } from 'lucide-react'
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
  const IconComponent = (LucideIcons as any)[icon] as React.ComponentType<any> | undefined

  const cardClasses = cn(
    'relative flex flex-col gap-4 p-5 rounded-lg border',
    variant === 'default'
      ? 'bg-surface border-border'
      : 'bg-surface border-primary shadow-glow-primary',
    className,
  )

  const content = (
    <>
      {/* Highlighted badge */}
      {variant === 'comparison-highlighted' && (
        <div className="absolute -top-3 left-5">
          <span className="text-caption font-semibold text-primary-foreground bg-primary px-2.5 py-0.5 rounded-full">
            Free forever
          </span>
        </div>
      )}

      {/* Icon */}
      {IconComponent && (
        <div className="w-9 h-9 rounded-sm bg-surface-muted flex items-center justify-center flex-shrink-0">
          <IconComponent
            size={18}
            className={variant === 'comparison-highlighted' ? 'text-primary' : 'text-foreground'}
            aria-hidden="true"
          />
        </div>
      )}

      {/* Copy */}
      <div>
        <h3 className="text-h4 font-semibold text-foreground mb-1.5">{title}</h3>
        <p className="text-body-sm text-locked leading-relaxed">{description}</p>
      </div>
    </>
  )

  if (href) {
    return (
      <Link
        href={href}
        className={cn(cardClasses, 'hover:-translate-y-0.5 hover:shadow-sm transition-all duration-[180ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus')}
      >
        {content}
      </Link>
    )
  }

  return <div className={cardClasses}>{content}</div>
}
