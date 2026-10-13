'use client'

/**
 * One page-level viewport tracker for the homepage.
 *
 * Sections stay server components and opt in with a plain attribute:
 *
 *   <section data-home-section="proof" ...>
 *
 * A single IntersectionObserver watches every `[data-home-section]` element and fires
 * `home_section_view` once per section per page view, then stops watching it. Renders
 * nothing. Unknown attribute values are ignored so a typo cannot pollute the event.
 */

import { useEffect } from 'react'

import { trackHomeSectionView, type HomeSection } from '@/lib/analytics'

const SECTIONS: ReadonlySet<string> = new Set<HomeSection>([
  'hero',
  'belief',
  'proof',
  'leave-with',
  'skill-radar',
  'sample-lesson',
  'how-it-works',
  'curriculum',
  'why',
  'testimonials',
  'check-it-yourself',
  'faq',
  'final-cta',
])

function isHomeSection(value: string | undefined): value is HomeSection {
  return value !== undefined && SECTIONS.has(value)
}

export function SectionViewTracker() {
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return

    const seen = new Set<HomeSection>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const el = entry.target as HTMLElement
          observer.unobserve(el)
          const section = el.dataset.homeSection
          if (!isHomeSection(section) || seen.has(section)) continue
          seen.add(section)
          trackHomeSectionView(section)
        }
      },
      // Counted once a quarter of the section is on screen. Tall sections may never
      // reach a higher ratio on a phone, so the threshold stays low.
      { threshold: 0.25 },
    )

    document
      .querySelectorAll<HTMLElement>('[data-home-section]')
      .forEach((el) => observer.observe(el))

    return () => observer.disconnect()
  }, [])

  return null
}
