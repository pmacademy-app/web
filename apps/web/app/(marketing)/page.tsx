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

export const revalidate = 60

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
