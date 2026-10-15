import type { Metadata } from 'next'

import { PageAnalytics } from '@/components/marketing/page-analytics'
import { SectionViewTracker } from '@/components/marketing/section-view-tracker'
import { HeroSection } from '@/components/marketing/sections/hero'
import { PortfolioSection } from '@/components/marketing/sections/portfolio'
import { WhatYouLeaveWithSection } from '@/components/marketing/sections/what-you-leave-with'
import { SkillRadarSection } from '@/components/marketing/sections/skill-radar-section'
import { SampleLessonSection } from '@/components/marketing/sections/sample-lesson'
import { HowItWorksSection } from '@/components/marketing/sections/how-it-works'
import { CurriculumSection } from '@/components/marketing/sections/curriculum'
import { WhySection } from '@/components/marketing/sections/why'
import { PublishedTestimonialsSection } from '@/components/marketing/sections/published-testimonials'
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
 * The page leads with proof and closes on one deep band. In order: the hero, the proof
 * wall of capstone work, what you leave with, the skill radar, a sample lesson, the
 * learning loop (read, recall, apply, retain), the curriculum, the comparison, published
 * testimonials, the FAQ (which carries the "check it yourself" links), and the closing
 * call to action, which also carries the brand tagline.
 * Every section is a server component; the only client code is the analytics islands
 * and a few small interactive pieces inside sections (toggles, the learning-loop step
 * tracker, the pointer spotlight). Each section marks itself with a `data-home-section`
 * attribute, and the single `SectionViewTracker` reports a view event once per section.
 *
 * `PublishedTestimonialsSection` renders only when at least three real approved rows
 * exist, and `SampleLessonSection` renders nothing if its data is unavailable, so the
 * page closes up rather than showing empty shells. The learning loop reads a real public
 * lesson and falls back to static visuals if it cannot.
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
      <HomeFaqSection />
      <FinalCTASection />
    </>
  )
}
