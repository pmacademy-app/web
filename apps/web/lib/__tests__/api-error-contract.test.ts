/**
 * Coverage for the shared API error-response contract (audit B19).
 *
 * The property under test is narrow and important: a client must never receive text
 * that came from an exception, a provider, or the database — while the response shape
 * stays exactly what existing consumers already parse.
 *
 * Shape is a hard constraint, not a preference. `app/(auth)/login/page.tsx` and
 * `signup/page.tsx` do `classifyAuthError(new Error(json.error))`, and
 * `ResendVerificationCard` reads `data.code`. So `error` must stay a string and `code`
 * must stay top-level; `success` and `errorId` are additive.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  apiError,
  apiInternalError,
  apiClassifiedAuthError,
  AUTH_SERVICE_UNAVAILABLE_MESSAGE,
  GENERIC_SERVER_ERROR_MESSAGE,
} from '../errors/api-response'
import { classifyAuthError } from '../auth/errors'

describe('API error contract — shape', () => {
  it('returns success:false, a string error and a top-level code', async () => {
    const res = apiError({ status: 400, code: 'VALIDATION', message: 'Email is required.' })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(typeof body.error).toBe('string')
    expect(body.code).toBe('VALIDATION')
  })

  it('preserves route-specific extra fields that clients already depend on', async () => {
    const res = apiError({
      status: 403,
      code: 'AUTH_EMAIL_NOT_CONFIRMED',
      message: 'Please verify your email address before logging in.',
      extra: { requiresVerification: true, email: 'learner@example.com' },
    })
    const body = await res.json()

    expect(body.requiresVerification).toBe(true)
    expect(body.email).toBe('learner@example.com')
  })

  it('omits errorId when there is no internal incident to correlate', async () => {
    const res = apiError({ status: 409, code: 'USER_EXISTS', message: 'An account already exists.' })
    expect(await res.json()).not.toHaveProperty('errorId')
  })
})

describe('API error contract — unexpected exceptions never leak', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('replaces the exception message with safe copy and attaches an errorId', async () => {
    const cause = new Error('connect ECONNREFUSED 10.0.0.5:5432 relation "users" does not exist')
    const res = await apiInternalError({
      cause,
      domain: 'auth',
      operation: 'auth.login',
      summary: 'Unexpected failure while signing a learner in',
      message: AUTH_SERVICE_UNAVAILABLE_MESSAGE,
    })
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.success).toBe(false)
    expect(body.code).toBe('SERVER_ERROR')
    expect(body.error).toBe(AUTH_SERVICE_UNAVAILABLE_MESSAGE)
    expect(body.errorId).toMatch(/^err_[0-9a-f]{16}$/)

    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain('ECONNREFUSED')
    expect(serialized).not.toContain('10.0.0.5')
    expect(serialized).not.toContain('relation "users"')
  })

  it('never leaks a provider payload embedded in the exception', async () => {
    const cause = new Error('Brevo said: {"message":"Plan sending limit reached","key":"xkeysib-SECRET1"}')
    const res = await apiInternalError({
      cause,
      domain: 'email',
      operation: 'email.direct_send',
      summary: 'Unexpected failure while sending an email',
    })
    const serialized = JSON.stringify(await res.json())

    expect(serialized).not.toContain('xkeysib-SECRET1')
    expect(serialized).not.toContain('Plan sending limit reached')
    expect(serialized).toContain(GENERIC_SERVER_ERROR_MESSAGE)
  })

  it('gives each failure a distinct errorId so support can correlate one report', async () => {
    const first = await apiInternalError({
      cause: new Error('a'), domain: 'api', operation: 'x.y', summary: 'Unexpected failure',
    })
    const second = await apiInternalError({
      cause: new Error('a'), domain: 'api', operation: 'x.y', summary: 'Unexpected failure',
    })
    expect((await first.json()).errorId).not.toBe((await second.json()).errorId)
  })

  it('still returns a well-formed response when incident logging throws', async () => {
    vi.doMock('../monitoring/logger', () => ({
      logErrorReport: () => {
        throw new Error('logger exploded')
      },
    }))

    const res = await apiInternalError({
      cause: new Error('original'), domain: 'api', operation: 'x.y', summary: 'Unexpected failure',
    })
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.success).toBe(false)
    expect(body.error).not.toContain('logger exploded')
    expect(body.error).not.toContain('original')

    vi.doUnmock('../monitoring/logger')
  })
})

describe('API error contract — auth classification integration', () => {
  it('returns the classifier code and copy instead of the provider message', async () => {
    const supabaseError = Object.assign(new Error('User already registered'), { code: 'user_already_exists' })
    const res = apiClassifiedAuthError({ cause: supabaseError, context: 'signup', status: 400 })
    const body = await res.json()

    expect(body.code).toBe('AUTH_USER_ALREADY_EXISTS')
    expect(body.error).not.toBe('User already registered')
    expect(body.error).toContain('already exists')
  })

  it('preserves the caller-chosen HTTP status', async () => {
    const res = apiClassifiedAuthError({
      cause: new Error('Auth session missing!'),
      context: 'reset_password',
      status: 401,
    })
    expect(res.status).toBe(401)
  })

  it('does not forward raw provider text for a weak password', async () => {
    const res = apiClassifiedAuthError({
      cause: new Error('Password should be at least 6 characters. [gotrue:422]'),
      context: 'signup',
      status: 400,
    })
    const body = await res.json()

    expect(body.code).toBe('AUTH_PASSWORD_TOO_WEAK')
    expect(body.error).not.toContain('gotrue')
    expect(body.error).not.toContain('422')
  })
})

describe('classifier idempotency — server messages survive client re-classification', () => {
  // The auth screens re-classify whatever string the API returns. If a classified
  // message does not re-classify to the same code, returning classified copy would
  // silently downgrade the specific guidance to AUTH_UNKNOWN_ERROR on the client.
  it.each([
    ['User already registered', 'AUTH_USER_ALREADY_EXISTS'],
    ['Invalid login credentials', 'AUTH_INVALID_CREDENTIALS'],
    ['Email not confirmed', 'AUTH_EMAIL_NOT_CONFIRMED'],
    ['Password should be at least 6 characters', 'AUTH_PASSWORD_TOO_WEAK'],
    ['Service unavailable', 'AUTH_PROVIDER_UNAVAILABLE'],
  ])('re-classifying the message for %s yields the same code', (raw, expectedCode) => {
    const first = classifyAuthError(new Error(raw), 'signup')
    expect(first.code).toBe(expectedCode)

    const second = classifyAuthError(new Error(first.message), 'signup')
    expect(second.code).toBe(first.code)
  })

  it('keeps the generic auth 500 copy classifiable as a retryable provider outage', () => {
    const classified = classifyAuthError(new Error(AUTH_SERVICE_UNAVAILABLE_MESSAGE), 'login')
    expect(classified.code).toBe('AUTH_PROVIDER_UNAVAILABLE')
    expect(classified.retryable).toBe(true)
  })
})
