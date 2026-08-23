import { describe, it, expect } from 'vitest'
import { classifyAuthError } from '@/lib/auth/errors'

describe('Phase 4 — Auth UI Error Handling Integration', () => {
  describe('Login Flow Error Handling', () => {
    it('translates browser "Failed to fetch" during login to safe actionable connectivity guidance', () => {
      const browserNetworkError = new TypeError('Failed to fetch')
      const result = classifyAuthError(browserNetworkError, 'login')

      expect(result.code).toBe('AUTH_NETWORK_ERROR')
      expect(result.isNetworkError).toBe(true)
      expect(result.retryable).toBe(true)
      expect(result.message).toBe(
        'Unable to connect to the authentication service. Please check your internet connection, disable any ad-blockers or restrictive privacy extensions, and try again.'
      )
      // Assert raw browser error string is eliminated
      expect(result.message).not.toContain('Failed to fetch')
      expect(result.message).not.toContain('TypeError')
    })

    it('translates invalid credentials error during login to safe non-enumerating message', () => {
      const authError = { message: 'Invalid login credentials', status: 400 }
      const result = classifyAuthError(authError, 'login')

      expect(result.code).toBe('AUTH_INVALID_CREDENTIALS')
      expect(result.retryable).toBe(false)
      expect(result.message).toBe('Invalid email or password. Please check your credentials and try again.')
    })

    it('translates session sync network failure to actionable sync message', () => {
      const syncNetErr = new TypeError('Failed to fetch')
      const result = classifyAuthError(syncNetErr, 'session_sync')

      expect(result.code).toBe('AUTH_SESSION_SYNC_FAILED')
      expect(result.isNetworkError).toBe(true)
      expect(result.message).toBe('Unable to synchronize your login session. Please check your internet connection and try again.')
    })
  })

  describe('Signup Flow Error Handling', () => {
    it('translates browser "Failed to fetch" during signup to safe connectivity guidance', () => {
      const signupNetworkErr = new TypeError('Failed to fetch')
      const result = classifyAuthError(signupNetworkErr, 'signup')

      expect(result.code).toBe('AUTH_NETWORK_ERROR')
      expect(result.isNetworkError).toBe(true)
      expect(result.retryable).toBe(true)
      expect(result.message).not.toContain('Failed to fetch')
    })

    it('translates duplicate user during signup to existing account guidance with login action', () => {
      const duplicateErr = new Error('User already registered')
      const result = classifyAuthError(duplicateErr, 'signup')

      expect(result.code).toBe('AUTH_USER_ALREADY_EXISTS')
      expect(result.requiresAction).toBe('login')
      expect(result.message).toBe('An account already exists with this email address. Please log in instead.')
    })

    it('translates weak password response during signup to password guidance', () => {
      const weakPwErr = { message: 'Password should be at least 6 characters' }
      const result = classifyAuthError(weakPwErr, 'signup')

      expect(result.code).toBe('AUTH_PASSWORD_TOO_WEAK')
      expect(result.message).toBe('Password does not meet security requirements. Please choose a password with at least 6 characters.')
    })

    it('translates transient database 500 error during signup to provider unavailable guidance', () => {
      const dbErr = { message: 'Database error saving new user' }
      const result = classifyAuthError(dbErr, 'signup')

      expect(result.code).toBe('AUTH_PROVIDER_UNAVAILABLE')
      expect(result.retryable).toBe(true)
      expect(result.message).toBe('The authentication service is temporarily unavailable. Please try again in a few moments.')
    })
  })
})
