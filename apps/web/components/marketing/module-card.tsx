import { cn } from '@/lib/utils'

export interface ModuleLedgerRowProps {
  /** Module number, 1 to 9. */
  number: number
  /** Zero-padded label for the numeral ("01"). */
  index: string
  title: string
  lessonCount: number
  /** Capstone display title (from HOME_CAPSTONES, never the raw config title). */
  capstoneTitle: string
  /** Competency cluster id; resolves to `var(--color-skill-<skill>)`. */
  skill: string
  className?: string
}

/**
 * One row of the homepage curriculum ledger (UI-6).
 *
 * Replaces the old nine-card grid with about 25 coloured pills. Server component: plain
 * markup, no hover lift, no shadow. Render inside an `<ol>`; the numeral is decorative
 * because the list already conveys order.
 *
 * Layout: numeral, then module (title and lesson count), then the capstone the module
 * ends in. Stacks under the numeral on phones, three columns from `md` up.
 */
export function ModuleLedgerRow({
  number,
  index,
  title,
  lessonCount,
  capstoneTitle,
  skill,
  className,
}: ModuleLedgerRowProps) {
  return (
    <li
      className={cn(
        'grid grid-cols-[3.5rem_1fr] gap-x-4 gap-y-3 py-6 sm:grid-cols-[5rem_1fr] md:grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)] md:items-baseline md:gap-x-8 md:py-8',
        className,
      )}
    >
      <span aria-hidden="true" className="font-sans text-[1.5rem] font-semibold leading-none tracking-[-0.015em] tabular-nums text-ink-muted sm:text-[2rem]">
        {index}
      </span>

      <div className="min-w-0">
        <h3 className="text-h4 font-semibold leading-snug text-foreground text-balance">
          <span className="sr-only">Module {number}: </span>
          {title}
        </h3>
        <p className="mt-1 text-body-sm text-ink-muted">{lessonCount} lessons</p>
      </div>

      <div className="col-start-2 min-w-0 md:col-start-3">
        <p className="text-caption font-medium text-ink-muted">Capstone</p>
        <p className="mt-1 flex items-baseline gap-2.5 text-body text-foreground text-pretty">
          <span
            aria-hidden="true"
            className="relative top-[-0.1em] size-2 shrink-0 rounded-full"
            style={{ backgroundColor: `var(--color-skill-${skill})` }}
          />
          <span>{capstoneTitle}</span>
        </p>
      </div>
    </li>
  )
}
