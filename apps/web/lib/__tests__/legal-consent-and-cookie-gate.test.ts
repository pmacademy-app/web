import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Phase 1 (P0) of the September 2026 Legal, Privacy & Education-Platform audit.
 *
 * The five findings this file pins are all "the published claim and the running
 * code disagree" failures, so the tests assert the mechanism rather than the copy
 * wherever a mechanism exists:
 *
 *   1. Signup cannot complete without Terms/Privacy acceptance and an 18+
 *      self-certification, and the acceptance is persisted with a version.
 *   2. Accounts created before consent capture are neither blocked nor backfilled.
 *   3. The Privacy Policy no longer claims certificates carry cryptographic hashes.
 *   4. No public page presents the brand name as a registered legal entity, and a
 *      grievance contact exists on both legal documents.
 *   5. GA4, GTM and `prodily_referrer` do not load or get set before consent.
 */

// ── Shared mocks (mirrors lib/__tests__/b5-abuse-controls.test.ts) ─────────────

const mockEvaluateRateLimit = vi.fn()
vi.mock('@/lib/rate-limit', () => ({
  evaluatePersistentRateLimit: (...args: unknown[]) => mockEvaluateRateLimit(...args),
  evaluateRateLimit: (...args: unknown[]) => mockEvaluateRateLimit(...args),
  evaluateInMemoryRateLimit: vi.fn(),
}))

const mockGetProductSettings = vi.fn()
vi.mock('@/lib/admin/settings-service', () => ({
  SettingsService: {
    isEmailVerificationRequired: () => mockGetProductSettings().then((s: { requireEmailVerification: boolean }) => s.requireEmailVerification),
    getProductSettings: () => mockGetProductSettings(),
  },
}))

const mockSupabase = {
  auth: {
    signUp: vi.fn(),
    signInWithPassword: vi.fn(),
    admin: { createUser: vi.fn() },
  },
}
vi.mock('@/lib/supabase', () => ({
  createServiceRoleClient: () => mockSupabase,
  createAuthenticatedServerClient: () => mockSupabase,
}))

const mockEnsureUserProfile = vi.fn()
vi.mock('@/lib/auth', () => ({
  ensureUserProfile: (...args: unknown[]) => mockEnsureUserProfile(...args),
}))

vi.mock('@/lib/notifications/automations/service', () => ({
  EmailAutomationsService: { getState: vi.fn().mockResolvedValue({ dailyLimit: 100 }) },
}))

vi.mock('@/lib/security/turnstile', () => ({
  verifyTurnstileToken: vi.fn().mockResolvedValue({ success: true }),
  evaluateSiteverifyBudget: vi.fn().mockResolvedValue({ success: true, resetInMs: 3_600_000 }),
}))

vi.mock('@/lib/referral/referral-service', () => ({
  createReferralAttribution: vi.fn().mockResolvedValue({ success: true }),
  isPlausibleReferralCode: (code: unknown) => typeof code === 'string' && code.length >= 3,
}))

import { POST as signupPOST } from '@/app/api/auth/signup/route'
import {
  MINIMUM_SIGNUP_AGE,
  PRIVACY_VERSION,
  TERMS_VERSION,
  buildConsentRecord,
  consentFromAuthMetadata,
} from '@/lib/legal/consent'
import {
  COOKIE_CONSENT_VERSION,
  buildCookieConsentRecord,
  hasDecidedCookieConsent,
  hasOptionalCookieConsent,
  parseCookieConsent,
  serializeCookieConsent,
} from '@/lib/legal/cookie-consent'
import { LEGAL_OPERATOR, isLegalOperatorConfigured, operatorDescription } from '@/lib/legal/legal-config'

const ROOT = path.resolve(import.meta.dirname, '../../')
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

const VALID_SIGNUP = {
  name: 'Jane Doe',
  email: 'jane@example.com',
  password: 'hunter2000',
  turnstileToken: 'tok',
  acceptedTerms: true,
  confirmedMinimumAge: true,
}

function signupRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('https://prodily.app/api/auth/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('P0-1/P0-2 — Terms/Privacy acceptance and the 18+ gate at signup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEvaluateRateLimit.mockResolvedValue({ success: true, remaining: 9, resetInMs: 60_000 })
    mockGetProductSettings.mockResolvedValue({ allowSignups: true, requireEmailVerification: true })
    mockSupabase.auth.signUp.mockResolvedValue({
      data: { user: { id: 'usr-1', identities: [{ id: 'i1' }] } },
      error: null,
    })
    mockEnsureUserProfile.mockResolvedValue({ id: 'usr-1' })
  })

  it('rejects a signup that omits the Terms/Privacy acknowledgement', async () => {
    const res = await signupPOST(signupRequest({ ...VALID_SIGNUP, acceptedTerms: undefined }))
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.code).toBe('VALIDATION')
    expect(mockSupabase.auth.signUp).not.toHaveBeenCalled()
  })

  it('rejects a signup that explicitly declines the Terms/Privacy acknowledgement', async () => {
    const res = await signupPOST(signupRequest({ ...VALID_SIGNUP, acceptedTerms: false }))

    expect(res.status).toBe(400)
    expect(mockSupabase.auth.signUp).not.toHaveBeenCalled()
  })

  it('rejects a signup that does not self-certify the minimum age', async () => {
    const res = await signupPOST(signupRequest({ ...VALID_SIGNUP, confirmedMinimumAge: false }))

    expect(res.status).toBe(400)
    expect(mockSupabase.auth.signUp).not.toHaveBeenCalled()
  })

  it('rejects before spending any rate-limit budget or reaching Supabase', async () => {
    // Validation runs in the wrapper, ahead of every abuse control, so a malformed
    // consent payload cannot be used to burn a victim's per-email budget.
    await signupPOST(signupRequest({ ...VALID_SIGNUP, acceptedTerms: false }))

    expect(mockEvaluateRateLimit).not.toHaveBeenCalled()
    expect(mockGetProductSettings).not.toHaveBeenCalled()
  })

  it('accepts a signup with both acknowledgements and records the consent in auth metadata (Flow A)', async () => {
    const res = await signupPOST(signupRequest(VALID_SIGNUP))
    expect(res.status).toBe(200)

    const metadata = mockSupabase.auth.signUp.mock.calls[0][0].options.data
    expect(metadata.terms_version).toBe(TERMS_VERSION)
    expect(metadata.privacy_version).toBe(PRIVACY_VERSION)
    expect(metadata.age_confirmed_minimum).toBe(MINIMUM_SIGNUP_AGE)
    expect(Date.parse(metadata.terms_accepted_at)).not.toBeNaN()
    expect(Date.parse(metadata.age_confirmed_at)).not.toBeNaN()
  })

  it('persists the consent onto the profile row when verification is off (Flow B)', async () => {
    mockGetProductSettings.mockResolvedValue({ allowSignups: true, requireEmailVerification: false })
    mockSupabase.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: 'usr-2', email: VALID_SIGNUP.email } },
      error: null,
    })
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: {
        user: { id: 'usr-2' },
        session: { access_token: 'a', refresh_token: 'r', expires_in: 3600 },
      },
      error: null,
    })

    await signupPOST(signupRequest(VALID_SIGNUP))

    const consent = mockEnsureUserProfile.mock.calls[0][2].consent
    expect(consent.terms_version).toBe(TERMS_VERSION)
    expect(consent.age_confirmed_minimum).toBe(MINIMUM_SIGNUP_AGE)
  })

  it('ignores a client-supplied document version — the server mints its own', async () => {
    await signupPOST(
      signupRequest({ ...VALID_SIGNUP, terms_version: '1999-01-01', terms_accepted_at: '1999-01-01T00:00:00.000Z' })
    )

    const metadata = mockSupabase.auth.signUp.mock.calls[0][0].options.data
    expect(metadata.terms_version).toBe(TERMS_VERSION)
    expect(metadata.terms_accepted_at).not.toBe('1999-01-01T00:00:00.000Z')
  })

  it('still carries the referral code alongside the consent', async () => {
    await signupPOST(signupRequest({ ...VALID_SIGNUP, refCode: 'ABC123' }))

    const metadata = mockSupabase.auth.signUp.mock.calls[0][0].options.data
    expect(metadata.pending_ref_code).toBe('ABC123')
    expect(metadata.terms_version).toBe(TERMS_VERSION)
  })

  it('states 18 as the minimum age, matching the audit recommendation', () => {
    expect(MINIMUM_SIGNUP_AGE).toBe(18)
  })
})

