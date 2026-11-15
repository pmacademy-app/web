import { describe, it, expect } from 'vitest'
import { BRAND } from '../brand'
import {
  fetchGlossaryData,
  parseGlossaryTerm,
  slugifyGlossaryTerm,
  groupGlossaryByLetter,
  ALPHABET,
} from '../glossary'
import { getGlossaryDefinedTermSetSchema } from '../schema'
import { metadata } from '../../app/(marketing)/glossary/page'
import sitemap from '../../app/sitemap'
import { FOOTER_LINK_GROUPS } from '@/config/navigation'

describe('SEO-04 Glossary Hub & A-Z Index Test Suite', () => {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? BRAND.siteUrl).replace(/\/$/, '')

  it('loads all 479 terms from master_glossary.json', async () => {
    const terms = await fetchGlossaryData()
    expect(terms).toBeDefined()
    expect(terms.length).toBe(479)
  })

  it('generates 479 unique anchor slugs with zero collisions', async () => {
    expect(slugifyGlossaryTerm('Sample Term (Special)')).toBe('sample-term-special')
    const terms = await fetchGlossaryData()
    const slugs = terms.map((t) => t.slug)
    const uniqueSlugs = new Set(slugs)

    expect(uniqueSlugs.size).toBe(479)
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    }
  })

  it('strips suffixes like (Failure Pattern) into badges and normalizes names', () => {
    const sample1 = parseGlossaryTerm('"Acceptance Criteria Written After the Fact" (Failure Pattern)')
    expect(sample1.name).toBe('Acceptance Criteria Written After the Fact')
    expect(sample1.badge).toBe('Failure Pattern')

    const sample2 = parseGlossaryTerm('"How Might We" (HMW)')
    expect(sample2.name).toBe('How Might We')
    expect(sample2.badge).toBe('HMW')

    const sample3 = parseGlossaryTerm('Interest (technical debt)')
    expect(sample3.name).toBe('Interest')
    expect(sample3.badge).toBe('technical debt')

    const sample4 = parseGlossaryTerm('Eating the Frog')
    expect(sample4.name).toBe('Eating the Frog')
    expect(sample4.badge).toBeNull()
  })

  it('maps all terms to valid lesson slugs between lesson-001 and lesson-090', async () => {
    const terms = await fetchGlossaryData()

    for (const term of terms) {
      expect(term.firstTaughtLesson).toBeGreaterThanOrEqual(1)
      expect(term.firstTaughtLesson).toBeLessThanOrEqual(90)
      expect(term.lessonSlug).toMatch(/^lesson-\d{3}$/)
    }
  })

  it('sorts all 479 terms alphabetically', async () => {
    const terms = await fetchGlossaryData()

    for (let i = 1; i < terms.length; i++) {
      const prev = terms[i - 1].name.toLowerCase()
      const curr = terms[i].name.toLowerCase()
      expect(prev.localeCompare(curr, undefined, { sensitivity: 'base' })).toBeLessThanOrEqual(0)
    }
  })

  it('groups terms into A-Z buckets without losing any entries', async () => {
    const terms = await fetchGlossaryData()
    const grouped = groupGlossaryByLetter(terms)

    let totalGrouped = 0
    for (const letter of ALPHABET) {
      const bucket = grouped[letter] ?? []
      totalGrouped += bucket.length
      for (const item of bucket) {
        expect(item.name.charAt(0).toUpperCase()).toBe(letter)
      }
    }

    expect(totalGrouped).toBe(479)
  })

  it('generates valid DefinedTermSet JSON-LD with all 479 terms', async () => {
    const terms = await fetchGlossaryData()
    const schema = getGlossaryDefinedTermSetSchema(
      terms.map((t) => ({
        term: t.term,
        definition: t.definition,
        slug: t.slug,
        lessonNumber: t.firstTaughtLesson,
      }))
    )

    expect(schema['@context']).toBe('https://schema.org')
    expect(schema['@type']).toBe('DefinedTermSet')
    expect(schema['@id']).toBe(`${siteUrl}/glossary#termset`)
    expect(schema.url).toBe(`${siteUrl}/glossary`)
    expect(schema.hasDefinedTerm.length).toBe(479)

    const firstTerm = schema.hasDefinedTerm[0]
    expect(firstTerm['@type']).toBe('DefinedTerm')
    expect(firstTerm['@id']).toBe(`${siteUrl}/glossary#${firstTerm.termCode}`)
    expect(firstTerm.url).toBe(`${siteUrl}/glossary#${firstTerm.termCode}`)
    expect(firstTerm.inDefinedTermSet).toBe(`${siteUrl}/glossary#termset`)
  })

  it('provides correct canonical and social metadata for /glossary', () => {
    expect(metadata.alternates?.canonical).toBe(`${siteUrl}/glossary`)
    expect(metadata.openGraph?.url).toBe(`${siteUrl}/glossary`)
    expect(metadata.title).toEqual({ absolute: 'Product Management Glossary: 470+ Terms & Mental Models | Prodily' })
  })

  it('includes /glossary in XML sitemap', async () => {
    const entries = await sitemap()
    const glossaryEntries = entries.filter((e) => new URL(e.url).pathname === '/glossary')
    expect(glossaryEntries).toHaveLength(1)
    expect(glossaryEntries[0].url).toBe(`${siteUrl}/glossary`)
    expect(glossaryEntries[0].priority).toBe(0.8)
  })

  it('links to /glossary in footer Resources group', () => {
    const resourceGroup = FOOTER_LINK_GROUPS.find((g) => g.heading === 'Resources')
    expect(resourceGroup).toBeDefined()
    const resourceHrefs = resourceGroup?.links.map((l) => l.href)
    expect(resourceHrefs).toContain('/glossary')
  })
})
