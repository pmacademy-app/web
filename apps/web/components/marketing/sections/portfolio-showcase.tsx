/**
 * The capstone wall: all nine real capstones (server component).
 *
 * This replaces an auto-advancing carousel of four invented artifacts. The carousel
 * could not be paused on touch, shifted layout on mobile through a fixed min-height,
 * and showed titles that matched no real capstone. The wall has no timer and no state.
 *
 * ## Why all nine instead of a 2x2 of four
 *
 * The heading beside it says "Nine briefs. Nine deliverables." Showing four would
 * undercut that line, and the real titles are the proof. Each tile carries the real
 * deliverable type from the capstone definition and a thin rule in its skill colour
 * (`var(--color-skill-<id>)`), so the wall reads as nine different pieces of work.
 *
 * ## Depth and motion
 *
 * From `md` the 3x3 hairline grid sits in a double-bezel tray (the md-only twin of
 * SHELL / SHELL_CORE). Tiles are SPOTLIGHT cards inside one SpotlightGroup, the only
 * client piece here: a pointer glow on fine pointers, nothing on touch, nothing under
 * reduced motion.
 *
 * ## Mobile
 *
 * Below `md` the list becomes a horizontal scroll-snap row of separate cards. Tiles take
 * their natural height (the row stretches them to the tallest), so nothing is reserved
 * with a fixed min-height and nothing shifts. The scroller is focusable and labelled so
 * keyboard users can scroll it with the arrow keys.
 *
 * The titles are real, so this is not an illustration; the caption says where they
 * come from instead.
 */

import {
  CAPSTONE_WALL,
  skillAccent,
} from '@/components/marketing/sections/portfolio-artifacts'
import { IllustrationCaption } from '@/components/marketing/illustration-caption'
import { SpotlightGroup } from '@/components/marketing/spotlight-group'
import { SPOTLIGHT } from '@/components/marketing/styles'

/**
 * SHELL, applied from `md` only. On phones the tiles are loose cards in a scroller,
 * so a tray around them would clip the full-bleed row.
 */
const WALL_TRAY =
  'md:rounded-[1.5rem] md:p-1.5 md:ring-1 md:ring-border md:bg-[color-mix(in_oklch,var(--color-primary)_6%,var(--color-surface-muted))]'

/** SHELL_CORE, applied from `md` only: the hairline grid itself. */
const WALL_CORE =
  'md:grid md:grid-cols-3 md:gap-px md:overflow-hidden md:rounded-[calc(1.5rem-0.375rem)] md:border md:border-border/60 md:bg-border md:shadow-tinted'

export function PortfolioShowcase() {
  return (
    <figure className="min-w-0 space-y-4">
      <div
        role="region"
        aria-label="The nine capstones, one per module"
        tabIndex={0}
        className="
          -mx-5 px-5 py-1 overflow-x-auto snap-x snap-mandatory scroll-px-5 overscroll-x-contain
          [scrollbar-width:none] [&::-webkit-scrollbar]:hidden
          md:mx-0 md:px-0 md:py-0 md:overflow-visible
          rounded-lg md:rounded-[1.5rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background
        "
      >
        <SpotlightGroup className={WALL_TRAY}>
          <ol className={`flex gap-3 ${WALL_CORE}`}>
            {CAPSTONE_WALL.map((item) => (
              <li
                key={item.id}
                data-spotlight
                style={skillAccent(item.skill)}
                className={`
                  ${SPOTLIGHT}
                  flex w-[78%] min-w-0 shrink-0 snap-start flex-col gap-4 rounded-2xl border border-border bg-surface p-5 shadow-tinted
                  sm:w-[46%]
                  md:w-auto md:rounded-none md:border-0 md:shadow-none lg:p-6
                `}
              >
                <span className="sr-only">Capstone {Number(item.number)}:</span>
                <div className="flex items-center justify-between gap-3">
                  <span
                    aria-hidden="true"
                    className="font-sans text-[1.375rem] font-semibold leading-none tracking-[-0.015em] tabular-nums text-foreground"
                  >
                    {item.number}
                  </span>
                  <span className="min-w-0 truncate rounded-full border border-border bg-background px-2.5 py-1 text-caption font-medium text-ink-muted">
                    {item.deliverableType}
                  </span>
                </div>
                <span
                  aria-hidden="true"
                  className="h-0.5 w-8 rounded-full bg-[var(--skill)]"
                />
                <p className="break-words text-body font-semibold leading-snug text-foreground text-pretty">
                  {item.title}
                </p>
                <p className="mt-auto break-words text-body-sm text-ink-muted">{item.module}</p>
              </li>
            ))}
          </ol>
        </SpotlightGroup>
      </div>
      <IllustrationCaption as="figcaption">
        Capstone titles as they appear in the curriculum.
      </IllustrationCaption>
    </figure>
  )
}
