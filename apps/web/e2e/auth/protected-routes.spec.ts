import { test, expect } from '@playwright/test'

test.describe('Protected Routes & RBAC Auth Guards E2E Specs', () => {
  test('1. Anonymous access to protected app routes redirects to /login', async ({ page }) => {
    const protectedPaths = ['/dashboard', '/settings', '/academy']
    for (const path of protectedPaths) {
      await page.goto(path)
      await expect(page).toHaveURL(/\/login/)
    }
  })

  test('2. Anonymous access to /admin redirects to /admin/login', async ({ page }) => {
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/admin\/login/)
  })

  test('3. Public routes remain accessible without authentication', async ({ page }) => {
    const publicPaths = ['/about', '/privacy', '/terms', '/contact']
    for (const path of publicPaths) {
      await page.goto(path)
      await expect(page).not.toHaveURL(/\/login/)
    }
  })
})
