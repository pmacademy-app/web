'use client'


import { useScrollDepth } from '@/hooks/use-analytics'
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

/**
 * Main marketing landing page.
 * Assembles core marketing sections.
 * Triggers scroll analytics hook on mount.
 */
export default function MarketingPage() {
  // Fire GA4 scroll depth metric
  useScrollDepth()

  return (
    <>
      <HeroSection />
      <WhySection />
      <JourneySection />
      <CurriculumSection />
      <ExperienceSection />
      <SkillRadarSection />
      <PortfolioSection />
      <CommunitySection />
      <TestimonialsSection />
      <FAQSection />
      <FinalCTASection />
    </>
  )
}
