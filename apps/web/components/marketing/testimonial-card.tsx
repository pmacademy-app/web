import { cn } from '@/lib/utils'
import type { TestimonialItem } from '@/types'

interface TestimonialCardProps {
  testimonial: TestimonialItem
  className?: string
}

/**
 * Testimonial card with blockquote semantics.
 * Consistent min-height prevents grid jank.
 */
export function TestimonialCard({ testimonial, className }: TestimonialCardProps) {
  return (
    <figure
      className={cn(
        'bg-surface border border-border rounded-lg p-6',
        'flex flex-col min-h-[180px]',
        className,
      )}
    >
      {/* Quote mark */}
      <div
        aria-hidden="true"
        className="text-h1 font-display text-border-strong leading-none mb-3 select-none"
      >
        &ldquo;
      </div>

      {/* Quote */}
      <blockquote className="flex-1">
        <p className="text-body text-foreground leading-relaxed">
          {testimonial.quote}
        </p>
      </blockquote>

      {/* Attribution */}
      <figcaption className="mt-4 pt-4 border-t border-border">
        <p className="text-body-sm font-medium text-foreground">{testimonial.author}</p>
        <p className="text-caption text-locked">{testimonial.role}</p>
      </figcaption>
    </figure>
  )
}
