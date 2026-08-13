import assert from 'assert'
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

console.log('🧪 Running Phase 1 Technical SEO Foundation Unit Test Suite...\n')

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

async function executeSeoPhase1TestSuite() {
  const expectedSiteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? BRAND.siteUrl

  // 1. Audit Canonicals for Core Marketing Pages
  await runTest('Homepage has correct self-referencing canonical', async () => {
    assert.strictEqual(homeMetadata.alternates?.canonical, expectedSiteUrl)
  })

  await runTest('/about page has correct self-referencing canonical', async () => {
    assert.strictEqual(aboutMetadata.alternates?.canonical, `${expectedSiteUrl}/about`)
  })

  await runTest('/contact page has correct self-referencing canonical', async () => {
    assert.strictEqual(contactMetadata.alternates?.canonical, `${expectedSiteUrl}/contact`)
  })

  await runTest('/curriculum page has correct self-referencing canonical', async () => {
    assert.strictEqual(curriculumMetadata.alternates?.canonical, `${expectedSiteUrl}/curriculum`)
  })

  await runTest('/privacy page has correct self-referencing canonical', async () => {
    assert.strictEqual(privacyMetadata.alternates?.canonical, `${expectedSiteUrl}/privacy`)
  })

  await runTest('/terms page has correct self-referencing canonical', async () => {
    assert.strictEqual(termsMetadata.alternates?.canonical, `${expectedSiteUrl}/terms`)
  })

  // 2. Programmatic Audit of All 90 Lessons Canonicals
  await runTest('Programmatically verify all 90 lessons have self-referencing canonicals', async () => {
    const curriculum = await fetchCurriculumData()
    assert.ok(curriculum, 'Curriculum data must be loaded')
    assert.strictEqual(curriculum.lessons.length, 90, `Expected 90 lessons, found ${curriculum.lessons.length}`)

    for (const lesson of curriculum.lessons) {
      const meta = await generateLessonMetadata({ params: Promise.resolve({ slug: lesson.slug }) })
      const expectedCanonical = `${expectedSiteUrl}/lessons/${lesson.slug}`
      assert.strictEqual(
        meta.alternates?.canonical,
        expectedCanonical,
        `Lesson ${lesson.slug} canonical mismatch: got ${meta.alternates?.canonical}, expected ${expectedCanonical}`
      )
    }
  })

  // 3. Robots.txt Configuration
  await runTest('robots.txt allows public routes and disallows private routes', async () => {
    const robotRules = robots()
    assert.ok(robotRules.rules, 'Robots rules must exist')
    const ruleGroup = Array.isArray(robotRules.rules) ? robotRules.rules[0] : robotRules.rules

    const allowList = Array.isArray(ruleGroup.allow) ? ruleGroup.allow : [ruleGroup.allow]
    const disallowList = Array.isArray(ruleGroup.disallow) ? ruleGroup.disallow : [ruleGroup.disallow]

    // Verify key public paths allowed
    const expectedAllows = ['/', '/about', '/contact', '/privacy', '/terms', '/curriculum', '/lessons/', '/p/']
    for (const path of expectedAllows) {
      assert.ok(allowList.includes(path), `robots.txt must allow "${path}"`)
    }

    // Verify key private paths disallowed
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
      assert.ok(disallowList.includes(path), `robots.txt must disallow "${path}"`)
    }

    // Verify sitemap reference
    assert.strictEqual(robotRules.sitemap, `${expectedSiteUrl}/sitemap.xml`)
  })

  // 4. XML Sitemap Verification
  await runTest('XML Sitemap contains all public URLs with valid production domain', async () => {
    const entries = await sitemap()
    assert.ok(entries.length >= 96, `Expected at least 96 sitemap entries, got ${entries.length}`)

    const urls = entries.map((e) => e.url)

    // Check no duplicate URLs
    const uniqueUrls = new Set(urls)
    assert.strictEqual(uniqueUrls.size, urls.length, 'Sitemap must not contain duplicate URLs')

    // Check required marketing URLs
    const requiredMarketing = [
      expectedSiteUrl,
      `${expectedSiteUrl}/curriculum`,
      `${expectedSiteUrl}/about`,
      `${expectedSiteUrl}/contact`,
      `${expectedSiteUrl}/privacy`,
      `${expectedSiteUrl}/terms`,
    ]
    for (const reqUrl of requiredMarketing) {
      assert.ok(urls.includes(reqUrl), `Sitemap missing required URL: ${reqUrl}`)
    }

    // Check all URLs start with production domain
    for (const u of urls) {
      assert.ok(u.startsWith(expectedSiteUrl), `URL "${u}" does not start with siteUrl ${expectedSiteUrl}`)
      // Check no private routes in sitemap
      assert.ok(!u.includes('/dashboard'), `Sitemap contains private route: ${u}`)
      assert.ok(!u.includes('/academy'), `Sitemap contains private route: ${u}`)
      assert.ok(!u.includes('/settings'), `Sitemap contains private route: ${u}`)
      assert.ok(!u.includes('/admin'), `Sitemap contains private route: ${u}`)
    }
  })

  // 5. Auth & Admin Metadata Security Check
  await runTest('/signup and (auth) pages inherit noindex, follow', async () => {
    assert.deepStrictEqual(authLayoutMetadata.robots, { index: false, follow: true })
  })

  await runTest('Admin console layout specifies noindex, nofollow', async () => {
    assert.deepStrictEqual(adminLayoutMetadata.robots, { index: false, follow: false })
  })

  // 6. Contact Identity Verification
  await runTest('Public support email is standardized to BRAND.supportEmail', async () => {
    assert.strictEqual(BRAND.supportEmail, 'hello@prodily.adityagangwani.me')
  })

  console.log(`\n🎉 Phase 1 Technical SEO Foundation Test Suite Passed! (${passed} tests passed)\n`)
}

executeSeoPhase1TestSuite().catch((err) => {
  console.error('Fatal error running SEO test suite:', err)
  process.exit(1)
})
