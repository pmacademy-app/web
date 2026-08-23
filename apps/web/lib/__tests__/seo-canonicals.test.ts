import { describe, it, expect } from 'vitest'
import { BRAND } from '../brand'
import { generateMetadata as generateLessonMetadata } from '../../app/(marketing)/lessons/[slug]/page'
import { metadata as homeMetadata } from '../../app/(marketing)/page'
import { metadata as aboutMetadata } from '../../app/(marketing)/about/page'
import { metadata as contactMetadata } from '../../app/(marketing)/contact/page'
import { metadata as curriculumMetadata } from '../../app/(marketing)/curriculum/page'
import { metadata as privacyMetadata } from '../../app/(marketing)/privacy/page'
import { metadata as termsMetadata } from '../../app/(marketing)/terms/page'
import { metadata as authLayoutMetadata } from '../../app/(auth)/layout'
import { metadata as adminLayoutMetadata } from '../../app/admin/(console)/layout'
import robots from '../../app/robots'
import sitemap from '../../app/sitemap'
import { fetchCurriculumData } from '../lesson-loader'

describe('Phase 1 Technical SEO Foundation Unit Test Suite', () => {
  const expectedSiteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? BRAND.siteUrl

  it('Homepage has correct self-referencing canonical', () => {
    expect(homeMetadata.alternates?.canonical).toBe(expectedSiteUrl)
  })

  it('/about page has correct self-referencing canonical', () => {
    expect(aboutMetadata.alternates?.canonical).toBe(`${expectedSiteUrl}/about`)
  })

  it('/contact page has correct self-referencing canonical', () => {
    expect(contactMetadata.alternates?.canonical).toBe(`${expectedSiteUrl}/contact`)
  })

  it('/curriculum page has correct self-referencing canonical', () => {
    expect(curriculumMetadata.alternates?.canonical).toBe(`${expectedSiteUrl}/curriculum`)
  })

  it('/privacy page has correct self-referencing canonical', () => {
    expect(privacyMetadata.alternates?.canonical).toBe(`${expectedSiteUrl}/privacy`)
  })

  it('/terms page has correct self-referencing canonical', () => {
    expect(termsMetadata.alternates?.canonical).toBe(`${expectedSiteUrl}/terms`)
  })

  it('Programmatically verify all 90 lessons have self-referencing canonicals', async () => {
    const curriculum = await fetchCurriculumData()
    expect(curriculum).toBeDefined()
    expect(curriculum!.lessons.length).toBe(90)

    for (const lesson of curriculum!.lessons) {
      const meta = await generateLessonMetadata({ params: Promise.resolve({ slug: lesson.slug }) })
      const expectedCanonical = `${expectedSiteUrl}/lessons/${lesson.slug}`
      expect(meta.alternates?.canonical).toBe(expectedCanonical)
    }
  }, 30000)

  it('robots.txt allows public routes and disallows private routes', () => {
    const robotRules = robots()
    expect(robotRules.rules).toBeDefined()
    const ruleGroup = Array.isArray(robotRules.rules) ? robotRules.rules[0] : robotRules.rules

    const allowList = Array.isArray(ruleGroup.allow) ? ruleGroup.allow : [ruleGroup.allow]
    const disallowList = Array.isArray(ruleGroup.disallow) ? ruleGroup.disallow : [ruleGroup.disallow]

    const expectedAllows = ['/', '/about', '/contact', '/privacy', '/terms', '/curriculum', '/lessons/', '/p/']
    for (const path of expectedAllows) {
      expect(allowList.includes(path)).toBe(true)
    }

    const expectedDisallows = [
      '/dashboard',
      '/review',
      '/progress',
      '/settings',
      '/leaderboard',
      '/admin',
      '/onboarding',
      '/capstones',
      '/badges',
      '/api/',
      '/academy/',
      '/login',
      '/app',
    ]
    for (const path of expectedDisallows) {
      expect(disallowList.includes(path)).toBe(true)
    }

    expect(robotRules.sitemap).toBe(`${expectedSiteUrl}/sitemap.xml`)
  })

  it('XML Sitemap contains all public URLs with valid production domain', async () => {
    const entries = await sitemap()
    expect(entries.length).toBeGreaterThanOrEqual(96)

    const urls = entries.map((e) => e.url)
    const uniqueUrls = new Set(urls)
    expect(uniqueUrls.size).toBe(urls.length)

    const requiredMarketing = [
      expectedSiteUrl,
      `${expectedSiteUrl}/curriculum`,
      `${expectedSiteUrl}/about`,
      `${expectedSiteUrl}/contact`,
      `${expectedSiteUrl}/privacy`,
      `${expectedSiteUrl}/terms`,
    ]
    for (const reqUrl of requiredMarketing) {
      expect(urls.includes(reqUrl)).toBe(true)
    }
  })

  it('/signup and (auth) pages inherit noindex, follow', () => {
    expect(authLayoutMetadata.robots).toEqual({ index: false, follow: true })
  })

  it('Admin console layout specifies noindex, nofollow', () => {
    expect(adminLayoutMetadata.robots).toEqual({ index: false, follow: false })
  })

  it('Public support email is standardized to BRAND.supportEmail', () => {
    expect(BRAND.supportEmail).toBe('hello@prodily.adityagangwani.me')
  })
})
