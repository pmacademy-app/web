import { describe, it, expect } from 'vitest'
import { BRAND } from '../brand'
import { FRAMEWORKS } from '../frameworks'
import { NAV_LINKS, FOOTER_LINK_GROUPS } from '@/config/navigation'
import robots from '../../app/robots'
import sitemap from '../../app/sitemap'
import { fetchCurriculumData } from '../lesson-loader'

describe('Phase 3 Information Architecture & Internal Linking Test Suite', () => {
  const expectedSiteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? BRAND.siteUrl

  it('All 90 lessons exist and have unique valid slugs for /curriculum linking', async () => {
    const curriculum = await fetchCurriculumData()
    expect(curriculum).toBeDefined()
    expect(curriculum!.lessons.length).toBe(90)

    const slugs = curriculum!.lessons.map((l) => l.slug)
    const uniqueSlugs = new Set(slugs)
    expect(uniqueSlugs.size).toBe(90)

    for (const slug of slugs) {
      expect(/^lesson-\d{3}$/.test(slug)).toBe(true)
    }
  })

  it('Frameworks data dictionary contains original models linking to valid source lessons', async () => {
    const curriculum = await fetchCurriculumData()
    const validSlugs = new Set(curriculum?.lessons.map((l) => l.slug) ?? [])

    expect(FRAMEWORKS.length).toBeGreaterThanOrEqual(10)

    const frameworkSlugs = new Set()
    for (const fw of FRAMEWORKS) {
      expect(fw.name).toBeTruthy()
      expect(fw.definition).toBeTruthy()
      expect(fw.keyTakeaway).toBeTruthy()
      expect(validSlugs.has(fw.lessonSlug)).toBe(true)
      expect(frameworkSlugs.has(fw.slug)).toBe(false)
      frameworkSlugs.add(fw.slug)
    }
  })

  it('Navigation & Footer include /frameworks and /curriculum links', () => {
    const navHrefs = NAV_LINKS.map((n) => n.href)
    expect(navHrefs.includes('/curriculum')).toBe(true)
    expect(navHrefs.includes('/frameworks')).toBe(true)

    const resourceGroup = FOOTER_LINK_GROUPS.find((g) => g.heading === 'Resources')
    expect(resourceGroup).toBeDefined()
    const resourceHrefs = resourceGroup?.links.map((l) => l.href)
    expect(resourceHrefs?.includes('/curriculum')).toBe(true)
    expect(resourceHrefs?.includes('/frameworks')).toBe(true)
    expect(resourceHrefs?.includes('/lessons/lesson-001')).toBe(true)
  })

  it('robots.txt allows /frameworks and /glossary', () => {
    const r = robots()
    const ruleGroup = Array.isArray(r.rules) ? r.rules[0] : r.rules
    const allowList = Array.isArray(ruleGroup.allow) ? ruleGroup.allow : [ruleGroup.allow]
    expect(allowList.includes('/frameworks')).toBe(true)
    expect(allowList.includes('/glossary')).toBe(true)
  })

  it('XML Sitemap contains 98 public URLs including /frameworks and /glossary', async () => {
    const entries = await sitemap()
    expect(entries.length).toBe(98)

    const urls = entries.map((e) => e.url)
    expect(urls.includes(`${expectedSiteUrl}/frameworks`)).toBe(true)
    expect(urls.includes(`${expectedSiteUrl}/glossary`)).toBe(true)

    const uniqueUrls = new Set(urls)
    expect(uniqueUrls.size).toBe(urls.length)
  })
})
