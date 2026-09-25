import type { Metadata } from 'next'

import { PageAnalytics } from '@/components/marketing/page-analytics'
import { HeroSection } from '@/components/marketing/sections/hero'
import { SampleLessonSection } from '@/components/marketing/sections/sample-lesson'
import { HowItWorksSection } from '@/components/marketing/sections/how-it-works'
import { PortfolioSection } from '@/components/marketing/sections/portfolio'
import { CurriculumSection } from '@/components/marketing/sections/curriculum'
import { WhySection } from '@/components/marketing/sections/why'
import { PublishedTestimonialsSection } from '@/components/marketing/sections/published-testimonials'
import { FinalCTASection } from '@/components/marketing/sections/final-cta'
import { BRAND } from '@/lib/brand'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? BRAND.siteUrl

export const metadata: Metadata = {
  alternates: {
    canonical: siteUrl,
  },
}

/**
 * Marketing landing page.
 *
 * ## Phase 0.C — what changed and why
 *
 * The audit in `docs/IMPLEMENTATION_PLAN.md` §Phase 0.C measured 2,152 lines across the
 * marketing sections, with `experience.tsx` (453) and `journey-timeline.tsx` (213)
 * carrying the explanatory load through prose and interactive widgets. The page
 * explained the product at length instead of showing it, and left several shipping
 * capabilities unmentioned.
 *
 * Seven sections now, each answering exactly one question:
 *
 *   1. Hero              — what is it, who is it for, what do I get?
 *   2. Proof-by-sample   — is the content any good?        (new: shows real lessons)
 *   3. How it works      — what makes this different?      (replaces the 453-line demo)
 *   4. What you build    — what is the outcome?
 *   5. Curriculum        — is it substantial?
 *   6. Why Prodily       — why not YouTube or a bootcamp?
 *   7. Start             — why now?
 *
 * Published testimonials sit between 6 and 7 and render only when at least three real
 * approved rows exist; otherwise the section returns null and the page closes up.
 *
 * ## What was removed from the page, and what was not removed from the repository
 *
 * `ExperienceSection` and `JourneySection` are no longer composed here: the first is
 * replaced by `HowItWorksSection`, and the second told the same progression story as
 * `CurriculumSection`. Both component files remain in the repository. They are still
 * covered by the B12-B server-component test and the B11-C button-rule allowlist, they
 * are reusable on a deeper page, and deleting them would mean editing test
 * infrastructure that has nothing to do with this phase.
 *
 * ## Rendering
 *
 * Previously this rendered no data at all. `SampleLessonSection` reads compiled lesson
 * JSON and `PublishedTestimonialsSection` reads an `unstable_cache`-wrapped query, so
 * the page now has two build-time data dependencies. Both are cached, neither blocks the
 * hero, and both degrade to rendering nothing if their source is unavailable.
 *
 * The hourly value below is a ceiling, not the effective one: the testimonials query
 * carries its own 30-minute cache, and Next takes the shortest revalidate on the page —
 * `next build` reports `/` at 30m. That is the correct behaviour (a published
 * testimonial should not wait an hour to appear) and is noted here so the number in this
 * file is not mistaken for the number in production.
 */
export const revalidate = 3600

export default function MarketingPage() {
  return (
    <>
      <PageAnalytics />

      {/* 1 — What is it, who is it for, what do I get? */}
      <HeroSection />

      {/* 2 — Is the content any good? Shown, not claimed. */}
      <SampleLessonSection />

      {/* 3 — What makes the learning different? */}
      <HowItWorksSection />

      {/* 4 — What do I walk away with? */}
      <PortfolioSection />

      {/* 5 — Is it substantial? */}
      <CurriculumSection />

      {/* 6 — Why this rather than the alternatives? */}
      <WhySection />

      {/* 7a — Real approved testimonials, or nothing at all. */}
      <PublishedTestimonialsSection />

      {/* 7b — Why now? */}
      <FinalCTASection />
    </>
  )
}
