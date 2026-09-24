import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

/**
 * B12-B — the landing page's marketing sections do not load an animation engine.
 *
 * B12-A measured `/` at 529.1 KB of gzipped JavaScript against the 345 KB baseline every
 * other route shares, and attributed 171.7 KB of the 184 KB difference to a single chunk
 * carrying framer-motion. Seven sections imported it, all for decorative entry animation.
 *
 * These tests pin the property that made the delta, not the delta itself: no module the
 * landing page composes may import framer-motion, and the sections that had no genuine
 * client requirement must stay server components. A bundle number would drift with every
 * dependency bump; an import edge is exact, and it is the thing that regresses.
 *
 * Deliberately scoped to the seven sections `app/(marketing)/page.tsx` actually renders.
 * `community`, `faq`, `testimonials` and the explorer components still use framer-motion
 * and are not on `/` — B12-B's objective and its measurement are the landing page, and
 * widening past that would be optimizing something nothing measured.
 */

const ROOT = path.resolve(import.meta.dirname, '../../')
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

/** Everything `app/(marketing)/page.tsx` composes, plus what those pull in. */
const LANDING_MODULES = [
  'app/(marketing)/page.tsx',
  'components/marketing/sections/hero.tsx',
  'components/marketing/sections/hero-cta.tsx',
  'components/marketing/sections/hero-workbench.tsx',
  'components/marketing/sections/portfolio.tsx',
  'components/marketing/sections/portfolio-showcase.tsx',
  'components/marketing/sections/portfolio-artifacts.ts',
  'components/marketing/sections/why.tsx',
  'components/marketing/sections/curriculum.tsx',
  'components/marketing/sections/curriculum-view-tracker.tsx',
  // Phase 0.C sections. The landing page no longer composes `experience` or `journey`,
  // but both stay in this list: they remain in the repository, and the property under
  // test — no animation engine in a marketing section — is worth keeping pinned for
  // whatever page composes them next.
  'components/marketing/sections/sample-lesson.tsx',
  'components/marketing/sections/how-it-works.tsx',
  'components/marketing/sections/published-testimonials.tsx',
  'components/marketing/sections/experience.tsx',
  'components/marketing/sections/journey.tsx',
  'components/marketing/sections/journey-timeline.tsx',
  'components/marketing/sections/final-cta.tsx',
  'components/marketing/sections/final-cta-link.tsx',
  'components/marketing/motion/reveal.tsx',
  'components/marketing/product-mockup/skill-radar.tsx',
  'components/marketing/feature-card.tsx',
  'components/marketing/module-card.tsx',
  'hooks/use-reduced-motion.ts',
  // Rendered by the marketing layout on every landing view. Its mount fade was the
  // last framer-motion import on `/`, and once the sections stopped loading the engine
  // it ran after first paint and registered as a layout shift.
  'components/layout/navbar.tsx',
]

/**
 * Sections with no genuine client requirement. Each was `'use client'` only because a
 * `motion.div` wrapper needed hooks.
 */
const SERVER_SECTIONS = [
  'components/marketing/sections/hero.tsx',
  'components/marketing/sections/portfolio.tsx',
  'components/marketing/sections/why.tsx',
  'components/marketing/sections/curriculum.tsx',
  'components/marketing/sections/journey.tsx',
  'components/marketing/sections/final-cta.tsx',
  'components/marketing/product-mockup/skill-radar.tsx',
  // Phase 0.C. `sample-lesson` and `published-testimonials` read data on the server and
  // `how-it-works` is static, so none of the three has a client requirement. Pinning
  // them here is what stops the next edit from reaching for state and quietly putting a
  // third of the landing page back into the client bundle.
  'components/marketing/sections/sample-lesson.tsx',
  'components/marketing/sections/how-it-works.tsx',
  'components/marketing/sections/published-testimonials.tsx',
]

