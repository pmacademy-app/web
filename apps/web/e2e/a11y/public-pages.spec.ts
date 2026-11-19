import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const PUBLIC_ROUTES = [
  '/',
  '/curriculum',
  '/frameworks',
  '/faq',
  '/about',
  '/reviews',
  '/lessons/lesson-001',
  '/login',
  '/signup',
]

test.describe('A11y audits: public marketing and auth pages', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`accessibility audit for route ${route}`, async ({ page }) => {
      // Audit the settled page, not a frame of an entrance animation: mid-fade text is
      // partly transparent and axe measures it as low contrast (seen on /frameworks).
      // The site honours reduced motion, and any CSS or WAAPI animation still running
      // is allowed to finish before the scan.
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto(route)
      await page.waitForLoadState('domcontentloaded')
      // Looping animations (a pulsing dot, a spinner) never finish, so only finite ones count.
      await page.waitForFunction(
        () =>
          document
            .getAnimations()
            .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
            .every((animation) => animation.playState !== 'running'),
        undefined,
        { timeout: 5000 }
      )

      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()

      const seriousOrCriticalViolations = accessibilityScanResults.violations.filter(
        (violation) => violation.impact === 'serious' || violation.impact === 'critical'
      )

      expect(seriousOrCriticalViolations).toEqual([])
    })
  }

  test('keyboard navigation: skip link on /', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    // First Tab must focus the skip link
    await page.keyboard.press('Tab')
    const focused = page.locator(':focus')
    await expect(focused).toHaveAttribute('href', '#main-content')
    await expect(focused).toHaveText(/skip to main content/i)

    // Activating the skip link moves focus to main content
    await page.keyboard.press('Enter')
    const mainContent = page.locator('#main-content')
    await expect(mainContent).toBeFocused()
  })

  test('keyboard navigation: skip link on /login', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')

    // First Tab must focus the skip link
    await page.keyboard.press('Tab')
    const focused = page.locator(':focus')
    await expect(focused).toHaveAttribute('href', '#main-content')
    await expect(focused).toHaveText(/skip to main content/i)

    // Activating the skip link moves focus to main content
    await page.keyboard.press('Enter')
    const mainContent = page.locator('#main-content')
    await expect(mainContent).toBeFocused()
  })
})
