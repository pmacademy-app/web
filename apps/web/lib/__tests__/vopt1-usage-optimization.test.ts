/**
 * V-OPT-1 — Vercel usage reductions.
 *
 * These assertions exist to stop the optimizations being silently undone. Each one
 * guards a property that is invisible at runtime in tests but expensive in
 * production: which paths enter the session proxy, and whether the most CPU-heavy
 * route in the app is cacheable.
 *
 * The matcher test is deliberately behavioural rather than a string comparison — it
 * evaluates the real regex against real paths, so a future edit that widens or
 * narrows it incorrectly fails here rather than in the usage dashboard.
 */
import { describe, it, expect } from 'vitest'
import { config as proxyConfig } from '../../proxy'

/** Applies the deployed matcher exactly as Next.js does: full-path regex match. */
function entersProxy(pathname: string): boolean {
  return proxyConfig.matcher.some((pattern) => new RegExp(`^${pattern}$`).test(pathname))
}

describe('V-OPT-1: session proxy matcher', () => {
  // Every path here authenticates itself and reads nothing from the session, so
  // entering the proxy only ever cost an extra function invocation.
  it.each([
    ['/api/cron/process-email-queue', 'CRON_SECRET bearer, else requireAdminUser(request)'],
    ['/api/cron/retry-failed', 'CRON_SECRET bearer, else requireAdminUser(request)'],
    ['/api/cron/cleanup', 'CRON_SECRET bearer, else requireAdminUser(request)'],
    ['/api/cron/daily-reminder', 'CRON_SECRET bearer, else requireAdminUser(request)'],
    ['/api/cron/weekly-recap', 'CRON_SECRET bearer, else requireAdminUser(request)'],
    ['/api/cron/process-broadcasts', 'CRON_SECRET bearer, else requireAdminUser(request)'],
    ['/api/health', 'no auth; liveness probe'],
    ['/api/og/portfolio/someone', 'public by design; privacy enforced in handler'],
    ['/api/email/webhooks', 'Svix / Brevo signature auth'],
    ['/api/email/unsubscribe', 'one-time unsubscribe_token'],
  ])('excludes %s (%s)', (path) => {
    expect(entersProxy(path)).toBe(false)
  })

  // B3: anything that depends on the verified session must still enter.
  it.each([
    '/api/settings/profile',
    '/api/settings/portfolio',
    '/api/progress',
    '/api/notifications',
    '/api/admin/users',
    '/api/admin/emails/queue',
    '/api/auth/login',
    '/api/auth/signup',
    '/api/auth/logout',
    '/api/auth/session',
    '/api/auth/refresh',
    '/api/contact',
  ])('still routes %s through the proxy', (path) => {
    expect(entersProxy(path)).toBe(true)
  })

  it.each(['/dashboard', '/settings', '/academy', '/admin', '/admin/users', '/leaderboard', '/onboarding', '/progress'])(
    'still routes protected page %s through the proxy',
    (path) => {
      expect(entersProxy(path)).toBe(true)
    }
  )

  it.each(['/', '/login', '/signup', '/reset-password', '/p/someone', '/verify/abc', '/curriculum'])(
    'still routes public page %s through the proxy (redirects and referral cookies depend on it)',
    (path) => {
      expect(entersProxy(path)).toBe(true)
    }
  )

  it('still excludes static assets and build output', () => {
    for (const p of ['/_next/static/chunk.js', '/_next/image', '/favicon.ico', '/robots.txt', '/sitemap.xml', '/logo.svg']) {
      expect(entersProxy(p)).toBe(false)
    }
  })

  it('does not exclude a hypothetical session-backed route under /api/email', () => {
    // The two email routes are excluded individually, never as a namespace, so a
    // future session-backed route cannot inherit an exclusion by accident.
    expect(entersProxy('/api/email/preferences')).toBe(true)
  })
})

describe('V-OPT-1: route caching configuration', () => {
  it('OG portfolio route is cacheable, not force-dynamic', async () => {
    const mod = await import('../../app/api/og/portfolio/[username]/route')
    // force-static (not merely dropping force-dynamic): the handler declares the
    // Request argument to reach the params context, which Next treats as dynamic.
    expect((mod as { dynamic?: string }).dynamic).toBe('force-static')
    expect((mod as { revalidate?: number }).revalidate).toBe(3600)
  })

  it('testimonials data cache does not pin /reviews below its page revalidate', async () => {
    // Next takes the minimum of a page's revalidate and any nested cache it awaits,
    // so this must not drop back below the /reviews page value.
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../admin/feedback-service.ts', import.meta.url), 'utf-8')
    )
    const match = src.match(/\['published-testimonials-v1'\],[\s\S]*?\{ revalidate: (\d+), tags: \['testimonials'\] \}/)
    expect(match).not.toBeNull()
    expect(Number(match![1])).toBeGreaterThanOrEqual(1800)
  })

  it('landing page revalidates hourly (it renders no data)', async () => {
    const mod = await import('../../app/(marketing)/page')
    expect((mod as { revalidate?: number }).revalidate).toBe(3600)
  })

  it('reviews page revalidates half-hourly (it does render data)', async () => {
    const mod = await import('../../app/(marketing)/reviews/page')
    expect((mod as { revalidate?: number }).revalidate).toBe(1800)
  })
})
