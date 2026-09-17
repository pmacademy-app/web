import { test, expect, type Page } from '@playwright/test'

import { assertNotProduction, generateTestEmail, requireWriteFlows } from '../support/env'

/**
 * B14-C — signup → verify → first lesson → XP.
 *
 * The second of the two flows the batch names, and the one that actually exercises the
 * product: an account is created, an email is verified, a lesson is completed, and XP
 * lands. Every piece of that is a write, which is why it is gated twice — on
 * `E2E_ALLOW_WRITES` and on the production guard in `support/env.ts`.
 *
 * ## Turnstile
 *
 * Signup is behind a Cloudflare challenge. The spec relies on the published always-pass
 * test keys already documented in `.github/workflows/ci.yml` — `1x00000000000000000000AA`
 * and `1x0000000000000000000000000000000AA`. Those are public dummies, not credentials:
 * the site key is visible in every page that renders the widget, and the secret only
 * ever validates the matching dummy token. Staging must be configured with them, or the
 * challenge never solves and this flow cannot run.
 *
 * ## Verification
 *
 * Email verification is the one step a browser cannot drive on its own — the link
 * arrives out of band. Rather than poll a mailbox (which would make the spec depend on a
 * third-party inbox API and its delivery latency, the two biggest sources of flake in
 * this kind of test), the spec accepts a verification URL supplied by the harness via
 * `E2E_VERIFICATION_URL_TEMPLATE`, and otherwise asserts the pre-verification state and
 * stops there with a stated reason. Half the flow proven deterministically beats the
 * whole flow proven intermittently.
 */

async function completeSignupForm(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/signup')

  await page.locator('#signup-name').fill('E2E Learner')
  await page.locator('#signup-email').fill(email)
  await page.locator('#signup-password').fill(password)

  // The Turnstile widget renders into an iframe and auto-solves with the test key.
  // Waiting for the submit button to become enabled is the observable signal that the
  // challenge resolved, and is far less brittle than reaching into the iframe.
  const submit = page.locator('button[type="submit"]')
  await expect(submit).toBeEnabled({ timeout: 30_000 })
  await submit.click()
}

test.describe('B14-C — signup to first XP', () => {
  test.beforeEach(() => {
    assertNotProduction()
  })

  test('a new learner can sign up, verify, complete a lesson and earn XP', async ({ page }) => {
    requireWriteFlows()

    const email = generateTestEmail()
    const password = `E2e!${Math.random().toString(36).slice(2, 10)}A1`

    // ── 1. Signup ─────────────────────────────────────────────────────────────
    await completeSignupForm(page, email, password)

    // Either the app asks for verification, or it signs the learner straight in when
    // verification is disabled in platform settings. Both are valid outcomes of a
    // successful signup, and the flow branches rather than assuming one.
    await page.waitForURL(
      (url) => /\/verify|\/login|\/dashboard|\/onboarding/.test(url.pathname),
      { timeout: 45_000 }
    )

    const landed = new URL(page.url()).pathname
    const needsVerification = /\/verify|\/login/.test(landed)

    // ── 2. Verify ─────────────────────────────────────────────────────────────
    if (needsVerification) {
      const template = process.env.E2E_VERIFICATION_URL_TEMPLATE
      test.skip(
        !template,
        'Signup reached the verification gate. Set E2E_VERIFICATION_URL_TEMPLATE ' +
          '(with {email}) to let the harness supply the confirmation link, or disable ' +
          'the verification requirement on staging, to exercise the rest of this flow.'
      )

      await page.goto(template!.replace('{email}', encodeURIComponent(email)))
      await page.waitForURL(
        (url) => /\/dashboard|\/onboarding|\/academy/.test(url.pathname),
        { timeout: 45_000 }
      )
    }

    // ── 3. Reach the first lesson ─────────────────────────────────────────────
    await page.goto('/academy')
    await expect(page).not.toHaveURL(/\/login/)

    await page.goto('/lessons/lesson-001')
    await page.waitForLoadState('domcontentloaded')

    const startLesson = page
      .getByRole('link', { name: /start|begin|continue|open lesson/i })
      .first()
    if (await startLesson.isVisible().catch(() => false)) {
      await startLesson.click()
      await page.waitForLoadState('domcontentloaded')
    }

    // ── 4. Complete the theory section, which is what awards the first XP ─────
    const completeTheory = page
      .getByRole('button', { name: /mark as read|complete|continue|finish/i })
      .first()

    await expect(
      completeTheory,
      'the lesson must expose a completion control for XP to be earnable'
    ).toBeVisible({ timeout: 30_000 })
    await completeTheory.click()

    // ── 5. XP is awarded ──────────────────────────────────────────────────────
    // Asserted against the API rather than a toast: the toast is transient and its copy
    // is a design decision, while the XP total is the thing the flow exists to prove.
    await expect
      .poll(
        async () => {
          const response = await page.request.get('/api/xp')
          if (!response.ok()) return 0
          const body = await response.json().catch(() => null)
          const total =
            body?.totalXp ?? body?.total_xp ?? body?.xp?.total ?? body?.data?.totalXp ?? 0
          return Number(total) || 0
        },
        {
          message: 'XP should be greater than zero after completing the first lesson',
          timeout: 30_000,
        }
      )
      .toBeGreaterThan(0)
  })
})

test.describe('B14-C — signup surface without writes', () => {
  /**
   * Runs everywhere, creates nothing. These are the deterministic assertions about the
   * signup entry point that do not require an account, so a regression in the form or
   * the challenge is caught on every PR rather than only where write secrets exist.
   */
  test('the signup form renders its three fields and a challenge', async ({ page }) => {
    await page.goto('/signup')

    await expect(page.locator('#signup-name')).toBeVisible()
    await expect(page.locator('#signup-email')).toBeVisible()
    await expect(page.locator('#signup-password')).toBeVisible()

    // The challenge must be mounted — its absence would let signup abuse through, which
    // is the 2026-09 incident. Asserted on the app's own container rather than on
    // Cloudflare's iframe: the iframe only exists once challenges.cloudflare.com has
    // served its script, so asserting it would make this test fail whenever the CDN is
    // slow or unreachable. That is a network assertion wearing a correctness costume,
    // and B14-C asks for deterministic specs. The container is what this repository
    // controls and what a regression would remove.
    await expect(page.locator('.turnstile-container').first()).toBeAttached({
      timeout: 30_000,
    })
  })

  test('signup rejects a malformed email before it reaches the server', async ({ page }) => {
    await page.goto('/signup')

    const emailInput = page.locator('#signup-email')
    await emailInput.fill('not-an-email')
    await page.locator('#signup-password').fill('short')

    const isInvalid = await emailInput.evaluate((el: HTMLInputElement) => !el.checkValidity())
    expect(isInvalid).toBe(true)
  })

  test('the first lesson is publicly previewable without an account', async ({ page }) => {
    // The lesson the flow above completes must be reachable, or the flow is testing a
    // 404. Cheap to assert, and it fails loudly if the curriculum slug changes.
    await page.goto('/lessons/lesson-001')
    await expect(page).not.toHaveURL(/\/404|\/not-found/)
    await expect(page.locator('h1').first()).toBeVisible()
  })
})
