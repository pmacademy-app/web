import { cn } from '@/lib/utils'
import { LEVEL_THRESHOLDS, type LevelInfo } from '@/lib/xp/xp'

/**
 * The nine-rung career ladder from lib/xp/xp.ts: one segment per level, the current one
 * filled to the learner's progress. Levels 7 to 9 share the Chief Product Officer title,
 * so they share one label.
 */
export function CareerLadder({ level, totalXp }: { level: LevelInfo; totalXp: number }) {
  const labelled = LEVEL_THRESHOLDS.slice(0, 6)
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <p>
          <span className="font-semibold">Level {level.level} · {level.title}</span>{' '}
          <span className="tabular-nums text-ink-muted">{totalXp.toLocaleString('en-US')} XP</span>
        </p>
        {level.xpRemaining > 0 && (
          <p className="shrink-0 text-ink-muted">
            <span className="font-semibold tabular-nums text-foreground">{level.xpRemaining.toLocaleString('en-US')} XP</span> to Level {level.level + 1}
          </p>
        )}
      </div>
      <div className="mt-2.5 grid grid-cols-9 gap-1" role="img" aria-label={`Level ${level.level} of 9, ${level.progress}% of the way to the next level`}>
        {LEVEL_THRESHOLDS.map((t) => {
          const fill = t.level < level.level ? 100 : t.level === level.level ? level.progress : 0
          return (
            <span key={t.level} className={cn('h-2.5 overflow-hidden rounded-[3px]', t.level === level.level ? 'bg-primary-soft' : 'bg-surface-muted')}>
              <span className="dash-fill block h-full rounded-[3px] bg-primary" style={{ width: `${fill}%` }} />
            </span>
          )
        })}
      </div>
      <div className="mt-2 hidden grid-cols-9 gap-1 text-[11.5px] leading-tight sm:grid">
        {labelled.map((t) => (
          <p key={t.level} className={cn('pr-1', t.level === level.level ? 'font-semibold text-primary' : t.level < level.level ? 'text-foreground/80' : 'text-ink-muted')}>
            <span className="block text-[11px] tabular-nums">{t.level}</span>
            {t.title}
          </p>
        ))}
        <p className={cn('col-span-3 border-l border-dashed border-border pl-2', level.level >= 7 ? 'font-semibold text-primary' : 'text-ink-muted')}>
          <span className="block text-[11px] tabular-nums">7 to 9</span>
          Chief Product Officer
        </p>
      </div>
    </div>
  )
}
