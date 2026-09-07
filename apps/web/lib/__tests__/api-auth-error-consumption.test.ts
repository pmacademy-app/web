/**
 * Coverage for how the auth screens consume the P7 API error contract.
 *
 * The screens previously re-derived the error code by re-classifying the message
 * string. That works only while the copy keeps matching a pattern — a lossy round-trip
 * through English for a value the server already decided. `resolveApiAuthError` reads
 * the server's stable code instead, and falls back to classification when the response
 * carries a code this classifier does not own.
 */
import { describe, it, expect } from 'vitest'
import { resolveApiAuthError, classifyAuthError, AUTH_ERROR_CODES } from '../auth/errors'

describe('resolveApiAuthError — stable codes win over message re-derivation', () => {
  it('trusts a server-supplied auth code and keeps the server copy', () => {
    const resolved = resolveApiAuthError(
      { error: 'An account already exists with this email address. Please log in instead.', code: 'AUTH_USER_ALREADY_EXISTS' },
      'signup'
    )
    expect(resolved.code).toBe('AUTH_USER_ALREADY_EXISTS')
    expect(resolved.message).toContain('already exists')
  })

  it('keeps the specific weak-password code even though the copy alone is ambiguous', () => {
    const resolved = resolveApiAuthError(
      { error: 'Password does not meet security requirements. Please choose a password with at least 6 characters.', code: 'AUTH_PASSWORD_TOO_WEAK' },
      'signup'
    )
    expect(resolved.code).toBe('AUTH_PASSWORD_TOO_WEAK')
  })

  it('keeps the server copy for a platform code this classifier does not own', () => {
    // SIGNUPS_DISABLED and VALIDATION are platform codes, not auth-classifier codes.
    // Their copy must survive: replacing it with the classifier's fallback turned a
    // specific validation message into "An unexpected authentication error occurred."
    const resolved = resolveApiAuthError(
      { error: 'New learner registrations are currently closed.', code: 'SIGNUPS_DISABLED' },
      'signup'
    )
    expect(AUTH_ERROR_CODES.has('SIGNUPS_DISABLED')).toBe(false)
    expect(resolved.message).toContain('registrations are currently closed')
  })

  it('keeps validation messages specific', () => {
    const resolved = resolveApiAuthError({ error: 'Password is required.', code: 'VALIDATION' }, 'login')
    expect(resolved.message).toBe('Password is required.')
  })

  it('classifies a SERVER_ERROR body as a retryable provider outage', () => {
    const resolved = resolveApiAuthError(
      {
        error: 'The authentication service is temporarily unavailable. Please try again in a few moments.',
        code: 'SERVER_ERROR',
        errorId: 'err_0123456789abcdef',
      },
      'login'
    )
    expect(resolved.code).toBe('AUTH_PROVIDER_UNAVAILABLE')
    expect(resolved.retryable).toBe(true)
  })

  it('carries the errorId through so it can be quoted to support', () => {
    const resolved = resolveApiAuthError(
      { error: 'Something went wrong on our side.', code: 'SERVER_ERROR', errorId: 'err_0123456789abcdef' },
      'login'
    )
    expect(resolved.errorId).toBe('err_0123456789abcdef')
  })

  it('leaves errorId unset when the response has none', () => {
    const resolved = resolveApiAuthError({ error: 'Invalid email or password.', code: 'AUTH_INVALID_CREDENTIALS' }, 'login')
    expect(resolved.errorId).toBeUndefined()
  })

  it('degrades to safe copy when the body is empty or malformed', () => {
    for (const body of [null, undefined, {}]) {
      const resolved = resolveApiAuthError(body, 'login', 'Authentication failed')
      expect(typeof resolved.message).toBe('string')
      expect(resolved.message.length).toBeGreaterThan(0)
      expect(AUTH_ERROR_CODES.has(resolved.code)).toBe(true)
    }
  })

  it('never surfaces raw provider or database text', () => {
    // The API no longer sends these, but the screens must stay safe if one slips through.
    const raw = 'relation "users" does not exist at character 15 [gotrue] xkeysib-SECRET'
    const resolved = resolveApiAuthError({ error: raw }, 'login')
    expect(resolved.message).not.toContain('relation "users"')
    expect(resolved.message).not.toContain('xkeysib-SECRET')
    expect(resolved.code).toBe('AUTH_UNKNOWN_ERROR')
  })

  it('marks provider and network failures retryable so the form offers another attempt', () => {
    const outage = classifyAuthError(new Error('Service unavailable'), 'login')
    expect(outage.retryable).toBe(true)

    const credentials = classifyAuthError(new Error('Invalid login credentials'), 'login')
    expect(credentials.retryable).toBe(false)
  })
})
