import { FeedbackAdminService } from '@/lib/admin/feedback-service'
import { PageAnalytics } from '@/components/marketing/page-analytics'
import { HeroSection } from '@/components/marketing/sections/hero'
import { WhySection } from '@/components/marketing/sections/why'
import { JourneySection } from '@/components/marketing/sections/journey'
import { CurriculumSection } from '@/components/marketing/sections/curriculum'
import { ExperienceSection } from '@/components/marketing/sections/experience'
import { SkillRadarSection } from '@/components/marketing/sections/skill-radar-section'
import { PortfolioSection } from '@/components/marketing/sections/portfolio'
import { CommunitySection } from '@/components/marketing/sections/community'
import { TestimonialsSection } from '@/components/marketing/sections/testimonials'
import { FAQSection } from '@/components/marketing/sections/faq'
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
 * Server-renders published testimonials into HTML for search engine indexing.
 */
export default async function MarketingPage() {
  let publishedTestimonials: Awaited<ReturnType<typeof FeedbackAdminService.getPublishedTestimonials>> = []
  try {
    publishedTestimonials = await FeedbackAdminService.getPublishedTestimonials()
  } catch {
    publishedTestimonials = []
  }

  return (
    <>
      <PageAnalytics />
      <HeroSection />
      <WhySection />
      <JourneySection />
      <CurriculumSection />
      <ExperienceSection />
      <SkillRadarSection />
      <PortfolioSection />
      <CommunitySection />
      <TestimonialsSection initialTestimonials={publishedTestimonials} />
      <FAQSection />
      <FinalCTASection />
    </>
  )
}
