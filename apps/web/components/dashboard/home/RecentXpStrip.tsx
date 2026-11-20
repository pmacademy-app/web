export interface XpStripItem {
  id: string
  when: string
  label: string
  amount: number
}

/** The last few XP events, each with a specific label. Scrolls sideways on phones. */
export function RecentXpStrip({ items }: { items: XpStripItem[] }) {
  if (items.length === 0) return null
  return (
    <section aria-labelledby="recent-xp-title" className="flex overflow-hidden rounded-2xl border border-border bg-surface">
      <h2 id="recent-xp-title" className="hidden w-24 shrink-0 items-center border-r border-border/70 px-4 text-sm font-semibold leading-tight sm:flex">Recent XP</h2>
      <ol className="flex min-w-0 flex-1 snap-x overflow-x-auto [scrollbar-width:none]">
        {items.map((it) => (
          <li key={it.id} className="min-w-[9.5rem] flex-1 snap-start border-r border-border/70 px-4 py-3 last:border-r-0">
            <p className="text-[11px] text-ink-muted">{it.when}</p>
            <p className="mt-0.5 truncate text-sm font-semibold">{it.label}</p>
            <p className="text-sm font-semibold tabular-nums text-primary">+{it.amount} XP</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
