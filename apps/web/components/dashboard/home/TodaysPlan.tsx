import Link from 'next/link'
import { Award, BookOpen, Layers } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface PlanItem {
  key: string
  icon: 'lesson' | 'review' | 'capstone'
  title: string
  detail: string
  /** "+28 XP", or a short note such as "Reaches Level 4" */
  reward: string
  action: string
  href: string
  primary?: boolean
}

const ICONS = { lesson: BookOpen, review: Layers, capstone: Award }

/** Up to three things to do today, each with what it earns. */
export function TodaysPlan({ items }: { items: PlanItem[] }) {
  if (items.length === 0) return null
  return (
    <section aria-labelledby="plan-title" className="rounded-2xl border border-border bg-surface px-5 py-4 sm:px-6">
      <div className="flex items-baseline justify-between gap-3 pb-2">
        <h2 id="plan-title" className="text-base font-semibold">Today&apos;s plan</h2>
        <p className="text-xs text-ink-muted">{items.length === 1 ? 'One thing to do' : `${items.length} things to do`}</p>
      </div>
      <ul className="divide-y divide-border/70">
        {items.map((it) => {
          const Icon = ICONS[it.icon]
          return (
            <li key={it.key} className="flex items-center gap-3 py-3">
              <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', it.icon === 'capstone' ? 'bg-warning-bg text-warning' : 'bg-primary-soft text-primary')}>
                <Icon className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{it.title}</p>
                <p className="truncate text-xs text-ink-muted">{it.detail}</p>
              </div>
              <span className="hidden shrink-0 text-xs font-semibold text-warning sm:block">{it.reward}</span>
              <Link href={it.href} className={cn(buttonVariants({ variant: it.primary ? 'default' : 'outline', size: 'sm' }), 'shrink-0 rounded-lg')}>
                {it.action}
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
