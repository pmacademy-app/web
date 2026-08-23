import { describe, it, expect } from 'vitest'
import { BRAND } from '../brand'
import {
  getEducationalOrganizationSchema,
  getWebSiteSchema,
  getCourseSchema,
  getLessonSchema,
  getBreadcrumbSchema,
  getAboutPageSchema,
  getFAQPageSchema,
} from '../schema'
import { metadata as homeMetadata } from '../../app/(marketing)/page'
import { metadata as aboutMetadata } from '../../app/(marketing)/about/page'
import { metadata as contactMetadata } from '../../app/(marketing)/contact/page'
import { metadata as curriculumMetadata } from '../../app/(marketing)/curriculum/page'
import { metadata as privacyMetadata } from '../../app/(marketing)/privacy/page'
import { metadata as termsMetadata } from '../../app/(marketing)/terms/page'
import robots from '../../app/robots'
import sitemap from '../../app/sitemap'
import { fetchCurriculumData, fetchCompiledLesson } from '../lesson-loader'
import { FAQ_ITEMS, MODULES } from '@/config/content'

describe('Phase 2 Structured Data, GEO & AEO Unit Test Suite', () => {
  const expectedSiteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? BRAND.siteUrl

  it('Phase 1 Regression: Homepage self-referencing canonical', () => {
    expect(homeMetadata.alternates?.canonical).toBe(expectedSiteUrl)
  })

  it('Phase 1 Regression: /about, /contact, /curriculum canonicals', () => {
    expect(aboutMetadata.alternates?.canonical).toBe(`${expectedSiteUrl}/about`)
    expect(contactMetadata.alternates?.canonical).toBe(`${expectedSiteUrl}/contact`)
    expect(curriculumMetadata.alternates?.canonical).toBe(`${expectedSiteUrl}/curriculum`)
    expect(privacyMetadata.alternates?.canonical).toBe(`${expectedSiteUrl}/privacy`)
    expect(termsMetadata.alternates?.canonical).toBe(`${expectedSiteUrl}/terms`)
  })

  it('Phase 1 Regression: robots.txt and sitemap.xml rules', async () => {
    const r = robots()
    expect(r.sitemap).toBe(`${expectedSiteUrl}/sitemap.xml`)
    const s = await sitemap()
    expect(s.length).toBeGreaterThanOrEqual(96)
  })

  it('EducationalOrganization schema is valid and complete', () => {
    const org = getEducationalOrganizationSchema()
    expect(org['@type']).toBe('EducationalOrganization')
    expect(org.name).toBe(BRAND.fullName)
    expect(org.url).toBe(expectedSiteUrl)
    expect(org.logo.startsWith(expectedSiteUrl)).toBe(true)
    expect(org.founder.name).toBe('Aditya Gangwani')
    expect(org.founder.url).toBe('https://adityagangwani.me')
    expect(Array.isArray(org.sameAs)).toBe(true)
    expect(org.sameAs.includes('https://adityagangwani.me')).toBe(true)
  })

  it('WebSite schema is valid and complete', () => {
    const website = getWebSiteSchema()
    expect(website['@type']).toBe('WebSite')
    expect(website.name).toBe(BRAND.fullName)
    expect(website.url).toBe(expectedSiteUrl)
    expect(website.publisher['@id']).toBe(`${expectedSiteUrl}/#organization`)
  })

  it('Course schema for /curriculum includes provider & all 9 modules', () => {
    const course = getCourseSchema()
    expect(course['@type']).toBe('Course')
    expect(course.isAccessibleForFree).toBe(true)
    expect(course.provider['@type']).toBe('EducationalOrganization')
    expect(course.provider.name).toBe(BRAND.fullName)
    expect(course.hasPart.length).toBe(9)
    for (let i = 0; i < MODULES.length; i++) {
      const part = course.hasPart[i]
      expect(part['@type']).toBe('CourseUnit')
      expect(part.position).toBe(i + 1)
      expect(part.name.includes(MODULES[i].title)).toBe(true)
    }
  })

  it('Programmatically verify all 90 lessons generate valid LearningResource schema', async () => {
    const curriculum = await fetchCurriculumData()
    expect(curriculum).toBeDefined()
    expect(curriculum!.lessons.length).toBe(90)

    for (let i = 0; i < curriculum!.lessons.length; i++) {
      const entry = curriculum!.lessons[i] as { id: string; slug: string }
      const lesson = await fetchCompiledLesson(entry.id)
      expect(lesson).toBeDefined()

      const globalOrder = i + 1
      const schema = getLessonSchema(lesson!, globalOrder, entry.slug)

      expect(schema['@type']).toEqual(['LearningResource', 'Article'])
      expect(schema.name).toBe(`Lesson ${globalOrder}: ${lesson!.title}`)
      expect(schema.learningResourceType).toBe('Lesson')
      expect(schema.author.name).toBe('Aditya Gangwani')
      expect(schema.author.url).toBe('https://adityagangwani.me')
    }
  }, 30000)

  it('BreadcrumbList schema is valid for lesson hierarchy', () => {
    const items = [
      { name: 'Home', url: expectedSiteUrl },
      { name: 'Curriculum', url: `${expectedSiteUrl}/curriculum` },
      { name: 'Product Thinking Foundations', url: `${expectedSiteUrl}/curriculum#module-foundations` },
      { name: 'Lesson 1', url: `${expectedSiteUrl}/lessons/lesson-001` },
    ]
    const bc = getBreadcrumbSchema(items)
    expect(bc['@type']).toBe('BreadcrumbList')
    expect(bc.itemListElement.length).toBe(4)
    expect(bc.itemListElement[0].name).toBe('Home')
    expect(bc.itemListElement[0].position).toBe(1)
    expect(bc.itemListElement[3].name).toBe('Lesson 1')
    expect(bc.itemListElement[3].position).toBe(4)
  })

  it('AboutPage schema includes Person and Organization relationship', () => {
    const about = getAboutPageSchema()
    expect(about['@graph']).toBeDefined()
    const pageObj = about['@graph'].find((o) => o['@type'] === 'AboutPage')
    const personObj = about['@graph'].find((o) => o['@type'] === 'Person')

    expect(pageObj).toBeDefined()
    expect(personObj).toBeDefined()
    expect(personObj?.name).toBe('Aditya Gangwani')
    expect(personObj?.url).toBe('https://adityagangwani.me')
    expect(personObj?.worksFor?.name).toBe(BRAND.fullName)
  })

  it('FAQPage schema matches all visible FAQ_ITEMS', () => {
    const faq = getFAQPageSchema()
    expect(faq['@type']).toBe('FAQPage')
    expect(faq.mainEntity.length).toBe(FAQ_ITEMS.length)
    for (let i = 0; i < FAQ_ITEMS.length; i++) {
      expect(faq.mainEntity[i].name).toBe(FAQ_ITEMS[i].question)
      expect(faq.mainEntity[i].acceptedAnswer.text).toBe(FAQ_ITEMS[i].answer)
    }
  })
})
