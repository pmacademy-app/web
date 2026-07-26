import { cn } from '@/lib/utils'
import { SKILL_COLORS } from '@/lib/design/tokens'
import type { MarketingModule } from '@/types'

interface ModuleCardProps {
  module: MarketingModule
  className?: string
}

/**
 * Full marketing module card used in the Curriculum section.
 * Sprint 2 §11 spec — module number, title, skills, time, lesson count, outcome.
 */
export function ModuleCard({ module, className }: ModuleCardProps) {
  const numberStr = String(module.number).padStart(2, '0')

  return (
    <article
      className={cn(
        'group relative bg-surface border border-border rounded-lg p-5',
        'hover:-translate-y-0.5 hover:border-border-strong hover:shadow-sm',
        'transition-all duration-[180ms]',
        'focus-within:ring-2 focus-within:ring-focus',
        className,
      )}
    >
      {/* Module number badge */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div
          className="
            w-8 h-8 rounded-sm flex items-center justify-center flex-shrink-0
            bg-surface-muted group-hover:bg-primary group-hover:text-primary-foreground
            transition-colors duration-[180ms]
          "
        >
          <span className="text-caption font-bold text-locked group-hover:text-primary-foreground">
            {numberStr}
          </span>
        </div>

        {/* Time */}
        <span className="text-caption text-locked flex-shrink-0">{module.estimatedTime}</span>
      </div>

      {/* Title */}
      <h3 className="text-h4 font-semibold text-foreground mb-3 leading-snug">
        {module.title}
      </h3>

      {/* Skill badges */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {module.skillLabels.map((label, i) => {
          const cluster = module.skills[i]
          const color = cluster ? SKILL_COLORS[cluster] : undefined
          return (
            <span
              key={label}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-caption"
              style={
                color
                  ? {
                      backgroundColor: `${color}18`,
                      color,
                      border: `1px solid ${color}30`,
                    }
                  : undefined
              }
            >
              {label}
            </span>
          )
        })}
      </div>

      {/* Progress bar (decorative — shows future progress affordance) */}
      <div className="h-1 bg-surface-muted rounded-full mb-4 overflow-hidden">
        <div className="h-full w-0 bg-primary rounded-full" />
      </div>

      {/* Outcome */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-caption text-locked leading-relaxed flex-1">
          Outcome: {module.outcome}
        </p>
        <span className="text-caption text-locked flex-shrink-0 whitespace-nowrap">
          {module.lessonCount} lessons
        </span>
      </div>
    </article>
  )
}
