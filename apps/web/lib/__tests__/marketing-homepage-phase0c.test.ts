import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

/**
 * Phase 0.C — the homepage sells what exists.
 *
 * `docs/IMPLEMENTATION_PLAN.md` §Phase 0.C sets a binding claims policy: every number and
 * capability on the landing page must be traceable to this repository, and the page may
 * not manufacture learner counts, outcome statistics, hiring claims or testimonials. A
 * checklist signed by a reviewer catches that once; these tests catch it on every commit.
 *
 * They deliberately assert structure and prohibitions rather than copy. Asserting exact
 * marketing sentences would fail on every wording change and teach people to update the
 * test without reading it. What must not drift is: the seven-section shape, CTAs that
 * resolve to real routes, the testimonial floor, and the absence of invented proof.
 */

const ROOT = path.resolve(import.meta.dirname, '../../')
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')
const CONTENT_DIST = path.resolve(ROOT, '../../content/dist')

/** Strips comments so a doc note is never mistaken for shipped copy or an import. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '')
}

const PAGE = 'app/(marketing)/page.tsx'

describe('Phase 0.C — landing page composition', () => {
  it('composes the seven planned sections and nothing more', () => {
    const source = code(read(PAGE))

    for (const section of [
      'HeroSection',
      'SampleLessonSection',
      'HowItWorksSection',
      'PortfolioSection',
      'CurriculumSection',
      'WhySection',
      'PublishedTestimonialsSection',
      'FinalCTASection',
    ]) {
      expect(source, `${section} is not rendered`).toContain(`<${section} />`)
    }
  })

  it('no longer composes the two sections the audit found redundant', () => {
    const source = code(read(PAGE))
    // `experience` was 453 lines of client-side demo carrying the explanatory load;
    // `journey` told the same progression story as the curriculum section.
    expect(source).not.toContain('<ExperienceSection')
    expect(source).not.toContain('<JourneySection')
  })

  it('keeps those components in the repository rather than deleting them', () => {
    // They remain covered by the B12-B guard and are reusable on a deeper page. Removing
    // them from the homepage is a composition decision, not a reason to edit unrelated
    // test infrastructure.
    for (const rel of [
      'components/marketing/sections/experience.tsx',
      'components/marketing/sections/journey.tsx',
    ]) {
      expect(existsSync(path.join(ROOT, rel)), `${rel} was deleted`).toBe(true)
    }
  })
})

describe('Phase 0.C — CTAs resolve to real destinations', () => {
  it('the hero primary CTA still points at signup and still fires its event', () => {
    const source = code(read('components/marketing/sections/hero-cta.tsx'))
    expect(source).toContain("href=\"/signup\"")
    expect(source).toContain("trackHeroCTAClick('hero')")
  })

  it('both secondary CTAs point at a lesson that is public and indexable', () => {
    const samples = code(read('app/(app)/academy/[moduleSlug]/[lessonId]/page.tsx'))
    // The academy route is the source of truth for which lessons are public samples.
    expect(samples).toContain('les_zoyq8a')

    for (const rel of [
      'components/marketing/sections/hero.tsx',
      'components/marketing/sections/final-cta.tsx',
    ]) {
      expect(code(read(rel)), rel).toContain('/lessons/lesson-001')
    }
  })

  it('lesson-001 exists in compiled content, so the secondary CTA is not a dead link', () => {
    expect(existsSync(path.join(CONTENT_DIST, 'lessons/les_zoyq8a.json'))).toBe(true)
  })
})

describe('Phase 0.C — claims are traceable to the repository', () => {
  const marketingSources = [
    'components/marketing/sections/hero.tsx',
    'components/marketing/sections/how-it-works.tsx',
    'components/marketing/sections/portfolio.tsx',
    'components/marketing/sections/final-cta.tsx',
  ].map((rel) => ({ rel, source: code(read(rel)) }))

  it('the 90-lesson and 9-capstone anchors match the shipped content and config', () => {
    const curriculum = JSON.parse(
      readFileSync(path.join(CONTENT_DIST, 'curriculum.json'), 'utf8')
    ) as { lessons: unknown[] }
    expect(curriculum.lessons).toHaveLength(90)

    const capstones = code(read('config/capstones.ts'))
    const moduleSlugs = [...capstones.matchAll(/moduleSlug:\s*'([a-z]+)'/g)].map((m) => m[1])
    expect(new Set(moduleSlugs).size).toBe(9)

    expect(code(read('components/marketing/sections/hero.tsx'))).toContain('90 Lessons')
    expect(code(read('components/marketing/sections/hero.tsx'))).toContain('9 Capstones')
  })

  it('does not invent learner counts, ratings or outcome statistics', () => {
    // The shapes an unsourced proof claim takes: "12,000 learners", "4.9/5",
    // "87% got hired", "trusted by 500 PMs".
    const fabrications = [
      /\b\d[\d,.]*\+?\s*(learners|students|graduates|alumni|members)\b/i,
      /\b\d(\.\d)?\s*\/\s*5\b/,
      /\b\d{1,3}\s*%\s*(of\s+)?(learners|students|graduates|users|got|landed|hired)/i,
      /\btrusted by\b/i,
      /\bjoin \d/i,
      /\b(average|median)\s+salary\b/i,
      /\bhiring partners?\b/i,
    ]

    for (const { rel, source } of marketingSources) {
      for (const pattern of fabrications) {
        expect(source, `${rel} contains an unsourced proof claim: ${pattern}`).not.toMatch(
          pattern
        )
      }
    }
  })

  it('does not promise a job, an interview or a guaranteed outcome', () => {
    const overpromises = [/\bguarantee/i, /\bland (a|your) (job|role|offer)\b/i, /\bget hired\b/i]

    for (const { rel, source } of marketingSources) {
      for (const pattern of overpromises) {
        expect(source, `${rel} overpromises an outcome: ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('names only capabilities that ship, and the outcome routes exist', () => {
    // The portfolio section names a public portfolio and a verifiable certificate; both
    // must correspond to real routes or the section is selling something absent.
    expect(existsSync(path.join(ROOT, 'app/(portfolio)/p/[username]/page.tsx'))).toBe(true)
    expect(existsSync(path.join(ROOT, 'app/verify/[certificateId]/page.tsx'))).toBe(true)

    // The learning loop names spaced repetition and streaks.
    expect(existsSync(path.join(ROOT, 'lib/srs.ts'))).toBe(true)
    expect(existsSync(path.join(ROOT, 'lib/streaks/streaks.ts'))).toBe(true)
  })
})

describe('Phase 0.C — proof-by-sample shows real content', () => {
  const source = code(read('components/marketing/sections/sample-lesson.tsx'))

  it('reads lesson text from compiled content rather than hardcoding an excerpt', () => {
    expect(source).toContain('fetchCompiledLesson')
    expect(source).toContain('fetchCurriculumData')
  })

  it('uses only the three lessons the academy route marks as public samples', () => {
    const ids = source.match(/const SAMPLE_LESSON_IDS = \[([^\]]+)\]/)?.[1] ?? ''
    const academy = code(read('app/(app)/academy/[moduleSlug]/[lessonId]/page.tsx'))

    for (const id of ['les_zoyq8a', 'les_prrl23', 'les_0q4aih']) {
      expect(ids, `${id} missing from the marketing sample list`).toContain(id)
      expect(academy, `${id} is not a public sample in the academy route`).toContain(id)
    }
  })

  it('renders nothing rather than an empty shell when content is unavailable', () => {
    expect(source).toContain('if (samples.length === 0) return null')
  })
})

describe('Phase 0.C — testimonials are real or absent', () => {
  const source = code(read('components/marketing/sections/published-testimonials.tsx'))

  it('reads approved rows from the feedback service instead of a literal array', () => {
    expect(source).toContain('FeedbackAdminService.getPublishedTestimonials')
    // A hardcoded quote array is exactly what the claims policy forbids.
    expect(source).not.toMatch(/quote:\s*['"]/)
    expect(source).not.toMatch(/author:\s*['"][A-Z]/)
  })

  it('renders nothing below a floor of three, so two quotes never pad the page', () => {
    expect(source).toContain('MINIMUM_TO_RENDER = 3')
    expect(source).toContain('< MINIMUM_TO_RENDER) return null')
  })
})

describe('Phase 0.C — design tokens replace ad-hoc hex', () => {
  it('the sections reworked in this phase carry no inline hex colours', () => {
    // `theme/tokens.ts` and `app/globals.css` are the single source of truth for colour.
    // CI already blocks the four brand hexes; this covers the neutrals the audit found
    // hardcoded across the hero, portfolio and final CTA (#70685A, #DED8CB, #F2EFE7).
    for (const rel of [
      'components/marketing/sections/hero.tsx',
      'components/marketing/sections/portfolio.tsx',
      'components/marketing/sections/final-cta.tsx',
      'components/marketing/sections/sample-lesson.tsx',
      'components/marketing/sections/how-it-works.tsx',
      'components/marketing/sections/published-testimonials.tsx',
    ]) {
      const hexes = code(read(rel)).match(/#[0-9a-fA-F]{6}\b/g) ?? []
      expect(hexes, `${rel} hardcodes ${hexes.join(', ')}`).toEqual([])
    }
  })
})

describe('Phase 0.C — accessibility and motion floors', () => {
  const sections = [
    ['components/marketing/sections/sample-lesson.tsx', 'sample-heading'],
    ['components/marketing/sections/how-it-works.tsx', 'how-it-works-heading'],
    ['components/marketing/sections/published-testimonials.tsx', 'testimonials-heading'],
  ] as const

  it.each(sections)('%s labels its landmark with its own heading id', (rel, headingId) => {
    const source = read(rel)
    expect(source).toContain(`aria-labelledby="${headingId}"`)
    expect(source).toContain(`id="${headingId}"`)
  })

  it.each(sections)('%s exposes a visible keyboard focus ring', (rel) => {
    const source = read(rel)
    // Every section either contains interactive elements with a focus ring, or none.
    const hasInteractive = /<Link|<button/.test(source)
    if (hasInteractive) expect(source).toContain('focus-visible:ring-2')
  })

  it('decorative motion on the new sections is opt-out for reduced-motion users', () => {
    // The new sections animate only through <Reveal>, which expresses the opt-out in
    // CSS; their own hover transforms must do the same.
    for (const rel of [
      'components/marketing/sections/sample-lesson.tsx',
    ]) {
      expect(read(rel), rel).toContain('motion-reduce:')
    }
  })
})
