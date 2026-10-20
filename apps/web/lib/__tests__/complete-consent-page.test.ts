/**
 * Google OAuth T5: the consent gate page, the "Managed by Google" settings state,
 * and the configuration/docs that ship the feature switched off.
 */
import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import path from 'node:path'

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('next=/learn'),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/signup/complete-consent',
}))

const APP_ROOT = path.resolve(__dirname, '../..')
const REPO_ROOT = path.resolve(APP_ROOT, '../..')
const read = (rel: string) => readFileSync(path.join(APP_ROOT, rel), 'utf8')
const readRepo = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), 'utf8')

const GATE_PAGE = 'app/(auth)/signup/complete-consent/page.tsx'
const SETTINGS_TAB = 'components/settings/SecuritySettingsTab.tsx'
const PRIVACY_PAGE = 'app/(marketing)/privacy/page.tsx'

describe('consent gate page source', () => {
  const src = read(GATE_PAGE)

  it('is a client page wrapped in Suspense (useSearchParams)', () => {
    expect(src.startsWith("'use client'")).toBe(true)
    expect(src).toContain('<Suspense')
    expect(src).toContain('useSearchParams')
  })

  it('reuses the shared consent fields instead of copying them', () => {
    expect(src).toContain("from '@/components/auth/LegalConsentFields'")
    expect(src).toContain('<LegalConsentFields')
    expect(src).not.toContain('id="signup-accept-terms"')
  })

  it('posts the decision and next to the complete-consent route', () => {
    expect(src).toContain("'/api/auth/complete-consent'")
    expect(src).toContain('apiPost')
    expect(src).toMatch(/decision,\s*\n?\s*\.\.\.\(next \? \{ next \} : \{\}\)/)
  })

  it('never sends a consent timestamp or version from the client', () => {
    expect(src).not.toMatch(/terms_accepted_at|terms_version|privacy_version|age_confirmed_at/)
    expect(src).not.toContain('buildConsentRecord')
  })

  it('uses the shared Button, never a raw <button>', () => {
    expect(src).not.toMatch(/<button[\s>]/)
    expect(src).toContain("from '@/components/ui/button'")
  })

  it('offers the decline path with the agreed label', () => {
    expect(src).toContain('Cancel and delete my new account')
    expect(src).toContain("submit('decline')")
  })

  it('always offers a log out escape hatch through the shared helper', () => {
    expect(src).toContain("from '@/lib/auth/logout'")
    expect(src).toContain('logout(router, { redirectTo: LEARNER_LOGIN_PATH })')
  })

  it('only follows same-origin redirects', () => {
    expect(src).toContain("target.startsWith('//')")
    expect(src).toContain("target.startsWith('/')")
  })
})

describe('consent gate page render', () => {
  it('starts with both boxes unticked and the accept action disabled', async () => {
    const { default: CompleteConsentPage } = await import('@/app/(auth)/signup/complete-consent/page')
    const html = renderToStaticMarkup(createElement(CompleteConsentPage))

    expect(html).toContain('id="signup-accept-terms"')
    expect(html).toContain('id="signup-confirm-age"')
    expect(html).not.toMatch(/id="signup-accept-terms"[^>]*checked=""/)
    expect(html).not.toMatch(/id="signup-confirm-age"[^>]*checked=""/)

    const accept = html.match(/<button[^>]*>(?:(?!<\/button>)[\s\S])*Agree and Continue/)?.[0] ?? ''
    expect(accept).not.toBe('')
    expect(accept).toMatch(/\sdisabled=""/)
    expect(html).toContain('Cancel and delete my new account')
  })
})

