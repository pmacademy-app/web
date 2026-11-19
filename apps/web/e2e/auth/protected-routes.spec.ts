import { test, expect } from '@playwright/test'

test.describe('Protected Routes & RBAC Auth Guards E2E Specs', () => {
  test('1. Anonymous access to protected app routes redirects to /login', async ({ page }) => {
    const protectedPaths = ['/dashboard', '/settings', '/academy']
    for (const path of protectedPaths) {
      await page.goto(path)
      await expect(page).toHaveURL(/\/login/)
    }
  })

  test('2. /admin on the learner host is a 404 or a 308 to the admin host', async ({ request, baseURL }) => {
    // The admin console moved to its own repository and host. The learner proxy sends
    // /admin to ADMIN_SITE_URL with a 308 when that is configured; otherwise the path
    // does not exist here. Either way it never asks for a learner session.
    const response = await request.get('/admin/moderation?tab=capstones', { maxRedirects: 0 })
    if (response.status() === 308) {
      const location = new URL(response.headers()['location'] ?? '')
      expect(location.pathname).toBe('/admin/moderation')
      expect(location.search).toBe('?tab=capstones')
      expect(location.origin).not.toBe(new URL(baseURL ?? 'http://localhost:3000').origin)
    } else {
      expect(response.status()).toBe(404)
    }
  })

  test('3. Public routes remain accessible without authentication', async ({ page }) => {
    const publicPaths = ['/about', '/privacy', '/terms', '/contact']
    for (const path of publicPaths) {
      await page.goto(path)
      await expect(page).not.toHaveURL(/\/login/)
    }
  })
})
