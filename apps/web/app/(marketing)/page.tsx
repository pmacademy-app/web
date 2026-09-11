import { PageAnalytics } from '@/components/marketing/page-analytics'
import { HeroSection } from '@/components/marketing/sections/hero'
import { WhySection } from '@/components/marketing/sections/why'
import { JourneySection } from '@/components/marketing/sections/journey'
import { CurriculumSection } from '@/components/marketing/sections/curriculum'
import { ExperienceSection } from '@/components/marketing/sections/experience'
import { PortfolioSection } from '@/components/marketing/sections/portfolio'
import { FinalCTASection } from '@/components/marketing/sections/final-cta'

import type { Metadata } from 'next'
import { BRAND } from '@/lib/brand'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? BRAND.siteUrl

export const metadata: Metadata = {
  alternates: {
    canonical: siteUrl,
  },
}

/**
 * This page renders no data at all — it is a composition of static section
 * components with no awaits and no service calls, so its HTML can only change when
 * the app is redeployed (which regenerates it regardless). Revalidating every 60s
 * was therefore re-rendering byte-identical output up to 1,440 times a day and was
 * the single largest source of ISR writes.
 */
export const revalidate = 3600

/**
 * Main marketing landing page.
 */
export default function MarketingPage() {
  return (
    <>
      <PageAnalytics />
      <HeroSection />
      <PortfolioSection />
      <WhySection />
      <CurriculumSection />
      <ExperienceSection />
      <JourneySection />
      <FinalCTASection />
    </>
  )
}
