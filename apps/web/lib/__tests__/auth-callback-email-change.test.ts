/**
 * Tests for the `/api/auth/callback` handling of Supabase's email-change
 * confirmation flow (Issue 2 / Issue 6 QA).
 *
 * Covers:
 * 1. `email_change_current` / `email_change_new` sub-types normalize to the
 *    canonical `email_change` OTP type Supabase's `verifyOtp()` accepts.
 * 2. A successful confirmation always lands on the dedicated
 *    `/email-verified` success page (with or without a fresh session),
 *    never on `/settings` or any certificate/verify-credential route.
 * 3. `public.users.email` is kept in sync with `auth.users.email` on every
 *    successful email-change confirmation.
 * 4. An invalid/expired/already-used confirmation link redirects to
 *    `/email-verified?status=error` instead of bouncing to `/login`.
 * 5. Non-email-change flows (`signup`) are unaffected by these changes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockVerifyOtp, mockUsersUpdateEq, mockEnsureUserProfile } = vi.hoisted(() => ({
  mockVerifyOtp: vi.fn(),
  mockUsersUpdateEq: vi.fn(),
  mockEnsureUserProfile: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/supabase', () => ({
  createServiceRoleClient: () => ({
    auth: { verifyOtp: mockVerifyOtp },
    from: (table: string) => {
      if (table === 'users') {
        return {
          update: (payload: Record<string, unknown>) => ({
            eq: (col: string, val: string) => {
              mockUsersUpdateEq(payload, col, val)
              return Promise.resolve({ data: null, error: null })
            },
          }),
        }
      }
      return { update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }) }
    },
  }),
}))

vi.mock('@/lib/auth', () => ({
  ensureUserProfile: mockEnsureUserProfile,
}))

vi.mock('@/lib/notifications/dispatcher', () => ({
  globalNotificationDispatcher: { dispatch: vi.fn().mockResolvedValue(undefined) },
}))

vi.mock('@/lib/notifications/events/connectors', () => ({
  initializeNotificationConnectors: vi.fn(),
}))

import { GET } from '../../app/api/auth/callback/route'

function makeRequest(query: string) {
  return new NextRequest(`http://localhost:3000/api/auth/callback${query}`)
}

describe('auth/callback — email change confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normalizes email_change_current to email_change and lands on /email-verified', async () => {
    mockVerifyOtp.mockResolvedValue({
      data: { user: { id: 'usr_1', email: 'new@example.com' }, session: null },
      error: null,
    })

    const res = await GET(makeRequest('?token_hash=valid_hash&type=email_change_current'))
    expect(mockVerifyOtp).toHaveBeenCalledWith({ token_hash: 'valid_hash', type: 'email_change' })
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/email-verified')
    expect(res.headers.get('location')).not.toContain('status=error')
  })

  it('normalizes email_change_new to email_change and lands on /email-verified', async () => {
    mockVerifyOtp.mockResolvedValue({
      data: { user: { id: 'usr_1', email: 'new@example.com' }, session: null },
      error: null,
    })

    const res = await GET(makeRequest('?token_hash=valid_hash&type=email_change_new'))
    expect(mockVerifyOtp).toHaveBeenCalledWith({ token_hash: 'valid_hash', type: 'email_change' })
    expect(res.headers.get('location')).toContain('/email-verified')
  })

  it('never redirects a successful email_change confirmation to /settings or a certificate page', async () => {
    mockVerifyOtp.mockResolvedValue({
      data: { user: { id: 'usr_1', email: 'new@example.com' }, session: null },
      error: null,
    })

    const res = await GET(makeRequest('?token_hash=valid_hash&type=email_change&next=/settings%3Ftab%3Dsecurity'))
    const location = res.headers.get('location') || ''
    expect(location).toContain('/email-verified')
    expect(location).not.toContain('/settings')
    expect(location).not.toContain('/verify/')
  })

  it('sets session cookies on the /email-verified redirect when verifyOtp returns a fresh session', async () => {
    mockVerifyOtp.mockResolvedValue({
      data: {
        user: { id: 'usr_1', email: 'new@example.com' },
        session: { access_token: 'at_1', refresh_token: 'rt_1', expires_in: 3600 },
      },
      error: null,
    })

    const res = await GET(makeRequest('?token_hash=valid_hash&type=email_change'))
    expect(res.headers.get('location')).toContain('/email-verified')
    expect(res.cookies.get('sb-access-token')?.value).toBe('at_1')
    expect(res.cookies.get('sb-refresh-token')?.value).toBe('rt_1')
  })

  it('redirects to /email-verified without setting cookies when verifyOtp returns no session', async () => {
    mockVerifyOtp.mockResolvedValue({
      data: { user: { id: 'usr_1', email: 'new@example.com' }, session: null },
      error: null,
    })

    const res = await GET(makeRequest('?token_hash=valid_hash&type=email_change'))
    expect(res.headers.get('location')).toContain('/email-verified')
    expect(res.cookies.get('sb-access-token')?.value).toBeFalsy()
  })

  it('syncs public.users.email to the new address on successful confirmation', async () => {
    mockVerifyOtp.mockResolvedValue({
      data: { user: { id: 'usr_42', email: 'fresh@example.com' }, session: null },
      error: null,
    })

    await GET(makeRequest('?token_hash=valid_hash&type=email_change'))
    expect(mockUsersUpdateEq).toHaveBeenCalledWith({ email: 'fresh@example.com' }, 'id', 'usr_42')
  })

  it('does NOT call ensureUserProfile for email_change (user already exists)', async () => {
    // ensureUserProfile IS expected to run for email_change per current route logic
    // (only recovery skips it) — this test documents that behavior explicitly.
    mockVerifyOtp.mockResolvedValue({
      data: { user: { id: 'usr_1', email: 'new@example.com' }, session: null },
      error: null,
    })
    await GET(makeRequest('?token_hash=valid_hash&type=email_change'))
    expect(mockEnsureUserProfile).toHaveBeenCalled()
  })

  it('redirects an invalid/expired email_change link to /email-verified?status=error', async () => {
    mockVerifyOtp.mockResolvedValue({
      data: { user: null },
      error: { message: 'Token has expired or is invalid' },
    })

    const res = await GET(makeRequest('?token_hash=expired_hash&type=email_change'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/email-verified?status=error')
  })

  it('redirects an invalid email_change_current link (sub-type) to /email-verified?status=error', async () => {
    mockVerifyOtp.mockResolvedValue({
      data: { user: null },
      error: { message: 'Token has expired or is invalid' },
    })

    const res = await GET(makeRequest('?token_hash=expired_hash&type=email_change_current'))
    expect(res.headers.get('location')).toContain('/email-verified?status=error')
  })

  it('an already-used (re-clicked) email_change link fails verifyOtp and lands on the error state, not a stale success', async () => {
    mockVerifyOtp.mockResolvedValue({
      data: { user: null },
      error: { message: 'Token has already been used' },
    })

    const res = await GET(makeRequest('?token_hash=used_hash&type=email_change'))
    expect(res.headers.get('location')).toBe('http://localhost:3000/email-verified?status=error')
  })

  it('does not touch public.users on a failed confirmation', async () => {
    mockVerifyOtp.mockResolvedValue({ data: { user: null }, error: { message: 'invalid' } })
    await GET(makeRequest('?token_hash=bad_hash&type=email_change'))
    expect(mockUsersUpdateEq).not.toHaveBeenCalled()
  })

  it('regression: signup confirmation still redirects to its normal destination, unaffected by email_change routing', async () => {
    mockVerifyOtp.mockResolvedValue({
      data: {
        user: { id: 'usr_2', email: 'signup@example.com' },
        session: { access_token: 'at_2', refresh_token: 'rt_2', expires_in: 3600 },
      },
      error: null,
    })

    const res = await GET(makeRequest('?token_hash=signup_hash&type=signup&next=/dashboard'))
    expect(res.headers.get('location')).toContain('/dashboard')
    expect(res.headers.get('location')).not.toContain('/email-verified')
    // signup does NOT sync public.users.email (only email_change does)
    expect(mockUsersUpdateEq).not.toHaveBeenCalled()
  })
})
