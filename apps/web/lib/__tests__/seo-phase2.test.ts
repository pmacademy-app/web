import assert from 'assert'
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

console.log('🧪 Running Phase 2 Structured Data, GEO & AEO Unit Test Suite...\n')

let passed = 0

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (err) {
    console.error(`  ✕ ${name}`)
    console.error(err)
    process.exit(1)
  }
}

async function executeSeoPhase2TestSuite() {
  const expectedSiteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? BRAND.siteUrl

  // ─── 1. Phase 1 Regressions ──────────────────────────────────────────────────

  await runTest('Phase 1 Regression: Homepage self-referencing canonical', async () => {
    assert.strictEqual(homeMetadata.alternates?.canonical, expectedSiteUrl)
  })

  await runTest('Phase 1 Regression: /about, /contact, /curriculum canonicals', async () => {
    assert.strictEqual(aboutMetadata.alternates?.canonical, `${expectedSiteUrl}/about`)
    assert.strictEqual(contactMetadata.alternates?.canonical, `${expectedSiteUrl}/contact`)
    assert.strictEqual(curriculumMetadata.alternates?.canonical, `${expectedSiteUrl}/curriculum`)
    assert.strictEqual(privacyMetadata.alternates?.canonical, `${expectedSiteUrl}/privacy`)
    assert.strictEqual(termsMetadata.alternates?.canonical, `${expectedSiteUrl}/terms`)
  })

  await runTest('Phase 1 Regression: robots.txt and sitemap.xml rules', async () => {
    const r = robots()
    assert.strictEqual(r.sitemap, `${expectedSiteUrl}/sitemap.xml`)
    const s = await sitemap()
    assert.strictEqual(s.length, 96)
  })

  // ─── 2. EducationalOrganization & WebSite Schema ─────────────────────────────

  await runTest('EducationalOrganization schema is valid and complete', async () => {
    const org = getEducationalOrganizationSchema()
    assert.strictEqual(org['@type'], 'EducationalOrganization')
    assert.strictEqual(org.name, BRAND.fullName)
    assert.strictEqual(org.url, expectedSiteUrl)
    assert.ok(org.logo.startsWith(expectedSiteUrl), 'Logo must use siteUrl')
    assert.strictEqual(org.founder.name, 'Aditya Gangwani')
    assert.strictEqual(org.founder.url, 'https://adityagangwani.me')
    assert.ok(Array.isArray(org.sameAs), 'sameAs must be an array')
    assert.ok(org.sameAs.includes('https://adityagangwani.me'))
    assert.ok(org.sameAs.includes(BRAND.social.buyMeACoffee))
    assert.doesNotThrow(() => JSON.stringify(org), 'Schema must serialize cleanly to JSON')
  })

  await runTest('WebSite schema is valid and complete', async () => {
    const website = getWebSiteSchema()
    assert.strictEqual(website['@type'], 'WebSite')
    assert.strictEqual(website.name, BRAND.fullName)
    assert.strictEqual(website.url, expectedSiteUrl)
    assert.strictEqual(website.publisher['@id'], `${expectedSiteUrl}/#organization`)
    assert.doesNotThrow(() => JSON.stringify(website), 'Schema must serialize cleanly to JSON')
  })

  // ─── 3. Course Schema for /curriculum ────────────────────────────────────────

  await runTest('Course schema for /curriculum includes provider & all 9 modules', async () => {
    const course = getCourseSchema()
    assert.strictEqual(course['@type'], 'Course')
    assert.strictEqual(course.isAccessibleForFree, true)
    assert.strictEqual(course.provider['@type'], 'EducationalOrganization')
    assert.strictEqual(course.provider.name, BRAND.fullName)
    assert.strictEqual(course.hasPart.length, 9, 'Course must include all 9 modules')
    for (let i = 0; i < MODULES.length; i++) {
      const part = course.hasPart[i]
      assert.strictEqual(part['@type'], 'CourseUnit')
      assert.strictEqual(part.position, i + 1)
      assert.ok(part.name.includes(MODULES[i].title), `Module name must match ${MODULES[i].title}`)
    }
    assert.doesNotThrow(() => JSON.stringify(course), 'Course schema must serialize cleanly to JSON')
  })

  // ─── 4. LearningResource / Article Schema across All 90 Lessons ───────────────

  await runTest('Programmatically verify all 90 lessons generate valid LearningResource schema', async () => {
    const curriculum = await fetchCurriculumData()
    assert.ok(curriculum, 'Curriculum data must exist')
    assert.strictEqual(curriculum.lessons.length, 90)

    for (let i = 0; i < curriculum.lessons.length; i++) {
      const entry = curriculum.lessons[i]
      const lesson = await fetchCompiledLesson(entry.id)
      assert.ok(lesson, `Lesson ${entry.id} must compile`)

      const globalOrder = i + 1
      const schema = getLessonSchema(lesson, globalOrder, entry.slug)

      assert.deepStrictEqual(schema['@type'], ['LearningResource', 'Article'])
      assert.strictEqual(schema.name, `Lesson ${globalOrder}: ${lesson.title}`)
      assert.strictEqual(schema.learningResourceType, 'Lesson')
      assert.strictEqual(schema.author.name, 'Aditya Gangwani')
      assert.strictEqual(schema.author.url, 'https://adityagangwani.me')
      assert.strictEqual(schema.timeRequired, `PT${lesson.estimatedReadingTime || 20}M`)
      assert.strictEqual(schema.url, `${expectedSiteUrl}/lessons/${entry.slug}`)
      assert.strictEqual(schema.isPartOf['@type'], 'Course')
      assert.doesNotThrow(() => JSON.stringify(schema), `Lesson ${entry.slug} schema must serialize cleanly`)
    }
  })

  // ─── 5. BreadcrumbList Schema & Structure ───────────────────────────────────

  await runTest('BreadcrumbList schema is valid for lesson hierarchy', async () => {
    const items = [
      { name: 'Home', url: expectedSiteUrl },
      { name: 'Curriculum', url: `${expectedSiteUrl}/curriculum` },
      { name: 'Product Thinking Foundations', url: `${expectedSiteUrl}/curriculum#module-foundations` },
      { name: 'Lesson 1', url: `${expectedSiteUrl}/lessons/lesson-001` },
    ]
    const bc = getBreadcrumbSchema(items)
    assert.strictEqual(bc['@type'], 'BreadcrumbList')
    assert.strictEqual(bc.itemListElement.length, 4)
    assert.strictEqual(bc.itemListElement[0].name, 'Home')
    assert.strictEqual(bc.itemListElement[0].position, 1)
    assert.strictEqual(bc.itemListElement[3].name, 'Lesson 1')
    assert.strictEqual(bc.itemListElement[3].position, 4)
    assert.doesNotThrow(() => JSON.stringify(bc), 'Breadcrumb schema must serialize cleanly')
  })

  // ─── 6. AboutPage & Person Schema ───────────────────────────────────────────

  await runTest('AboutPage schema includes Person and Organization relationship', async () => {
    const about = getAboutPageSchema()
    assert.ok(about['@graph'], '@graph array must exist')
    const pageObj = about['@graph'].find((o) => o['@type'] === 'AboutPage')
    const personObj = about['@graph'].find((o) => o['@type'] === 'Person')

    assert.ok(pageObj, 'AboutPage entity must exist')
    assert.ok(personObj, 'Person entity must exist')
    assert.strictEqual(personObj.name, 'Aditya Gangwani')
    assert.strictEqual(personObj.url, 'https://adityagangwani.me')
    assert.strictEqual(personObj.worksFor.name, BRAND.fullName)
    assert.doesNotThrow(() => JSON.stringify(about), 'About schema must serialize cleanly')
  })

  // ─── 7. FAQPage Schema Verification ─────────────────────────────────────────

  await runTest('FAQPage schema matches all visible FAQ_ITEMS', async () => {
    const faq = getFAQPageSchema()
    assert.strictEqual(faq['@type'], 'FAQPage')
    assert.strictEqual(faq.mainEntity.length, FAQ_ITEMS.length)
    for (let i = 0; i < FAQ_ITEMS.length; i++) {
      assert.strictEqual(faq.mainEntity[i].name, FAQ_ITEMS[i].question)
      assert.strictEqual(faq.mainEntity[i].acceptedAnswer.text, FAQ_ITEMS[i].answer)
    }
    assert.doesNotThrow(() => JSON.stringify(faq), 'FAQ schema must serialize cleanly')
  })

  console.log(`\n🎉 Phase 2 Structured Data, GEO & AEO Test Suite Passed! (${passed} tests passed)\n`)
}

executeSeoPhase2TestSuite().catch((err) => {
  console.error('Fatal error running SEO Phase 2 test suite:', err)
  process.exit(1)
})