describe('P0-1 — consent records and existing users', () => {
  it('builds a record stamped with the current document versions', () => {
    const record = buildConsentRecord(new Date('2026-09-23T10:00:00.000Z'))

    expect(record).toEqual({
      terms_accepted_at: '2026-09-23T10:00:00.000Z',
      terms_version: TERMS_VERSION,
      privacy_version: PRIVACY_VERSION,
      age_confirmed_at: '2026-09-23T10:00:00.000Z',
      age_confirmed_minimum: MINIMUM_SIGNUP_AGE,
    })
  })

  it('recovers a Flow A consent from auth metadata', () => {
    const record = buildConsentRecord(new Date('2026-09-23T10:00:00.000Z'))
    expect(consentFromAuthMetadata({ full_name: 'Jane', ...record })).toEqual(record)
  })

  it('returns null for an account that predates consent capture, rather than inventing one', () => {
    // This is the "existing users are not retroactively blocked or backfilled"
    // guarantee: no metadata means the columns stay NULL, not a fabricated consent.
    expect(consentFromAuthMetadata(null)).toBeNull()
    expect(consentFromAuthMetadata({})).toBeNull()
    expect(consentFromAuthMetadata({ full_name: 'Legacy Learner' })).toBeNull()
  })

  it('ensureUserProfile writes no consent columns when there is nothing to record', async () => {
    // Imported lazily: this suite mocks '@/lib/auth' for the route tests above, so
    // the real implementation is read from source instead of executed.
    const src = read('lib/auth.ts')
    expect(src).toContain('consentFromAuthMetadata(user.user_metadata)')
    expect(src).toContain('...(consent ?? {})')
  })

  it('the migration adds nullable consent columns with no backfill', () => {
    const migration = readFileSync(
      path.join(ROOT, '../../supabase/migrations/20260923000001_signup_legal_consent.sql'),
      'utf8'
    )

    expect(migration).toContain('ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS terms_version text')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS privacy_version text')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS age_confirmed_at timestamptz')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS age_confirmed_minimum smallint')
    // No DEFAULT, no NOT NULL and no UPDATE: an existing row must not acquire a
    // consent it never gave. Checked per DDL line so prose in the header comment
    // cannot trip the assertion.
    const addColumnLines = migration.split('\n').filter((line) => /ADD COLUMN/i.test(line))
    expect(addColumnLines).toHaveLength(5)
    for (const line of addColumnLines) {
      expect(line).not.toMatch(/\bDEFAULT\b/i)
      expect(line).not.toMatch(/\bNOT NULL\b/i)
    }
    expect(migration).not.toMatch(/^\s*UPDATE\s+public\.users/im)
  })
})

describe('P0-2 — the signup form presents the acknowledgements', () => {
  const signupSrc = read('app/(auth)/signup/page.tsx')

  it('renders a required Terms/Privacy checkbox linking to both documents', () => {
    expect(signupSrc).toContain('id="signup-accept-terms"')
    expect(signupSrc).toContain('href="/terms"')
    expect(signupSrc).toContain('href="/privacy"')
  })

  it('renders an age self-certification checkbox', () => {
    expect(signupSrc).toContain('id="signup-confirm-age"')
    expect(signupSrc).toContain('MINIMUM_SIGNUP_AGE')
  })

  it('leaves both boxes unticked by default — a pre-ticked box is not consent', () => {
    expect(signupSrc).toContain('acceptedTerms: false as unknown as true')
    expect(signupSrc).toContain('confirmedMinimumAge: false as unknown as true')
  })
})

describe('P0-3 — the certificate verification claim matches the implementation', () => {
  const privacySrc = read('app/(marketing)/privacy/page.tsx')

  it('no longer claims certificates carry cryptographic verification hashes', () => {
    expect(privacySrc).not.toContain('cryptographic verification hashes')
  })

  it('describes the actual certificate-code lookup instead', () => {
    expect(privacySrc).toContain('certificate code')
    expect(privacySrc).toContain('certificate registry')
  })

  it('no credential hash was added to the schema just to make the old wording true', () => {
    const types = read('types/database.ts')
    expect(types).not.toContain('credential_hash')
  })
})

