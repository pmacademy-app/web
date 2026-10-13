import { cn } from '@/lib/utils'

export interface ModuleLedgerRowProps {
  /** Module number, 1 to 9. */
  number: number
  /** Zero-padded label for the numeral ("01"). */
  index: string
  title: string
  lessonCount: number
  /** Estimated study time from MODULES, e.g. "4–5 hrs". */
  estimatedTime: string
  className?: string
}

/**
 * One row of the homepage curriculum ledger (UI-6).
 *
 * Replaces the old nine-card grid with about 25 coloured pills. Server component: plain
 * markup, no hover lift, no shadow. Render inside an `<ol>`; the numeral is decorative
 * because the list already conveys order.
 *
 * Layout: numeral, module title, then lesson count and study time. The capstone titles
 * are deliberately not repeated here; the proof section's wall already lists them.
 * Stacks under the numeral on phones, the meta sits right-aligned from `md` up.
 */
export function ModuleLedgerRow({
  number,
  index,
  title,
  lessonCount,
  estimatedTime,
  className,
}: ModuleLedgerRowProps) {
  return (
    <li
      className={cn(
        'grid grid-cols-[3.5rem_1fr] gap-x-4 gap-y-1 py-5 sm:grid-cols-[5rem_1fr] md:grid-cols-[6rem_minmax(0,1fr)_auto] md:items-baseline md:gap-x-8 md:py-6',
        className,
      )}
    >
      <span aria-hidden="true" className="font-sans text-[1.5rem] font-semibold leading-none tracking-[-0.015em] tabular-nums text-ink-muted sm:text-[2rem]">
        {index}
      </span>

      <h3 className="min-w-0 text-h4 font-semibold leading-snug text-foreground text-balance">
        <span className="sr-only">Module {number}: </span>
        {title}
      </h3>

      <p className="col-start-2 text-body-sm tabular-nums text-ink-muted md:col-start-3 md:text-right">
        {lessonCount} lessons · {estimatedTime}
      </p>
    </li>
  )
}