describe('Security settings: Google-only accounts', () => {
  const src = read(SETTINGS_TAB)

  it('treats only an explicit hasPassword === false as Google-managed', () => {
    expect(src).toContain('hasPassword === false')
  })

  it('shows a "Managed by Google" notice with a route to set a password', () => {
    expect(src).toContain('Managed by Google')
    // A plain link would bounce a signed-in user to /dashboard, so it logs out first.
    expect(src).toContain("RESET_PASSWORD_PATH = '/reset-password'")
    expect(src).toContain('logout(router, { redirectTo: RESET_PASSWORD_PATH })')
    expect(src).not.toContain('href="/reset-password"')
  })

  it('reacts to the PASSWORD_NOT_SET refusal and keeps the forms', () => {
    expect(src).toContain("'PASSWORD_NOT_SET'")
    expect(src).toContain('Update Password')
    expect(src).toContain('Send Confirmation Link')
  })
})

describe('configuration ships the feature switched off', () => {
  it('.env.example carries the flag (false) and the server-only secret', () => {
    const example = read('.env.example')
    expect(example).toMatch(/^NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=false\s*$/m)
    expect(example).toMatch(/^OAUTH_STATE_SECRET=\s*$/m)
    expect(example).not.toMatch(/NEXT_PUBLIC_OAUTH_STATE_SECRET/)
  })

  it('local Supabase has a disabled Google provider fed from env vars', () => {
    const toml = readRepo('supabase/config.toml')
    const block = toml.split('[auth.external.google]')[1]?.split(/\n\[/)[0] ?? ''
    expect(block).not.toBe('')
    expect(block).toMatch(/^enabled = false\s*$/m)
    expect(block).toContain('env(GOOGLE_CLIENT_ID)')
    expect(block).toContain('env(GOOGLE_CLIENT_SECRET)')
    expect(toml).toContain('/api/auth/callback**')
  })

  it('the deployment guide covers build-time inlining, the secret, the wildcard and the rollout', () => {
    const doc = readRepo('docs/DEPLOYMENT.md')
    expect(doc).toContain('NEXT_PUBLIC_GOOGLE_AUTH_ENABLED')
    expect(doc).toMatch(/inlines it at build time/)
    expect(doc).toMatch(/redeploy/i)
    expect(doc).toContain('OAUTH_STATE_SECRET')
    expect(doc).toMatch(/32 random characters/)
    expect(doc).toContain('/api/auth/callback**')
    expect(doc).toContain('Merge with the flag OFF')
    expect(doc.indexOf('Preview first')).toBeLessThan(doc.indexOf('Then Production'))
  })
})

describe('privacy policy names Google sign-in', () => {
  const src = read(PRIVACY_PAGE)

  it('lists what Google shares: email, name and avatar', () => {
    expect(src).toContain('Sign in with Google')
    expect(src).toMatch(/email address, your name, and your profile picture \(avatar\)/)
  })
})

describe('no em-dashes in the copy this task added', () => {
  it.each([GATE_PAGE])('%s has none', (rel) => {
    expect(read(rel)).not.toContain('—')
  })

  it('the Google-related additions in edited files have none', () => {
    const privacy = read(PRIVACY_PAGE)
    const googleLines = privacy.split('\n').filter((l) => /Google (LLC|sign-in)|Sign in with Google/.test(l))
    expect(googleLines.length).toBeGreaterThan(0)
    for (const line of googleLines) expect(line).not.toContain('—')

    const settings = read(SETTINGS_TAB)
    const notice = settings.slice(settings.indexOf('function ManagedByGoogleNotice'), settings.indexOf('function ChangeEmailCard'))
    expect(notice).not.toBe('')
    expect(notice).not.toContain('—')

    const deploy = readRepo('docs/DEPLOYMENT.md')
    expect(deploy.slice(deploy.indexOf('## 5. Google sign-in'))).not.toContain('—')
    const security = readRepo('docs/SECURITY.md')
    expect(security.slice(security.indexOf('## 3b.'), security.indexOf('## 4. Secret Safety'))).not.toContain('—')
    const auth = readRepo('docs/AUTHENTICATION.md')
    expect(auth.slice(auth.indexOf('### D. Google Sign-In'), auth.indexOf('## 3. Platform Settings'))).not.toContain('—')
  })
})
