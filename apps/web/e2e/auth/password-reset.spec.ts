import { test, expect } from '@playwright/test'

test.describe('Password Reset Navigation & Form E2E Specs', () => {
  test('1. Reset password page loads reset form correctly', async ({ page }) => {
    await page.goto('/reset-password')
    await expect(page).toHaveTitle(/Account Authentication|Reset|Password/i)
    const emailInput = page.locator('input[type="email"]')
    await expect(emailInput).toBeVisible()
  })

  test('2. Submitting empty email displays client error or prevents submit', async ({ page }) => {
    await page.goto('/reset-password')
    const submitButton = page.locator('button[type="submit"]')
    await submitButton.click()
    const emailInput = page.locator('input[type="email"]')
    const isInvalid = await emailInput.evaluate((el: HTMLInputElement) => !el.checkValidity())
    expect(isInvalid).toBe(true)
  })
})
