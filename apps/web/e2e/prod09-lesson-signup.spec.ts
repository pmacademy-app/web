import { test, expect, type Page } from '@playwright/test'

import { assertNotProduction, generateTestEmail, requireWriteFlows } from './support/env'

/**
 * PROD-09 / UX-06 / UX-07: a learner who clicks the CTA on a public lesson preview
 * signs up, sees the one-screen onboarding, and lands on THAT lesson in the app, not
 * on the dashboard.
 *
 * `next` is threaded the whole way:
 *   /lessons/<slug>  ->  /signup?next=/academy/<module>/<id>
 *   signup success   ->  push(next)  ->  proxy forces onboarding: /onboarding?next=...
 *   "Start Learning" ->  push(next)
 *
 * A locked target lesson is not special-cased: the lesson's own gate handles it
 * (owner decision Q5), so this spec only asserts the URL.
 *
 * Email verification is OFF (owner decision D2), so signup signs the learner straight in.
 * Turnstile must use the published always-pass test keys on the target environment
 * (see e2e/flows/signup-to-xp.spec.ts).
 */

const PUBLIC_LESSON_SLUG = 'lesson-001'

/** Reads the signup CTA on a public lesson and returns the in-app lesson path it targets. */
async function lessonCtaTarget(page: Page): Promise<{ href: string; next: string }> {
  await page.goto(`/lessons/${PUBLIC_LESSON_SLUG}`)
  const cta = page.getByRole('link', { name: /start (?:module \d+ · )?lesson \d+ free/i })
  await expect(cta).toBeVisible()

  const href = await cta.getAttribute('href')
  expect(href, 'the lesson CTA must link to signup').not.toBeNull()
  const url = new URL(href!, 'http://placeholder.local')
  expect(url.pathname).toBe('/signup')

  const next = url.searchParams.get('next')
  expect(next, 'the lesson CTA must carry next').not.toBeNull()
  expect(next!).toMatch(/^\/academy\/[^/]+\/[^/]+$/)
  return { href: href!, next: next! }
}

test.describe('PROD-09: public lesson CTA threads next', () => {
  test.beforeEach(() => {
    assertNotProduction()
  })

  test('the CTA links to signup with the in-app lesson as next, and login keeps it', async ({ page }) => {
    const { href, next } = await lessonCtaTarget(page)

    await page.goto(href)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    // Server-rendered shell: no client-only loading placeholder.
    await expect(page.getByText(/Loading signup/i)).toHaveCount(0)

    const loginLink = page.getByRole('link', { name: 'Log in', exact: true })
    const loginHref = await loginLink.getAttribute('href')
    const loginUrl = new URL(loginHref!, 'http://placeholder.local')
    expect(loginUrl.pathname).toBe('/login')
    expect(loginUrl.searchParams.get('next')).toBe(next)
  })

  test('signup ignores an off-origin next', async ({ page }) => {
    await page.goto('/signup?next=' + encodeURIComponent('//evil.example.com/x'))
    const loginHref = await page.getByRole('link', { name: 'Log in', exact: true }).getAttribute('href')
    expect(loginHref).toBe('/login')
  })

  test('lesson CTA -> signup -> one-screen onboarding -> that lesson', async ({ page }) => {
    requireWriteFlows()

    const { href, next } = await lessonCtaTarget(page)
    await page.goto(href)

    const email = generateTestEmail()
    const password = `E2e!${Math.random().toString(36).slice(2, 10)}A1`

    await page.locator('#signup-name').fill('E2E Lesson CTA')
    await page.locator('#signup-email').fill(email)
    await page.locator('#signup-password').fill(password)
    await page.locator('#signup-accept-terms').check()
    await page.locator('#signup-confirm-age').check()

    // Turnstile auto-solves with the test key; an enabled submit is the signal.
    const submit = page.locator('form button[type="submit"]')
    await expect(submit).toBeEnabled({ timeout: 30_000 })
    await submit.click()

    // A brand-new learner has not onboarded, so the proxy routes them to onboarding
    // and keeps the target lesson as next.
    await page.waitForURL((url) => url.pathname === '/onboarding', { timeout: 45_000 })
    expect(new URL(page.url()).searchParams.get('next')).toBe(next)

    // One screen: pick a goal and an experience level, then Start Learning.
    await page.getByRole('radiogroup', { name: 'Primary learning goal' }).getByRole('radio').first().click()
    await page.getByRole('radiogroup', { name: 'Experience level' }).getByRole('radio').first().click()
    await page.getByRole('button', { name: /start learning/i }).click()

    await page.waitForURL((url) => url.pathname === next, { timeout: 45_000 })
    expect(new URL(page.url()).pathname).toBe(next)
  })
})