describe('P0-4 — legal operator identity and grievance contact', () => {
  const privacySrc = read('app/(marketing)/privacy/page.tsx')
  const termsSrc = read('app/(marketing)/terms/page.tsx')

  it('the brand no longer carries a legalEntity field', () => {
    expect(read('lib/brand.ts')).not.toMatch(/^\s*legalEntity:/m)
  })

  it('neither legal document presents the brand name as the operating entity', () => {
    expect(privacySrc).not.toContain('BRAND.legalEntity')
    expect(termsSrc).not.toContain('BRAND.legalEntity')
  })

  it('states plainly that no registered company operates the platform while none is configured', () => {
    // vitest does not load .env.local, so the statically imported config is the
    // unconfigured one. This is the fallback an unconfigured deployment gets.
    expect(LEGAL_OPERATOR.isRegisteredEntity).toBe(false)
    expect(LEGAL_OPERATOR.legalName).toBeNull()
    expect(operatorDescription('Prodily PM Academy')).toContain('not a registered company')
    expect(isLegalOperatorConfigured()).toBe(false)
  })

  it('invents no company name, registration number or address anywhere in the config', () => {
    const configSrc = read('lib/legal/legal-config.ts')
    // Every value must come from an env var or be null — no literal fallbacks.
    expect(configSrc).not.toMatch(/legalName:\s*'[^']/)
    expect(configSrc).not.toMatch(/proprietorName:\s*'[^']/)
    expect(configSrc).not.toMatch(/registrationId:\s*'[^']/)
    expect(configSrc).not.toMatch(/address:\s*'[^']/)
    expect(configSrc).not.toMatch(/officerName:\s*'[^']/)
  })
})

/**
 * The configured states. `legal-config.ts` reads `process.env` at module scope, so
 * each case stubs the environment and re-imports the module in isolation — which is
 * also what makes these tests independent of whatever is in the developer's
 * `.env.local`.
 */
