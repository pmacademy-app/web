import { IllustrationCaption } from '@/components/marketing/illustration-caption'
import { Reveal } from '@/components/marketing/motion/reveal'
import { HeroCtaLink } from '@/components/marketing/sections/hero-cta'
import { WhyCompareToggle } from '@/components/marketing/sections/why-compare-toggle'
import {
  BAND_PLAIN,
  CONTAINER,
  SECTION_LEAD,
  SECTION_TITLE,
  SECTION_Y,
} from '@/components/marketing/styles'
import {
  HOME_CAPSTONES,
  SAMPLE_CERTIFICATE_LABEL,
  SAMPLE_CERTIFICATE_SRC,
  SAMPLE_LEARNER_NAME,
  padIndex,
} from '@/config/marketing'

/**
 * Why section: structure without the tuition (homepage redesign).
 *
 * Server component. The three comparison cards are replaced by one before/after
 * comparison (`WhyCompareToggle`, a small client island): the same Sample Learner as
 * a generic course certificate, then as a public portfolio showing the kinds of
 * artefacts on the page (deliverable types, no capstone titles, which the proof wall
 * already lists). Both states sit in one double-bezel frame.
 * Capstone data is resolved here and passed down as plain props so the island never
 * imports `config/marketing.ts`.
 *
 * Desktop: copy and the signup CTA on the left, the comparison on the right.
 * Phone: copy, comparison, then CTA, so the CTA follows the evidence.
 */
export function WhySection() {
  const capstones = HOME_CAPSTONES.map((c) => ({
    number: c.number,
    index: padIndex(c.number),
    title: c.title,
    skill: c.skill,
    deliverableType: c.deliverableType,
  }))

  return (
    <section
      id="why"
      aria-labelledby="why-heading"
      data-home-section="why"
      className={`${BAND_PLAIN} ${SECTION_Y} scroll-mt-24 lg:scroll-mt-28`}
    >
      <div className={`${CONTAINER} grid grid-cols-1 gap-10 lg:grid-cols-12 lg:grid-rows-[auto_1fr] lg:gap-x-12 lg:gap-y-10`}>
        <Reveal amount={0.3} className="lg:col-span-5 lg:row-start-1">
          <h2 id="why-heading" className={`${SECTION_TITLE} mb-5`}>
            Structure without the tuition.
          </h2>
          <p className={SECTION_LEAD}>
            Self-study has no sequence. Bootcamps cost money. Prodily gives you the sequence and
            the work, free.
          </p>
        </Reveal>

        <Reveal
          amount={0.2}
          delay={80}
          className="lg:col-span-7 lg:col-start-6 lg:row-span-2 lg:row-start-1"
        >
          <WhyCompareToggle
            learnerName={SAMPLE_LEARNER_NAME}
            capstones={capstones}
            certificateSrc={SAMPLE_CERTIFICATE_SRC}
            certificateLabel={SAMPLE_CERTIFICATE_LABEL}
            caption={<IllustrationCaption as="figcaption" className="mt-3" />}
          />
        </Reveal>

        <div className="lg:col-span-5 lg:row-start-2 lg:self-start">
          <HeroCtaLink location="why" />
        </div>
      </div>
    </section>
  )
}
