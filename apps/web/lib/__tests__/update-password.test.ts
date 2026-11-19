/**
 * Password recovery: the signed recovery marker (H1) and the callback's recovery branch.
 *
 * The old `/api/auth/update-password` route was removed: nothing called it (the reset page
 * uses `updatePasswordAction`), and its `updateUser` call on a session-less client could not
 * succeed (L7). The action itself is covered in `update-password-action.test.ts`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
  ensureUserProfile: vi.fn(),
}))

vi.mock('@supabase/supabase-js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@supabase/supabase-js')>()
  return { ...actual, createClient: () => ({ auth: { verifyOtp: h.verifyOtp } }) }
})

vi.mock('@/lib/supabase', () => ({
  createServiceRoleClient: () => ({ auth: { verifyOtp: h.verifyOtp, admin: {} }, from: () => ({}) }),
}))

vi.mock('@/lib/auth', () => ({ ensureUserProfile: h.ensureUserProfile }))
vi.mock('@/lib/referral/referral-service', () => ({
  applyPendingReferral: vi.fn(),
  createReferralAttribution: vi.fn(),
  isPlausibleReferralCode: () => false,
}))

import { GET } from '../../app/api/auth/callback/route'
import {
  RECOVERY_MARKER_COOKIE,
  RECOVERY_MARKER_MAX_AGE_SECONDS,
  recoveryMarkerCookieOptions,
  signRecoveryMarker,
  verifyRecoveryMarker,
} from '@/lib/auth/recovery-marker'
import { signOAuthIntent } from '@/lib/auth/oauth-intent'

const SECRET = 'test-oauth-state-secret-at-least-32-chars-long'

describe('recovery marker', () => {
  beforeEach(() => {
    vi.stubEnv('OAUTH_STATE_SECRET', SECRET)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('round-trips the user id', () => {
    const token = signRecoveryMarker('user-1')!
    expect(verifyRecoveryMarker(token)).toBe('user-1')
  })

  it('expires after ten minutes', () => {
    const now = Date.now()
    const token = signRecoveryMarker('user-1', now)!
    expect(verifyRecoveryMarker(token, now + (RECOVERY_MARKER_MAX_AGE_SECONDS - 1) * 1000)).toBe('user-1')
    expect(verifyRecoveryMarker(token, now + (RECOVERY_MARKER_MAX_AGE_SECONDS + 1) * 1000)).toBeNull()
  })

  it('rejects tampering, junk and a marker signed under another secret', () => {
    const token = signRecoveryMarker('user-1')!
    const [payload, sig] = token.split('.')
    const forgedPayload = Buffer.from(JSON.stringify({ uid: 'admin', iat: Date.now(), n: 'x' })).toString('base64url')
    expect(verifyRecoveryMarker(`${forgedPayload}.${sig}`)).toBeNull()
    expect(verifyRecoveryMarker(`${payload}.${sig}x`)).toBeNull()
    expect(verifyRecoveryMarker('not-a-token')).toBeNull()
    expect(verifyRecoveryMarker(undefined)).toBeNull()

    vi.stubEnv('OAUTH_STATE_SECRET', 'a-completely-different-secret-of-32-chars')
    expect(verifyRecoveryMarker(token)).toBeNull()
  })

  it('is domain-separated from the OAuth intent signed with the same secret', () => {
    const intent = signOAuthIntent({ terms: true, age: true, ref: null, next: '/x', iat: Date.now() }, SECRET)
    expect(verifyRecoveryMarker(intent)).toBeNull()
  })

  it('falls back to a key derived from the service role key when no OAuth secret exists', () => {
    vi.stubEnv('OAUTH_STATE_SECRET', '')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key-that-is-long-enough-to-use')
    const token = signRecoveryMarker('user-2')
    expect(token).not.toBeNull()
    expect(verifyRecoveryMarker(token)).toBe('user-2')
  })

  it('refuses to sign without any secret', () => {
    vi.stubEnv('OAUTH_STATE_SECRET', '')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    expect(signRecoveryMarker('user-1')).toBeNull()
  })

  it('cookie is httpOnly, SameSite=Strict, scoped to the reset page and short-lived', () => {
    expect(recoveryMarkerCookieOptions()).toMatchObject({
      httpOnly: true,
      sameSite: 'strict',
      path: '/reset-password',
      maxAge: 600,
    })
  })
})

describe('auth/callback recovery branch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('OAUTH_STATE_SECRET', SECRET)
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://mock.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const recoveryUrl = 'https://prodily.app/api/auth/callback?token_hash=th&type=recovery&next=/dashboard'
  const session = { access_token: 'at', refresh_token: 'rt', expires_in: 3600 }

  it('sets the session and a marker bound to the user, and lands on the reset form', async () => {
    h.verifyOtp.mockResolvedValue({ data: { user: { id: 'user-9' }, session }, error: null })

    const res = await GET(new NextRequest(recoveryUrl))
    const location = new URL(res.headers.get('location') || '')

    expect(location.pathname).toBe('/reset-password')
    expect(location.searchParams.get('mode')).toBe('update')
    expect(res.cookies.get('sb-access-token')?.value).toBe('at')
    const marker = res.cookies.get(RECOVERY_MARKER_COOKIE)?.value
    expect(verifyRecoveryMarker(marker)).toBe('user-9')
    expect(h.ensureUserProfile).not.toHaveBeenCalled()
  })

  it('without a signing secret, hands out no session and asks for a new link', async () => {
    vi.stubEnv('OAUTH_STATE_SECRET', '')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    h.verifyOtp.mockResolvedValue({ data: { user: { id: 'user-9' }, session }, error: null })

    const res = await GET(new NextRequest(recoveryUrl))

    expect(res.headers.get('location')).toContain('/reset-password?error=expired')
    expect(res.cookies.get('sb-access-token')).toBeUndefined()
    expect(res.cookies.get(RECOVERY_MARKER_COOKIE)).toBeUndefined()
  })

  it('a rejected token sets no marker', async () => {
    h.verifyOtp.mockResolvedValue({ data: { user: null, session: null }, error: { message: 'expired' } })
    const res = await GET(new NextRequest(recoveryUrl))
    expect(res.headers.get('location')).toContain('/reset-password?error=expired')
    expect(res.cookies.get(RECOVERY_MARKER_COOKIE)).toBeUndefined()
  })

  it('a non-recovery verification never sets the marker', async () => {
    h.verifyOtp.mockResolvedValue({ data: { user: { id: 'user-9', email: 'a@b.c' }, session }, error: null })
    const res = await GET(new NextRequest('https://prodily.app/api/auth/callback?token_hash=th&type=magiclink'))
    expect(res.cookies.get(RECOVERY_MARKER_COOKIE)).toBeUndefined()
  })
})
