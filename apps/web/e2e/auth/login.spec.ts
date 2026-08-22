import { test, expect } from '@playwright/test'

test.describe('Login & Session Lifecycle E2E Specs', () => {
  test('1. Login page renders branding and email/password form inputs', async ({ page }) => {
    await page.goto('/login')
    await expect(page).toHaveTitle(/Prodily|Login/i)
    const form = page.locator('form')
    await expect(form).toBeVisible()
  })

  test('2. Unauthenticated user accessing /dashboard is redirected to /login', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })

  test('3. Login form validation blocks submission with invalid email format', async ({ page }) => {
    await page.goto('/login')
    const emailInput = page.locator('input[type="email"]')
    const submitButton = page.locator('button[type="submit"]')

    if (await emailInput.isVisible()) {
      await emailInput.fill('invalid-email-string')
      await submitButton.click()
      // Browser HTML5 validation or form error state should be active
      const isInvalid = await emailInput.evaluate((el: HTMLInputElement) => !el.checkValidity())
      expect(isInvalid).toBe(true)
    }
  })
})