describe('P0-4 — operator wording once real details are supplied', () => {
  async function loadConfigWith(env: Record<string, string>) {
    vi.resetModules()
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
    return import('@/lib/legal/legal-config')
  }

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  const SOLE_PROPRIETOR_ENV = {
    NEXT_PUBLIC_LEGAL_ENTITY_REGISTERED: 'false',
    NEXT_PUBLIC_LEGAL_ENTITY_NAME: 'Prodily',
    NEXT_PUBLIC_LEGAL_PROPRIETOR_NAME: 'Aditya Gangwani',
    NEXT_PUBLIC_LEGAL_ENTITY_TYPE: 'Sole Proprietor',
    NEXT_PUBLIC_LEGAL_REGISTRATION_ID: '',
    NEXT_PUBLIC_LEGAL_ADDRESS:
      'Cozystay Inspire, 6th Main Road, A.K. Colony Mathikere Extension, Bangalore, Karnataka 560054',
    NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME: 'Aditya Gangwani',
    NEXT_PUBLIC_GRIEVANCE_OFFICER_TITLE: 'Founder & Grievance Officer',
    NEXT_PUBLIC_GRIEVANCE_EMAIL: 'hello@prodily.adityagangwani.me',
  }

  it('names the proprietor and denies incorporation, in the agreed wording', async () => {
    const { operatorDescription: describe_ } = await loadConfigWith(SOLE_PROPRIETOR_ENV)

    expect(describe_('Prodily PM Academy')).toBe(
      'Prodily is operated by Aditya Gangwani as a sole proprietor. ' +
        'Prodily is not a separately incorporated company or registered entity.'
    )
  })

  it('never calls an unregistered proprietorship a company', async () => {
    const { operatorDescription: describe_ } = await loadConfigWith(SOLE_PROPRIETOR_ENV)
    const text = describe_('Prodily PM Academy')

    expect(text).toContain('not a separately incorporated company')
    // No corporate form is ever claimed. "incorporated" is excluded from this list
    // because the sentence above legitimately uses it to deny incorporation.
    expect(text).not.toMatch(/\b(Private Limited|Pvt\.? Ltd|LLP|Limited|Inc\.)\b/i)
  })

  it('leaves the registration id blank rather than inventing one', async () => {
    const { LEGAL_OPERATOR: operator } = await loadConfigWith(SOLE_PROPRIETOR_ENV)

    expect(operator.isRegisteredEntity).toBe(false)
    expect(operator.registrationId).toBeNull()
  })

  it('calls the address "operating", not "registered", while there is no registration', async () => {
    const unregistered = await loadConfigWith(SOLE_PROPRIETOR_ENV)
    expect(unregistered.operatorAddressLabel()).toBe('Operating address')

    const registered = await loadConfigWith({
      ...SOLE_PROPRIETOR_ENV,
      NEXT_PUBLIC_LEGAL_ENTITY_REGISTERED: 'true',
    })
    expect(registered.operatorAddressLabel()).toBe('Registered address')
  })

  it('every legal surface uses that label rather than hardcoding one', () => {
    for (const src of [
      read('app/(marketing)/terms/page.tsx'),
      read('app/(marketing)/privacy/page.tsx'),
      read('components/layout/footer.tsx'),
    ]) {
      expect(src).toContain('operatorAddressLabel()')
      expect(src).not.toContain('Registered address:')
    }
  })

  it('counts an unregistered proprietorship as fully configured — no registration id needed', async () => {
    const { isLegalOperatorConfigured: configured } = await loadConfigWith(SOLE_PROPRIETOR_ENV)
    expect(configured()).toBe(true)
  })

  it('carries the confirmed address and grievance officer through to the pages', async () => {
    const { LEGAL_OPERATOR: operator, GRIEVANCE_CONTACT: grievance } =
      await loadConfigWith(SOLE_PROPRIETOR_ENV)

    expect(operator.address).toContain('Bangalore, Karnataka 560054')
    expect(grievance.officerName).toBe('Aditya Gangwani')
    expect(grievance.officerTitle).toBe('Founder & Grievance Officer')
    expect(grievance.email).toBe('hello@prodily.adityagangwani.me')
  })

  it('still demands a registration id from an operator that claims to be registered', async () => {
    const { isLegalOperatorConfigured: configured } = await loadConfigWith({
      ...SOLE_PROPRIETOR_ENV,
      NEXT_PUBLIC_LEGAL_ENTITY_REGISTERED: 'true',
    })
    expect(configured()).toBe(false)
  })

  it('falls back to the honest unconfigured wording when the proprietor is not named', async () => {
    const { operatorDescription: describe_ } = await loadConfigWith({
      ...SOLE_PROPRIETOR_ENV,
      NEXT_PUBLIC_LEGAL_PROPRIETOR_NAME: '',
    })
    expect(describe_('Prodily PM Academy')).toContain('not a registered company')
  })

  it('the deployed env files carry the confirmed values', () => {
    // `.env.local` is gitignored, so only the tracked example is asserted here.
    const example = read('.env.example')

    expect(example).toContain('NEXT_PUBLIC_LEGAL_ENTITY_REGISTERED=false')
    expect(example).toContain('NEXT_PUBLIC_LEGAL_ENTITY_NAME=Prodily')
    expect(example).toContain('NEXT_PUBLIC_LEGAL_PROPRIETOR_NAME=Aditya Gangwani')
    expect(example).toContain('NEXT_PUBLIC_LEGAL_ENTITY_TYPE=Sole Proprietor')
    // Blank on purpose: there is no registration to cite.
    expect(example).toMatch(/^NEXT_PUBLIC_LEGAL_REGISTRATION_ID=\s*$/m)
    expect(example).toContain('NEXT_PUBLIC_GRIEVANCE_OFFICER_TITLE=Founder & Grievance Officer')
  })

  it('both legal documents carry a grievance section with a response-time commitment', () => {
    for (const src of [read('app/(marketing)/privacy/page.tsx'), read('app/(marketing)/terms/page.tsx')]) {
      expect(src).toContain('id="grievance"')
      expect(src).toContain('GRIEVANCE_CONTACT.acknowledgementDays')
      expect(src).toContain('GRIEVANCE_CONTACT.resolutionDays')
    }
  })

  it('the footer surfaces the operator statement and the grievance contact', () => {
    const footerSrc = read('components/layout/footer.tsx')
    expect(footerSrc).toContain('operatorDescription(BRAND.fullName)')
    expect(footerSrc).toContain('GRIEVANCE_CONTACT')
  })

  it('both documents flag that the wording is pending counsel review', () => {
    for (const src of [read('app/(marketing)/privacy/page.tsx'), read('app/(marketing)/terms/page.tsx')]) {
      expect(src).toContain('pending review by qualified counsel')
    }
  })
})

