import { describe, it, expect, vi, afterEach } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  GOOGLE_START_PATH,
  buildGoogleStartHref,
  isGoogleAuthEnabled,
} from '@/lib/auth/google-auth'
import { GoogleButton } from '@/components/auth/GoogleButton'

const ROOT = path.resolve(__dirname, '../..')
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

describe('isGoogleAuthEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is on only for the exact string "true"', () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_AUTH_ENABLED', 'true')
    expect(isGoogleAuthEnabled()).toBe(true)
  })

  it.each(['', 'false', 'TRUE', 'True', '1', 'yes', ' true'])('is off for %j', (value) => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_AUTH_ENABLED', value)
    expect(isGoogleAuthEnabled()).toBe(false)
  })

  it('is off when unset', () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_AUTH_ENABLED', undefined as unknown as string)
    expect(isGoogleAuthEnabled()).toBe(false)
  })

  it('reads the flag with a literal access so Next can inline it', () => {
    expect(read('lib/auth/google-auth.ts')).toContain(
      "process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === 'true'"
    )
  })
})

describe('buildGoogleStartHref', () => {
  it('points at the start route', () => {
    expect(GOOGLE_START_PATH).toBe('/api/auth/google')
    expect(buildGoogleStartHref({})).toBe('/api/auth/google')
  })

  it('adds terms and age only when consent is given', () => {
    expect(buildGoogleStartHref({ consent: true })).toBe('/api/auth/google?terms=1&age=1')
    expect(buildGoogleStartHref({ consent: false })).toBe('/api/auth/google')
  })

  it('adds ref and next only when present', () => {
    expect(buildGoogleStartHref({ consent: true, ref: 'ABC123', next: '/learn' })).toBe(
      '/api/auth/google?terms=1&age=1&ref=ABC123&next=%2Flearn'
    )
    expect(buildGoogleStartHref({ ref: null, next: null })).toBe('/api/auth/google')
    expect(buildGoogleStartHref({ ref: '', next: '   ' })).toBe('/api/auth/google')
  })

  it('URL-encodes values so they cannot inject extra parameters', () => {
    const href = buildGoogleStartHref({ ref: 'a&terms=1', next: '/x?y=1#z' })
    const url = new URL(href, 'https://prodily.app')
    expect(url.pathname).toBe('/api/auth/google')
    expect(url.searchParams.get('terms')).toBeNull()
    expect(url.searchParams.get('ref')).toBe('a&terms=1')
    expect(url.searchParams.get('next')).toBe('/x?y=1#z')
  })
})

describe('GoogleButton', () => {
  const src = read('components/auth/GoogleButton.tsx')

  it('is an anchor, never a raw button, with the branded label', () => {
    expect(src).not.toContain('<button')
    expect(src).toContain('<a')
    expect(src).toContain('Continue with Google')
    expect(src).toContain('aria-disabled')
  })

  it('renders the official multicolour G', () => {
    for (const colour of ['#EA4335', '#4285F4', '#FBBC05', '#34A853']) {
      expect(src).toContain(colour)
    }
  })

  it('enabled: navigates to the href', () => {
    const html = renderToStaticMarkup(createElement(GoogleButton, { href: '/api/auth/google?terms=1&age=1' }))
    expect(html).toContain('href="/api/auth/google?terms=1&amp;age=1"')
    expect(html).not.toContain('aria-disabled')
    expect(html).toContain('Continue with Google')
  })

  it('disabled: no href, announced as disabled, still focusable and described', () => {
    const html = renderToStaticMarkup(
      createElement(GoogleButton, {
        href: '/api/auth/google',
        disabled: true,
        'aria-describedby': 'google-consent-hint',
      })
    )
    expect(html).not.toContain('href=')
    expect(html).toContain('aria-disabled="true"')
    expect(html).toContain('role="link"')
    // Keyboard and screen-reader users can still reach it and hear why it is unavailable.
    expect(html).toContain('tabindex="0"')
    expect(html).not.toContain('tabindex="-1"')
    expect(html).toContain('aria-describedby="google-consent-hint"')
    expect(html).toContain('Continue with Google')
  })

  it('never dims or alters the G logo, even when disabled (Google branding)', () => {
    const html = renderToStaticMarkup(
      createElement(GoogleButton, { href: '/api/auth/google', disabled: true })
    )
    const svg = html.match(/<svg[^>]*>/)?.[0] ?? ''
    expect(svg).not.toBe('')
    expect(svg).not.toContain('opacity')
  })
})

describe('auth pages wire Google sign-in behind the flag', () => {
  const signupSrc = read('app/(auth)/signup/SignupForm.tsx')
  const loginSrc = read('app/(auth)/login/LoginForm.tsx')

  it('signup gates the button on both consent fields', () => {
    expect(signupSrc).toContain('isGoogleAuthEnabled()')
    expect(signupSrc).toMatch(/useWatch\(\{\s*control,\s*name: \['acceptedTerms', 'confirmedMinimumAge'\]/)
    expect(signupSrc).toMatch(/googleConsentGiven\s*=\s*acceptedTermsValue === true && confirmedAgeValue === true/)
    expect(signupSrc).toContain('disabled={!googleConsentGiven || isLoading}')
    expect(signupSrc).toContain("aria-describedby={googleConsentGiven ? undefined : 'google-consent-hint'}")
    expect(signupSrc).toContain('id="google-consent-hint"')
    expect(signupSrc).toContain('consent: true')
    expect(signupSrc).toContain('ref: refCode')
  })

  it('signup keeps Turnstile on the email path only', () => {
    expect(signupSrc).toContain('<TurnstileWidget')
    const formStart = signupSrc.indexOf('<form onSubmit={onFormSubmit}')
    expect(formStart).toBeGreaterThan(-1)
    // Match the JSX element, not the `import { TurnstileWidget` line.
    const widgetAt = signupSrc.search(/<TurnstileWidget\s/)
    expect(widgetAt).toBeGreaterThan(formStart)
  })

  it('login shows the button and the new-user notice behind the flag', () => {
    expect(loginSrc).toContain('isGoogleAuthEnabled()')
    expect(loginSrc).toContain('<GoogleButton')
    expect(loginSrc).toContain('New here? You&apos;ll confirm our Terms and age on the next step.')
  })

  it.each([
    'oauth_cancelled',
    'oauth_failed',
    'oauth_rate_limited',
    'oauth_unavailable',
    'signups_closed',
    'signup_limited',
    'consent_declined',
  ])('login maps ?error=%s to copy', (code) => {
    expect(loginSrc).toContain(`${code}:`)
  })

  it('auth page copy has no em-dashes', () => {
    for (const rel of [
      'app/(auth)/login/page.tsx',
      'app/(auth)/login/LoginForm.tsx',
      'app/(auth)/signup/page.tsx',
      'app/(auth)/signup/SignupForm.tsx',
      'components/auth/GoogleButton.tsx',
      'components/auth/LegalConsentFields.tsx',
      'lib/auth/google-auth.ts',
    ]) {
      expect(read(rel)).not.toContain('—')
    }
  })

  it('admin login does not offer Google sign-in', () => {
    const adminLoginSrc = read('app/admin/login/page.tsx')
    expect(adminLoginSrc).not.toContain('GoogleButton')
    expect(adminLoginSrc).not.toContain('google-auth')
  })
})
