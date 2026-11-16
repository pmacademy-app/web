import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { assertNotProduction, requireStagingCredentials } from '../support/env'

const APP_ROUTES = [
  '/dashboard',
  '/academy',
  '/academy/foundations/les_zoyq8a',
  '/progress',
  '/settings',
]

test.describe('A11y audits: authenticated app pages', () => {
  test.beforeEach(() => {
    assertNotProduction()
  })

  test('authenticated routes pass accessibility scans', async ({ page }) => {
    const { email, password } = requireStagingCredentials()

    // Log in
    await page.goto('/login')
    await page.locator('input[type="email"]').fill(email)
    await page.locator('input[type="password"]').fill(password)
    await Promise.all([
      page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 }),
      page.locator('button[type="submit"]').click(),
    ])

    for (const route of APP_ROUTES) {
      await page.goto(route)
      await page.waitForLoadState('domcontentloaded')

      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()

      const seriousOrCriticalViolations = accessibilityScanResults.violations.filter(
        (violation) => violation.impact === 'serious' || violation.impact === 'critical'
      )

      expect(seriousOrCriticalViolations).toEqual([])
    }

    // Open one modal (e.g. search overlay or contextual feedback modal)
    const modalTrigger = page
      .locator('button[aria-label*="search" i], button:has-text("Search"), button:has-text("Feedback")')
      .first()

    if (await modalTrigger.isVisible()) {
      await modalTrigger.click()
      const dialog = page.locator('[role="dialog"]')
      await expect(dialog).toBeVisible()

      const modalScanResults = await new AxeBuilder({ page })
        .include('[role="dialog"]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()

      const modalViolations = modalScanResults.violations.filter(
        (violation) => violation.impact === 'serious' || violation.impact === 'critical'
      )

      expect(modalViolations).toEqual([])
    }
  })
})