describe('P0-2 — no stale 13+ claim survives anywhere', () => {
  it('the public legal copy states the 18+ floor and never 13', () => {
    const termsSrc = read('app/(marketing)/terms/page.tsx')
    expect(termsSrc).not.toContain('at least 13 years')
    expect(termsSrc).toContain('MINIMUM_SIGNUP_AGE')
  })
})

describe('P0-5 — cookie consent state', () => {
  it('round-trips a decision', () => {
    const record = buildCookieConsentRecord('accepted', new Date('2026-09-23T00:00:00.000Z'))
    expect(parseCookieConsent(serializeCookieConsent(record))).toEqual(record)
  })

  it('treats a missing or unparsable cookie as no consent (fails closed)', () => {
    for (const raw of [null, undefined, '', 'garbage', 'maybe|2026-09-23|x', '|2026-09-23|x']) {
      expect(hasOptionalCookieConsent(raw)).toBe(false)
      expect(hasDecidedCookieConsent(raw)).toBe(false)
    }
  })

  it('reads a percent-encoded cookie value, which is how the browser stores it', () => {
    const raw = encodeURIComponent(serializeCookieConsent(buildCookieConsentRecord('accepted')))
    expect(raw).toContain('%7C')
    expect(hasOptionalCookieConsent(raw)).toBe(true)
  })

  it('a rejection is a decision, but not consent', () => {
    const raw = serializeCookieConsent(buildCookieConsentRecord('rejected'))
    expect(hasDecidedCookieConsent(raw)).toBe(true)
    expect(hasOptionalCookieConsent(raw)).toBe(false)
  })

  it('a decision made against an older banner version no longer counts', () => {
    const stale = `accepted|2020-01-01|2020-01-01T00:00:00.000Z`
    expect(hasOptionalCookieConsent(stale)).toBe(false)
    expect(hasDecidedCookieConsent(stale)).toBe(false)
    expect(hasOptionalCookieConsent(`accepted|${COOKIE_CONSENT_VERSION}|now`)).toBe(true)
  })
})

describe('P0-5 — GA4 and GTM do not load before consent', () => {
  const layoutSrc = read('app/layout.tsx')
  const gateSrc = read('components/legal/ConsentGatedAnalytics.tsx')

  it('the root layout no longer renders either tracker directly', () => {
    expect(layoutSrc).not.toContain('<GoogleAnalytics')
    expect(layoutSrc).not.toContain('googletagmanager.com')
    expect(layoutSrc).toContain('<ConsentGatedAnalytics')
  })

  it('the gate returns nothing at all until consent exists, rather than loading and suppressing', () => {
    expect(gateSrc).toContain('if (!hasAccepted) return null')
  })

  it('the gate still loads both trackers once consent exists, so analytics is not broken', () => {
    expect(gateSrc).toContain('<GoogleAnalytics gaId={gaId} />')
    expect(gateSrc).toContain('googletagmanager.com/gtm.js')
  })

  it('the banner offers an equally-reachable accept and reject, and the choice persists', () => {
    const bannerSrc = read('components/legal/CookieConsentBanner.tsx')
    expect(bannerSrc).toContain('Accept optional')
    expect(bannerSrc).toContain('Reject optional')

    const hookSrc = read('hooks/use-cookie-consent.ts')
    expect(hookSrc).toContain('COOKIE_CONSENT_MAX_AGE_SECONDS')
    expect(hookSrc).toContain('SameSite=Lax')
  })

  it('withdrawing consent clears the GA cookies a previous acceptance created', () => {
    const hookSrc = read('hooks/use-cookie-consent.ts')
    expect(hookSrc).toContain('clearAnalyticsCookies')
    expect(hookSrc).toContain('/^_ga/')
    // A GA runtime already injected into this document keeps running until the
    // page is replaced, so a withdrawal has to reload.
    expect(hookSrc).toContain('window.location.reload()')
  })

  it('a visitor can reopen the banner to change their mind later', () => {
    expect(read('components/legal/CookiePreferencesButton.tsx')).toContain('openCookiePreferences')
    expect(read('components/layout/footer.tsx')).toContain('CookiePreferencesButton')
  })
})
