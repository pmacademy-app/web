import { describe, it, expect } from 'vitest'
import { BRAND } from '../brand'
import {
  FRAMEWORK_DETAILS,
  getFrameworkBySlug,
  getAllFrameworkSlugs,
} from '@/config/frameworks'
import {
  generateStaticParams,
  generateMetadata,
} from '../../app/(marketing)/frameworks/[slug]/page'
import { getFrameworkDetailSchema } from '../schema'
import sitemap from '../../app/sitemap'

describe('SEO-11 Product Framework Detail Pages Test Suite', () => {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? BRAND.siteUrl).replace(/\/$/, '')

  const EXPECTED_SLUGS = [
    'rice',
    'moscow',
    'kano-model',
    'jobs-to-be-done',
    'north-star-metric',
    'heart-framework',
    'aarrr-pirate-metrics',
    'opportunity-solution-tree',
    'desirability-feasibility-viability',
    'okrs',
  ]

  it('configures exactly 10 prominent product frameworks', () => {
    expect(FRAMEWORK_DETAILS.length).toBe(10)
    const slugs = getAllFrameworkSlugs()
    expect(slugs).toEqual(EXPECTED_SLUGS)
    const rice = getFrameworkBySlug('rice')
    expect(rice).toBeDefined()
    expect(rice?.slug).toBe('rice')
  })

  it('generateStaticParams provides all 10 slugs for static generation', async () => {
    const params = await generateStaticParams()
    expect(params.length).toBe(10)
    expect(params.map((p) => p.slug)).toEqual(EXPECTED_SLUGS)
  })

  it('contains complete descriptions, when-to-use, and worked examples for every framework', () => {
    for (const fw of FRAMEWORK_DETAILS) {
      expect(fw.title).toBeTruthy()
      expect(fw.summary.length).toBeGreaterThan(50)
      expect(fw.whenToUse.length).toBeGreaterThan(30)
      expect(fw.workedExample.scenario).toBeTruthy()
      expect(fw.workedExample.application).toBeTruthy()
      expect(fw.workedExample.outcome).toBeTruthy()
      expect(fw.relatedLessons.length).toBeGreaterThanOrEqual(1)
      expect(fw.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('credits original authors and sources, never calling them proprietary', () => {
    for (const fw of FRAMEWORK_DETAILS) {
      expect(fw.citation.author).toBeTruthy()
      expect(fw.citation.source).toBeTruthy()

      const fullText = JSON.stringify(fw).toLowerCase()
      expect(fullText).not.toContain('proprietary')
    }
  })

  it('strictly contains zero em-dashes across all framework copy', () => {
    const emDash = String.fromCharCode(0x2014)
    for (const fw of FRAMEWORK_DETAILS) {
      const serialized = JSON.stringify(fw)
      expect(serialized.includes(emDash)).toBe(false)
    }
  })

  it('generates self-referencing canonical metadata for all 10 pages', async () => {
    for (const slug of EXPECTED_SLUGS) {
      const meta = await generateMetadata({ params: Promise.resolve({ slug }) })
      const expectedCanonical = `${siteUrl}/frameworks/${slug}`
      expect(meta.alternates?.canonical).toBe(expectedCanonical)
      expect(meta.openGraph?.url).toBe(expectedCanonical)
      expect(meta.description).toBeTruthy()
    }
  })

  it('returns fallback metadata for an unknown slug', async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'non-existent-framework' }) })
    expect(meta.title).toEqual('Framework Not Found | Prodily')
  })

  it('generates valid Article and LearningResource JSON-LD with citation', () => {
    for (const fw of FRAMEWORK_DETAILS) {
      const schema = getFrameworkDetailSchema(fw)
      expect(schema['@context']).toBe('https://schema.org')
      expect(schema['@type']).toContain('Article')
      expect(schema['@type']).toContain('LearningResource')
      expect(schema['@id']).toBe(`${siteUrl}/frameworks/${fw.slug}#article`)
      expect(schema.name).toBe(fw.title)
      expect(schema.url).toBe(`${siteUrl}/frameworks/${fw.slug}`)

      expect(schema.citation['@type']).toBe('CreativeWork')
      expect(schema.citation.name).toBe(fw.citation.source)
      expect(schema.citation.author.name).toBe(fw.citation.author)
    }
  })

  it('lists all 10 framework pages in the XML sitemap', async () => {
    const entries = await sitemap()
    const urls = new Set(entries.map((e) => e.url))

    for (const slug of EXPECTED_SLUGS) {
      const expectedUrl = `${siteUrl}/frameworks/${slug}`
      expect(urls.has(expectedUrl)).toBe(true)
    }
  })
})
