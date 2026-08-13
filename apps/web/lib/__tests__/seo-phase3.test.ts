import assert from 'assert'
import { BRAND } from '../brand'
import { FRAMEWORKS } from '../frameworks'
import { NAV_LINKS, FOOTER_LINK_GROUPS } from '@/config/navigation'
import robots from '../../app/robots'
import sitemap from '../../app/sitemap'
import { fetchCurriculumData } from '../lesson-loader'

console.log('🧪 Running Phase 3 Information Architecture & Internal Linking Test Suite...\n')

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

async function executeSeoPhase3TestSuite() {
  const expectedSiteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? BRAND.siteUrl

  // 1. All 90 Lessons Directly Linked & Unique
  await runTest('All 90 lessons exist and have unique valid slugs for /curriculum linking', async () => {
    const curriculum = await fetchCurriculumData()
    assert.ok(curriculum, 'Curriculum data must exist')
    assert.strictEqual(curriculum.lessons.length, 90, 'Must have exactly 90 lessons')

    const slugs = curriculum.lessons.map((l) => l.slug)
    const uniqueSlugs = new Set(slugs)
    assert.strictEqual(uniqueSlugs.size, 90, 'All 90 lesson slugs must be unique')

    for (const slug of slugs) {
      assert.ok(/^lesson-\d{3}$/.test(slug), `Slug "${slug}" must follow lesson-XXX format`)
    }
  })

  // 2. Frameworks Hub Data Integrity
  await runTest('Frameworks data dictionary contains original models linking to valid source lessons', async () => {
    const curriculum = await fetchCurriculumData()
    const validSlugs = new Set(curriculum?.lessons.map((l) => l.slug) ?? [])

    assert.ok(FRAMEWORKS.length >= 10, `Expected at least 10 frameworks, found ${FRAMEWORKS.length}`)

    const frameworkSlugs = new Set()
    for (const fw of FRAMEWORKS) {
      assert.ok(fw.name, 'Framework must have a name')
      assert.ok(fw.definition, `Framework "${fw.name}" must have a definition`)
      assert.ok(fw.keyTakeaway, `Framework "${fw.name}" must have a key takeaway`)
      assert.ok(validSlugs.has(fw.lessonSlug), `Framework "${fw.name}" references invalid lessonSlug "${fw.lessonSlug}"`)
      assert.ok(!frameworkSlugs.has(fw.slug), `Duplicate framework slug "${fw.slug}"`)
      frameworkSlugs.add(fw.slug)
    }
  })

  // 3. Navigation & Footer Standardization
  await runTest('Navigation & Footer include /frameworks and /curriculum links', async () => {
    const navHrefs = NAV_LINKS.map((n) => n.href)
    assert.ok(navHrefs.includes('/curriculum'), 'Navbar must include /curriculum')
    assert.ok(navHrefs.includes('/frameworks'), 'Navbar must include /frameworks')

    const resourceGroup = FOOTER_LINK_GROUPS.find((g) => g.heading === 'Resources')
    assert.ok(resourceGroup, 'Footer must have Resources group')
    const resourceHrefs = resourceGroup.links.map((l) => l.href)
    assert.ok(resourceHrefs.includes('/curriculum'), 'Footer resources must include /curriculum')
    assert.ok(resourceHrefs.includes('/frameworks'), 'Footer resources must include /frameworks')
    assert.ok(resourceHrefs.includes('/lessons/lesson-001'), 'Footer resources must include sample lesson link')
  })

  // 4. Robots.txt and Sitemap Expansion
  await runTest('robots.txt allows /frameworks and /glossary', async () => {
    const r = robots()
    const ruleGroup = Array.isArray(r.rules) ? r.rules[0] : r.rules
    const allowList = Array.isArray(ruleGroup.allow) ? ruleGroup.allow : [ruleGroup.allow]
    assert.ok(allowList.includes('/frameworks'), 'robots.txt must allow /frameworks')
    assert.ok(allowList.includes('/glossary'), 'robots.txt must allow /glossary')
  })

  await runTest('XML Sitemap contains 98 public URLs including /frameworks and /glossary', async () => {
    const entries = await sitemap()
    assert.strictEqual(entries.length, 98, `Expected 98 sitemap entries (8 marketing + 90 lessons), got ${entries.length}`)

    const urls = entries.map((e) => e.url)
    assert.ok(urls.includes(`${expectedSiteUrl}/frameworks`), 'Sitemap must contain /frameworks')
    assert.ok(urls.includes(`${expectedSiteUrl}/glossary`), 'Sitemap must contain /glossary')

    // Check no duplicate URLs
    const uniqueUrls = new Set(urls)
    assert.strictEqual(uniqueUrls.size, urls.length, 'Sitemap must contain zero duplicate URLs')
  })

  console.log(`\n🎉 Phase 3 Information Architecture Test Suite Passed! (${passed} tests passed)\n`)
}

executeSeoPhase3TestSuite().catch((err) => {
  console.error('Fatal error running SEO Phase 3 test suite:', err)
  process.exit(1)
})
