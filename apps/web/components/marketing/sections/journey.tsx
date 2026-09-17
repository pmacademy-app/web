import { Reveal } from '@/components/marketing/motion/reveal'
import { JourneyTimeline } from '@/components/marketing/sections/journey-timeline'

/**
 * Learning Journey roadmap — dynamic auto-stepping timeline.
 * Desktop: horizontal animated progression track.
 * Tablet: 2×3 grid. Mobile: vertical timeline.
 *
 * ## B12-B — server component
 *
 * The timeline itself is irreducibly interactive and stays a client island in
 * `JourneyTimeline`. What did not need to be client was the heading and lede above it,
 * which were inside a `motion.div` purely to fade in on scroll. That wrapper is now
 * `<Reveal>`, and the copy renders on the server.
 */
export function JourneySection() {
  return (
    <section
      id="journey"
      aria-labelledby="journey-heading"
      className="py-20 lg:py-28"
    >
      <div className="max-w-[1120px] mx-auto px-5 lg:px-8">
        {/* Header */}
        <Reveal amount={0.3} className="text-center mb-14">
          <h2
            id="journey-heading"
            className="font-display text-h1 lg:text-display-lg font-semibold text-foreground mb-4"
          >
            Six stages. Each one builds on the last.
          </h2>
          <p className="text-body-lg text-locked max-w-[540px] mx-auto leading-relaxed">
            Move from first principles to increasingly complex product decisions — building the judgment, work, and portfolio evidence that accumulate throughout the journey.
          </p>
        </Reveal>

        {/* Journey interactive container */}
        <JourneyTimeline />
      </div>
    </section>
  )
}
