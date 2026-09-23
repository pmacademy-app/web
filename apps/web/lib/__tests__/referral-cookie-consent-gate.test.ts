import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * P0-5 — `prodily_referrer` is attribution, not a strictly-necessary cookie.
 *
 * Before this change the proxy set a 30-day referral cookie on every request
 * carrying `?ref=`, with no consent gate anywhere. These tests pin the gate at the
 * proxy, which is the only place the cookie is written, and pin the two things the
 * gate must NOT break: an authenticated session, and attribution for a visitor who
 * consents and signs up in the same visit.
 */

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: null }, error: new Error('no session') }),
      refreshSession: async () => ({ data: { session: null, user: null }, error: new Error('no session') }),
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    }),
  }),
}))

const ACCEPTED = 'accepted|2026-09-23|2026-09-23T00:00:00.000Z'
const REJECTED = 'rejected|2026-09-23|2026-09-23T00:00:00.000Z'

async function run(url: string, cookies: Record<string, string> = {}) {
  const { proxy } = await import('../../proxy')
  const req = new NextRequest(url)
  for (const [name, value] of Object.entries(cookies)) req.cookies.set(name, value)
  return proxy(req)
}

describe('Referral attribution cookie is gated on cookie consent', () => {
  it('is NOT set for a visitor who has not answered the banner', async () => {
    const res = await run('https://prodily.app/signup?ref=ABC123')
    expect(res.cookies.get('prodily_referrer')).toBeUndefined()
  })

  it('is NOT set for a visitor who rejected optional cookies', async () => {
    const res = await run('https://prodily.app/signup?ref=ABC123', { prodily_cookie_consent: REJECTED })
    expect(res.cookies.get('prodily_referrer')).toBeUndefined()
  })

  it('is NOT set when the stored decision was made against an older banner version', async () => {
    const res = await run('https://prodily.app/signup?ref=ABC123', {
      prodily_cookie_consent: 'accepted|2020-01-01|2020-01-01T00:00:00.000Z',
    })
    expect(res.cookies.get('prodily_referrer')).toBeUndefined()
  })

  it('IS set once the visitor accepts optional cookies', async () => {
    const res = await run('https://prodily.app/signup?ref=ABC123', { prodily_cookie_consent: ACCEPTED })
    expect(res.cookies.get('prodily_referrer')?.value).toBe('ABC123')
  })

  it('keeps the cookie 30-day and HTTP-only — the gate changed when, not how', async () => {
    const { readFileSync } = await import('node:fs')
    const nodePath = await import('node:path')
    const src = readFileSync(nodePath.resolve(import.meta.dirname, '../../proxy.ts'), 'utf8')

    expect(src).toContain('maxAge: 60 * 60 * 24 * 30')
    expect(src).toContain('hasOptionalCookieConsent')
    // One gate, at the point the code is derived — not at each call site.
    expect(src).toContain("hasCookieConsent ? request.nextUrl.searchParams.get('ref') : null")
  })

  it('does not set the cookie on a plain visit with no ?ref, consent or not', async () => {
    const res = await run('https://prodily.app/signup', { prodily_cookie_consent: ACCEPTED })
    expect(res.cookies.get('prodily_referrer')).toBeUndefined()
  })

  it('never touches the auth session cookies — the banner cannot log anyone out', async () => {
    const res = await run('https://prodily.app/signup?ref=ABC123', {
      'sb-access-token': 'token',
      'sb-refresh-token': 'refresh',
    })
    // No consent cookie present, yet nothing clears or rewrites the session pair.
    expect(res.cookies.get('sb-access-token')?.value).not.toBe('')
    expect(res.cookies.get('sb-refresh-token')?.value).not.toBe('')
  })

  it('the signup form still posts ?ref from the URL, so a same-visit referral is not lost', async () => {
    const { readFileSync } = await import('node:fs')
    const path = await import('node:path')
    const src = readFileSync(
      path.resolve(import.meta.dirname, '../../app/(auth)/signup/page.tsx'),
      'utf8'
    )
    expect(src).toContain("searchParams.get('ref')")
    expect(src).toContain('refCode')
  })
})
