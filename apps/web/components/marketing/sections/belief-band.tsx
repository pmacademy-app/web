/**
 * Belief band: the brand line in display type, full width, nothing else (server component).
 *
 * Sits between the hero and the proof section on a muted band. Three short sentences on
 * three lines, read as a sequence: the first two in muted ink, the last in full ink, so
 * the eye lands on the outcome. No cards, no eyebrow, no call to action.
 *
 * Motion: one scroll entry through Reveal (IntersectionObserver plus a CSS transition,
 * pinned to its final state under reduced motion).
 */

import { Reveal } from '@/components/marketing/motion/reveal'
import { BAND_MUTED, CONTAINER, DISPLAY_TITLE } from '@/components/marketing/styles'

export function BeliefBandSection() {
  return (
    <section
      aria-labelledby="belief-heading"
      data-home-section="belief"
      className={`${BAND_MUTED} py-24 sm:py-32 lg:py-40`}
    >
      <div className={CONTAINER}>
        <Reveal amount={0.4}>
          <h2 id="belief-heading" className={DISPLAY_TITLE}>
            <span className="block text-ink-muted">Learn product.</span>
            <span className="block text-ink-muted">Build the work.</span>
            <span className="block">Show the proof.</span>
          </h2>
        </Reveal>
      </div>
    </section>
  )
}
