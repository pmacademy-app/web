/**
 * The capstone wall: all nine real capstones, static (server component).
 *
 * This replaces an auto-advancing carousel of four invented artifacts. The carousel
 * could not be paused on touch, shifted layout on mobile through a fixed min-height,
 * and showed titles that matched no real capstone. The wall has no timer, no state
 * and no client JavaScript.
 *
 * ## Why all nine instead of a 2x2 of four
 *
 * The heading above it says "Nine briefs. Nine deliverables." Showing four would
 * undercut the line it sits under, and the real titles are the proof. Nine short tiles
 * fit a 3x3 hairline grid on tablet and desktop without crowding.
 *
 * ## Mobile
 *
 * Below `md` the list becomes a horizontal scroll-snap row. Tiles take their natural
 * height (the row stretches them to the tallest), so nothing is reserved with a fixed
 * min-height and nothing shifts. The scroller is focusable and labelled so keyboard
 * users can scroll it with the arrow keys.
 *
 * The titles are real, so this is not an illustration; the caption says where they
 * come from instead.
 */

import { CAPSTONE_WALL } from '@/components/marketing/sections/portfolio-artifacts'
import { IllustrationCaption } from '@/components/marketing/illustration-caption'

export function PortfolioShowcase() {
  return (
    <figure className="space-y-4">
      <div
        role="region"
        aria-label="The nine capstones, one per module"
        tabIndex={0}
        className="
          -mx-5 px-5 overflow-x-auto snap-x snap-mandatory scroll-px-5 overscroll-x-contain
          [scrollbar-width:none] [&::-webkit-scrollbar]:hidden
          md:mx-0 md:px-0 md:overflow-visible
          rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background
        "
      >
        <ol
          className="
            flex gap-3
            md:grid md:grid-cols-3 md:gap-px md:overflow-hidden md:rounded-lg md:border md:border-border md:bg-border
          "
        >
          {CAPSTONE_WALL.map((item) => (
            <li
              key={item.id}
              className="
                flex w-[78%] shrink-0 snap-start flex-col gap-5 rounded-lg border border-border bg-surface p-5
                sm:w-[46%]
                md:w-auto md:rounded-none md:border-0 lg:p-6
              "
            >
              <span
                aria-hidden="true"
                className="font-sans text-[1.5rem] font-semibold leading-none tracking-[-0.015em] tabular-nums text-primary"
              >
                {item.number}
              </span>
              <span className="sr-only">Capstone {Number(item.number)}:</span>
              <p className="text-body font-semibold leading-snug text-foreground text-pretty">
                {item.title}
              </p>
              <p className="mt-auto text-body-sm text-ink-muted">{item.module}</p>
            </li>
          ))}
        </ol>
      </div>
      <IllustrationCaption as="figcaption">
        Capstone titles as they appear in the curriculum.
      </IllustrationCaption>
    </figure>
  )
}
