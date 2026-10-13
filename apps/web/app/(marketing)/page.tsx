import type { Metadata } from 'next'

import { PageAnalytics } from '@/components/marketing/page-analytics'
import { SectionViewTracker } from '@/components/marketing/section-view-tracker'
import { HeroSection } from '@/components/marketing/sections/hero'
import { BeliefBandSection } from '@/components/marketing/sections/belief-band'
import { PortfolioSection } from '@/components/marketing/sections/portfolio'
import { WhatYouLeaveWithSection } from '@/components/marketing/sections/what-you-leave-with'
import { SkillRadarSection } from '@/components/marketing/sections/skill-radar-section'
import { SampleLessonSection } from '@/components/marketing/sections/sample-lesson'
import { HowItWorksSection } from '@/components/marketing/sections/how-it-works'
import { CurriculumSection } from '@/components/marketing/sections/curriculum'
import { WhySection } from '@/components/marketing/sections/why'
import { PublishedTestimonialsSection } from '@/components/marketing/sections/published-testimonials'
import { CheckItYourselfSection } from '@/components/marketing/sections/check-it-yourself'
import { HomeFaqSection } from '@/components/marketing/sections/home-faq'
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
 * The page leads with proof: what you build and how anyone can check it, then the
 * learning itself, then the course and the comparison, then questions and the close.
 * The belief band (the brand tagline) sits just before the final CTA so it closes the
 * page instead of echoing the H1 directly under it.
 * Every section is a server component; the only client code is the analytics islands
 * and a few small toggles inside sections. Each section marks itself with a
 * `data-home-section` attribute, and the single `SectionViewTracker` reports a view
 * event once per section.
 *
 * `PublishedTestimonialsSection` renders only when at least three real approved rows
 * exist, and `SampleLessonSection` and `CheckItYourselfSection` render nothing if their
 * data is unavailable, so the page closes up rather than showing empty shells.
 *
 * The homepage FAQ is visible content only and carries no FAQPage JSON-LD: `/faq`
 * already marks up the same questions, and duplicate FAQPage markup across URLs is
 * discouraged.
 *
 * The hourly revalidate is a ceiling: the testimonials query carries a shorter cache
 * of its own, and Next uses the shortest revalidate on the page.
 */
export const revalidate = 3600

export default function MarketingPage() {
  return (
    <>
      <PageAnalytics />
      <SectionViewTracker />

      <HeroSection />
      <PortfolioSection />
      <WhatYouLeaveWithSection />
      <SkillRadarSection />
      <SampleLessonSection />
      <HowItWorksSection />
      <CurriculumSection />
      <WhySection />
      <PublishedTestimonialsSection />
      <CheckItYourselfSection />
      <HomeFaqSection />
      <BeliefBandSection />
      <FinalCTASection />
    </>
  )
}