/** Strips comments so a doc note naming framer-motion is not mistaken for an import. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '')
}

function importSpecifiers(source: string): string[] {
  return [...code(source).matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1])
}

describe('B12-B — no animation engine on the landing page', () => {
  it.each(LANDING_MODULES)('%s does not import framer-motion', (rel) => {
    expect(existsSync(path.join(ROOT, rel)), `${rel} is missing`).toBe(true)
    expect(importSpecifiers(read(rel)), rel).not.toContain('framer-motion')
  })

  it('no landing module imports lib/animation, which exists only for framer variants', () => {
    for (const rel of LANDING_MODULES) {
      expect(importSpecifiers(read(rel)), rel).not.toContain('@/lib/animation')
    }
  })

  it('the reduced-motion hook resolves the query itself rather than via framer-motion', () => {
    const source = read('hooks/use-reduced-motion.ts')
    expect(importSpecifiers(source)).not.toContain('framer-motion')
    expect(code(source)).toContain('prefers-reduced-motion: reduce')
    expect(code(source)).toContain('matchMedia')
  })
})

describe('B12-B — section bodies are server components', () => {
  it.each(SERVER_SECTIONS)('%s is not a client component', (rel) => {
    const first = read(rel).trimStart()
    expect(first.startsWith("'use client'"), `${rel} still declares 'use client'`).toBe(false)
    expect(first.startsWith('"use client"'), `${rel} still declares "use client"`).toBe(false)
  })

  it.each(SERVER_SECTIONS)('%s uses no React hooks', (rel) => {
    const source = code(read(rel))
    expect(source, rel).not.toMatch(/\buseState\s*\(/)
    expect(source, rel).not.toMatch(/\buseEffect\s*\(/)
    expect(source, rel).not.toMatch(/\buseRef\s*\(/)
  })

  it('the client islands that remain each declare the boundary explicitly', () => {
    const islands = [
      'components/marketing/sections/hero-cta.tsx',
      'components/marketing/sections/hero-workbench.tsx',
      'components/marketing/sections/portfolio-showcase.tsx',
      'components/marketing/sections/curriculum-view-tracker.tsx',
      'components/marketing/sections/journey-timeline.tsx',
      'components/marketing/sections/final-cta-link.tsx',
      'components/marketing/motion/reveal.tsx',
      // Irreducibly interactive: format tabs, a quiz and a flashcard. It keeps its
      // client boundary and has had framer-motion removed instead.
      'components/marketing/sections/experience.tsx',
    ]
    for (const rel of islands) {
      expect(read(rel).trimStart().startsWith("'use client'"), rel).toBe(true)
    }
  })
})

describe('B12-B — behaviour preserved across the split', () => {
  it('both CTA analytics events still fire with their original labels', () => {
    expect(code(read('components/marketing/sections/hero-cta.tsx'))).toContain(
      "trackHeroCTAClick('hero')"
    )
    expect(code(read('components/marketing/sections/final-cta-link.tsx'))).toContain(
      "trackHeroCTAClick('final_cta')"
    )
  })

  it('the curriculum view event still fires once on viewport entry', () => {
    const source = code(read('components/marketing/sections/curriculum-view-tracker.tsx'))
    expect(source).toContain('trackCurriculumView()')
    expect(source).toContain('IntersectionObserver')
    // A ref guard, so a re-entry cannot double-count.
    expect(source).toContain('fired.current')
  })

  it('timers that swap content still consult the reduced-motion preference', () => {
    for (const rel of [
      'components/marketing/sections/hero-workbench.tsx',
      'components/marketing/sections/portfolio-showcase.tsx',
      'components/marketing/sections/journey-timeline.tsx',
      'components/marketing/sections/experience.tsx',
    ]) {
      expect(code(read(rel)), rel).toContain('prefersReducedMotion')
    }
  })

  it('Reveal fails open when there is no IntersectionObserver', () => {
    const source = code(read('components/marketing/motion/reveal.tsx'))
    expect(source).toContain("typeof IntersectionObserver === 'undefined'")
    expect(source).toContain('setRevealed(true)')
  })

  it('Reveal expresses reduced motion in CSS so it needs no extra render', () => {
    expect(code(read('components/marketing/motion/reveal.tsx'))).toContain(
      'motion-reduce:transition-none'
    )
  })

  it('the hero headline animates transform only, keeping it eligible for LCP', () => {
    const source = read('components/marketing/sections/hero.tsx')
    const opaque = source.match(/const ENTER_OPAQUE = '([^']+)'/)
    expect(opaque, 'ENTER_OPAQUE is missing').not.toBeNull()
    // An element at opacity 0 cannot be the Largest Contentful Paint.
    expect(opaque![1]).not.toContain('fade-in')
    expect(opaque![1]).toContain('slide-in-from-bottom')
    expect(source).toContain(`id="hero-heading"`)
  })
})
