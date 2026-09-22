import { cn } from '@/lib/utils'
import { SKILL_COLORS } from '@/lib/design/tokens'
import type { MarketingModule } from '@/types'
import { CurriculumModuleIcon } from '@/components/curriculum/CurriculumModuleIcon'

const MODULE_SLUG_MAP: Record<number, string> = {
  1: 'foundations',
  2: 'discovery',
  3: 'strategy',
  4: 'execution',
  5: 'design',
  6: 'growth',
  7: 'technical',
  8: 'leadership',
  9: 'capstone',
}

interface ModuleCardProps {
  module: MarketingModule
  className?: string
}

/**
 * Full marketing module card used in the Curriculum section.
 * Equal height flex layout ensuring uniform card dimensions across the grid.
 */
export function ModuleCard({ module, className }: ModuleCardProps) {
  const numberStr = String(module.number).padStart(2, '0')
  const moduleSlug = MODULE_SLUG_MAP[module.number] || 'foundations'

  return (
    <article
      className={cn(
        'group relative bg-surface border border-border rounded-xl p-5',
        'hover:-translate-y-0.5 hover:border-border-strong hover:shadow-sm',
        'transition-all duration-[180ms]',
        'focus-within:ring-2 focus-within:ring-focus',
        'flex flex-col h-full',
        className,
      )}
    >
      {/* Module number badge & Time */}
      <div className="flex items-center justify-between gap-3 mb-3.5">
        <div className="flex items-center gap-2.5">
          <div
            className="
              w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0
              bg-primary/10 border border-primary/20 text-primary group-hover:bg-primary group-hover:text-primary-foreground
              transition-colors duration-[180ms]
            "
          >
            <CurriculumModuleIcon slugOrIcon={moduleSlug} className="w-4 h-4" />
          </div>
          <span className="text-caption font-mono font-bold text-locked uppercase tracking-wider">
            Module {numberStr}
          </span>
        </div>

        {/* Time */}
        <span className="text-caption text-locked font-mono font-medium flex-shrink-0">{module.estimatedTime}</span>
      </div>

      {/* Title with consistent height */}
      <h3 className="text-h4 font-semibold text-foreground mb-3 leading-snug min-h-[2.75rem] flex items-center">
        {module.title}
      </h3>

      {/* Skill badges with uniform vertical space */}
      <div className="flex flex-wrap items-center gap-1.5 mb-4 min-h-[1.75rem]">
        {module.skillLabels.map((label, i) => {
          const cluster = module.skills[i]
          const color = cluster ? SKILL_COLORS[cluster] : undefined
          return (
            <span
              key={label}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-caption font-medium"
              style={
                color
                  ? {
                      backgroundColor: `${color}15`,
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

      {/* Spacer to push footer cleanly to bottom */}
      <div className="mt-auto pt-2">
        {/* Progress bar (decorative) */}
        <div className="h-1 bg-surface-muted rounded-full mb-3.5 overflow-hidden">
          <div className="h-full w-0 bg-primary rounded-full" />
        </div>

        {/* Outcome & lesson count footer */}
        <div className="flex items-center justify-between gap-3 min-h-[2rem]">
          <p className="text-caption text-locked leading-snug flex-1">
            Outcome: {module.outcome}
          </p>
          <span className="text-caption text-locked font-mono flex-shrink-0 whitespace-nowrap">
            {module.lessonCount} lessons
          </span>
        </div>
      </div>
    </article>
  )
}
