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
        'group relative bg-surface border border-border rounded-xl p-5 lg:p-6',
        'hover:-translate-y-0.5 hover:border-border-strong hover:shadow-[0_12px_32px_-12px_rgba(23,26,23,0.16)]',
        'transition-[transform,box-shadow,border-color] duration-300 ease-out-quint',
        'motion-reduce:transition-colors motion-reduce:hover:translate-y-0',
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
              w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0
              bg-primary-soft border border-primary/20 text-primary group-hover:bg-primary group-hover:text-primary-foreground
              transition-colors duration-300
            "
          >
            <CurriculumModuleIcon slugOrIcon={moduleSlug} className="w-4 h-4" />
          </div>
          <span className="text-caption font-mono font-semibold text-ink-muted uppercase tracking-wider">
            Module {numberStr}
          </span>
        </div>

        {/* Time */}
        <span className="text-caption text-ink-muted font-mono font-medium flex-shrink-0">{module.estimatedTime}</span>
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
        {/* Decorative rule that draws in on hover. Transform only; static for
            reduced-motion users. */}
        <div aria-hidden="true" className="h-px bg-border mb-3.5 overflow-hidden">
          <div className="h-full w-full origin-left scale-x-0 bg-primary transition-transform duration-500 ease-out-quint group-hover:scale-x-100 motion-reduce:transition-none" />
        </div>

        {/* Outcome & lesson count footer */}
        <div className="flex items-center justify-between gap-3 min-h-[2rem]">
          <p className="text-caption text-ink-muted leading-snug flex-1">
            Outcome: {module.outcome}
          </p>
          <span className="text-caption text-ink-muted font-mono flex-shrink-0 whitespace-nowrap">
            {module.lessonCount} lessons
          </span>
        </div>
      </div>
    </article>
  )
}
