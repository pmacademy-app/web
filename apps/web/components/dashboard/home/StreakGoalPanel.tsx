import type { CSSProperties } from 'react'
import { Check, Flame, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WeekDay } from '@/lib/dashboard/home'

interface StreakGoalPanelProps {
  streak: number
  best: number
  studiedToday: boolean
  week: WeekDay[]
  freezes: number
  maxFreezes: number
  nextFreezeDay: number
  weeklyGoal: number | null
  lessonsThisWeek: number
}

function GoalRing({ done, goal }: { done: number; goal: number }) {
  const r = 26
  const c = 2 * Math.PI * r
  const ratio = Math.min(1, goal > 0 ? done / goal : 0)
  return (
    <svg viewBox="0 0 64 64" className="size-16 shrink-0 -rotate-90" aria-hidden>
      <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="stroke-surface-muted" />
      <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" strokeLinecap="round" className="dash-ring stroke-primary" strokeDasharray={c} strokeDashoffset={c * (1 - ratio)} style={{ '--ring-len': c } as CSSProperties} />
    </svg>
  )
}

/** Daily streak with this week's strip, streak freezes, and the weekly lesson goal. */
export function StreakGoalPanel(p: StreakGoalPanelProps) {
  const remaining = p.weeklyGoal ? Math.max(0, p.weeklyGoal - p.lessonsThisWeek) : 0
  return (
    <section aria-labelledby="streak-title" className="flex flex-col rounded-2xl border border-border bg-surface p-5 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 id="streak-title" className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">Daily streak</h2>
        {p.studiedToday ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary"><Check className="size-3.5" strokeWidth={3} />Done today</span>
        ) : (
          <span className="rounded-full bg-warning-bg px-2.5 py-0.5 text-xs font-semibold text-warning">Study today to keep it</span>
        )}
      </div>

      <div className="mt-3 flex items-center gap-3.5">
        <span className="grid size-14 place-items-center rounded-2xl bg-warning-bg text-accent"><Flame className="size-7" /></span>
        <p className="text-[44px] font-bold leading-none tabular-nums tracking-tight">{p.streak}</p>
        <p className="text-sm leading-snug text-ink-muted">days in a row<br />Best: <span className="tabular-nums">{p.best}</span> days</p>
      </div>

      <ol className="mt-4 grid grid-cols-7 gap-1.5" aria-label="This week">
        {p.week.map((d) => (
          <li key={d.date} className="flex flex-col items-center gap-1">
            <span
              aria-label={`${d.date}: ${d.state === 'done' ? 'studied' : d.state === 'today' ? 'today, not yet' : d.state === 'missed' ? 'missed' : 'coming up'}`}
              className={cn(
                'dash-day grid size-9 place-items-center rounded-xl border-2',
                d.state === 'done' && 'border-primary bg-primary text-primary-foreground',
                d.state === 'today' && 'border-accent bg-surface',
                d.state === 'missed' && 'border-border bg-surface-muted',
                d.state === 'future' && 'border-border bg-surface'
              )}
            >
              {d.state === 'done' && <Check className="size-4" strokeWidth={3} />}
            </span>
            <span className={cn('text-[11px] font-semibold', d.state === 'today' ? 'text-foreground' : 'text-ink-muted')}>{d.label}</span>
          </li>
        ))}
      </ol>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/70 pt-3.5">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Streak freezes</p>
          <p className="text-xs text-ink-muted">Next one earned on day <span className="tabular-nums">{p.nextFreezeDay}</span> of your streak</p>
        </div>
        <span className="flex gap-1" aria-label={`${p.freezes} of ${p.maxFreezes} freezes available`}>
          {Array.from({ length: p.maxFreezes }, (_, k) => (
            <Shield key={k} className={cn('size-5', k < p.freezes ? 'fill-primary-soft text-primary' : 'text-border-strong')} />
          ))}
        </span>
      </div>

      {p.weeklyGoal ? (
        <div className="mt-3.5 flex items-center gap-3.5">
          <div className="relative">
            <GoalRing done={p.lessonsThisWeek} goal={p.weeklyGoal} />
            <span className="absolute inset-0 grid place-items-center text-sm font-bold tabular-nums">{Math.min(p.lessonsThisWeek, p.weeklyGoal)}/{p.weeklyGoal}</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Weekly goal: {p.weeklyGoal} {p.weeklyGoal === 1 ? 'lesson' : 'lessons'}</p>
            <p className="text-xs leading-snug text-ink-muted">
              {remaining === 0 ? 'Goal reached this week. Nice work.' : `${remaining} more by Sunday keeps you on track.`}
            </p>
          </div>
        </div>
      ) : null}
    </section>
  )
}
