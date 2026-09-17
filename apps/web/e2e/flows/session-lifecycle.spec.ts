import { test, expect, type Page } from '@playwright/test'

import {
  SESSION_COOKIES,
  assertNotProduction,
  requireStagingCredentials,
} from '../support/env'

/**
 * B14-C — login → session persistence → protected route → logout.
 *
 * One of the two flows the batch names. It is deliberately the flow that proves B13-A
 * landed correctly, which is why the roadmap sequences B13-A before this spec: *"Writing
 * the session-persistence E2E before the session model is final would encode behavior
 * that is about to change."*
 *
 * The persistence assertions are therefore not generic. B13-A made httpOnly cookies the
 * only session store and removed the `localStorage` copy (F-02) and the tokens from
 * login response bodies (F-SEC-8). A session spec that only checked "am I still logged
 * in after a reload" would have passed just as well under the old, broken model. These
 * check *where* the session lives, because that is what changed and what can regress.
 */

/** Reads every storage key the page can see, so an assertion can prove a negative. */
async function browserStorageKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const keys: string[] = []
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key) keys.push(`local:${key}`)
      }
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i)
        if (key) keys.push(`session:${key}`)
      }
    } catch {
      // A browser with storage blocked reports nothing, which satisfies the assertion
      // for the right reason: there is no session in a store that does not exist.
    }
    return keys
  })
}

async function logIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 }),
    page.locator('button[type="submit"]').click(),
  ])
}

test.describe('B14-C — session lifecycle', () => {
  test.beforeEach(() => {
    assertNotProduction()
  })

  test('login establishes a cookie session, survives navigation and reload, then logout ends it', async ({
    page,
    context,
  }) => {
    const { email, password } = requireStagingCredentials()

    // ── 1. Login ──────────────────────────────────────────────────────────────
    await logIn(page, email, password)
    await expect(page).toHaveURL(/\/dashboard/)

    const afterLogin = await context.cookies()
    const sessionCookies = afterLogin.filter((c) =>
      (SESSION_COOKIES as readonly string[]).includes(c.name)
    )

    expect(
      sessionCookies.length,
      'login must set the session cookies B13-A made the only session store'
    ).toBeGreaterThan(0)

    for (const cookie of sessionCookies) {
      // The whole point of B13-A. A readable session cookie would put the refresh
      // token back within reach of any script on the origin.
      expect(cookie.httpOnly, `${cookie.name} must be httpOnly`).toBe(true)
      expect(cookie.sameSite, `${cookie.name} must be SameSite=Lax`).toBe('Lax')
    }

    // ── 2. No token in browser-readable storage (F-02) ────────────────────────
    const keys = await browserStorageKeys(page)
    const sessionish = keys.filter((k) => /sb-|supabase|auth-token|access_token|refresh/i.test(k))
    expect(
      sessionish,
      'B13-A removed the localStorage session; a key here means persistSession came back'
    ).toEqual([])

    // ── 3. Session persists across navigation ─────────────────────────────────
    await page.goto('/settings')
    await expect(page).not.toHaveURL(/\/login/)

    // ── 4. Session persists across a full reload ──────────────────────────────
    await page.reload()
    await expect(page).not.toHaveURL(/\/login/)

    // ── 5. Protected route is reachable while authenticated ───────────────────
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/dashboard/)

    // ── 6. Logout ─────────────────────────────────────────────────────────────
    const logout = page.getByRole('button', { name: /log ?out|sign ?out/i }).first()
    if (await logout.isVisible().catch(() => false)) {
      await logout.click()
    } else {
      // The control lives behind a menu on some viewports. Calling the endpoint the
      // shared helper calls exercises the same server path deterministically.
      await page.evaluate(() =>
        fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'sign_out' }),
        })
      )
      await page.goto('/login')
    }

    await page.waitForURL(/\/login/, { timeout: 30_000 })

    // ── 7. The session is actually gone, not just navigated away from ─────────
    const afterLogout = await context.cookies()
    const remaining = afterLogout.filter(
      (c) => (SESSION_COOKIES as readonly string[]).includes(c.name) && c.value !== ''
    )
    expect(remaining, 'logout must clear the session cookies, not only redirect').toEqual([])

    // The strongest assertion available: the protected route refuses us again.
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })

  test('a browser login response carries no tokens (F-SEC-8)', async ({ request }) => {
    const { email, password } = requireStagingCredentials()

    // Called without the `x-client-type: native` header, so this is a browser caller
    // by B13-A's definition and must receive its session only as httpOnly cookies.
    const response = await request.post('/api/auth/login', {
      data: { email, password },
    })

    expect(response.status()).toBe(200)
    const body = await response.json()

    expect(body.success).toBe(true)
    // Absent, not null: there is no token to find, rather than an empty one.
    expect(body.session, 'a browser login body must not carry a session').toBeUndefined()
    expect(JSON.stringify(body)).not.toContain('refresh_token')
  })
})

test.describe('B14-C — session guards without credentials', () => {
  /**
   * These need no staging account, so they run everywhere including a plain local
   * `npm run test:e2e`. They are the deterministic floor under the flow above: if the
   * proxy stopped guarding protected routes, this fails in every environment rather
   * than only where secrets happen to be configured.
   */
  test('an unauthenticated visitor cannot reach a protected route', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })

  test('an unauthenticated visitor holds no session cookie', async ({ page, context }) => {
    await page.goto('/login')
    const cookies = await context.cookies()
    const session = cookies.filter(
      (c) => (SESSION_COOKIES as readonly string[]).includes(c.name) && c.value !== ''
    )
    expect(session).toEqual([])
  })

  test('signing out is safe with no session at all', async ({ request }) => {
    // B13-A made sign-out anonymous by policy precisely because the access token has
    // usually expired by the time someone clicks it.
    const response = await request.post('/api/auth/session', {
      data: { action: 'sign_out' },
    })
    expect(response.status()).toBe(200)
  })
})
