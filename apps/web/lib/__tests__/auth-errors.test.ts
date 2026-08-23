import { describe, it, expect } from 'vitest'
import { classifyAuthError, isNetworkFailure } from '@/lib/auth/errors'

describe('Phase 4 — Authentication Error Classification & Safety', () => {
  describe('Network Error Detection', () => {
    it('detects Chrome/Firefox "Failed to fetch" TypeError as network error', () => {
      const error = new TypeError('Failed to fetch')
      const classified = classifyAuthError(error)

      expect(classified.code).toBe('AUTH_NETWORK_ERROR')
      expect(classified.isNetworkError).toBe(true)
      expect(classified.retryable).toBe(true)
      expect(classified.message).toContain('Unable to connect to the authentication service')
      expect(classified.message).not.toContain('Failed to fetch')
    })

    it('detects Safari "Load failed" as network error', () => {
      const error = new TypeError('Load failed')
      const classified = classifyAuthError(error)

      expect(classified.code).toBe('AUTH_NETWORK_ERROR')
      expect(classified.isNetworkError).toBe(true)
      expect(classified.retryable).toBe(true)
    })

    it('detects DOMException "AbortError" as network error', () => {
      const error = { name: 'AbortError', message: 'The user aborted a request.' }
      const classified = classifyAuthError(error)

      expect(classified.code).toBe('AUTH_NETWORK_ERROR')
      expect(classified.isNetworkError).toBe(true)
    })

    it('detects connection timeouts and resets as network error', () => {
      expect(isNetworkFailure(new Error('connect ECONNREFUSED 127.0.0.1'))).toBe(true)
      expect(isNetworkFailure(new Error('read ECONNRESET'))).toBe(true)
      expect(isNetworkFailure(new Error('The request timed out.'))).toBe(true)
      expect(isNetworkFailure(new Error('net::ERR_INTERNET_DISCONNECTED'))).toBe(true)
    })

    it('does NOT over-classify generic TypeErrors as network errors', () => {
      const error = new TypeError('Cannot read properties of undefined (reading "user")')
      const classified = classifyAuthError(error)

      expect(classified.code).toBe('AUTH_UNKNOWN_ERROR')
      expect(classified.isNetworkError).toBe(false)
      expect(classified.message).toContain('An unexpected authentication error occurred')
    })
  })

  describe('Auth Error Classifications', () => {
    it('classifies invalid credentials with safe non-enumerating message', () => {
      const variations = [
        'Invalid login credentials',
        'invalid credentials',
        'Invalid username or password',
        'Wrong password',
      ]

      for (const msg of variations) {
        const classified = classifyAuthError(new Error(msg), 'login')
        expect(classified.code).toBe('AUTH_INVALID_CREDENTIALS')
        expect(classified.retryable).toBe(false)
        expect(classified.isNetworkError).toBe(false)
        expect(classified.message).toBe('Invalid email or password. Please check your credentials and try again.')
      }
    })

    it('classifies unconfirmed email with verification guidance', () => {
      const error = new Error('Email not confirmed')
      const classified = classifyAuthError(error, 'login')

      expect(classified.code).toBe('AUTH_EMAIL_NOT_CONFIRMED')
      expect(classified.requiresAction).toBe('verify_email')
      expect(classified.retryable).toBe(false)
      expect(classified.message).toContain('Please verify your email address before logging in')
    })

    it('classifies duplicate account on signup with login guidance', () => {
      const error = new Error('User already registered')
      const classified = classifyAuthError(error, 'signup')

      expect(classified.code).toBe('AUTH_USER_ALREADY_EXISTS')
      expect(classified.requiresAction).toBe('login')
      expect(classified.retryable).toBe(false)
      expect(classified.message).toContain('An account already exists with this email address')
    })

    it('classifies weak password with requirement message', () => {
      const error = new Error('Password should be at least 6 characters')
      const classified = classifyAuthError(error, 'signup')

      expect(classified.code).toBe('AUTH_PASSWORD_TOO_WEAK')
      expect(classified.retryable).toBe(false)
      expect(classified.message).toContain('Password does not meet security requirements')
    })

    it('classifies rate limiting with wait guidance', () => {
      const error = new Error('For security purposes, you can only request this once every 60 seconds')
      const classified = classifyAuthError(error)

      expect(classified.code).toBe('AUTH_RATE_LIMITED')
      expect(classified.requiresAction).toBe('wait')
      expect(classified.retryable).toBe(true)
      expect(classified.message).toContain('Too many attempts')
    })

    it('classifies provider/database outage (502/503/500) as provider unavailable', () => {
      const error503 = new Error('503: Service Unavailable')
      const classified503 = classifyAuthError(error503)
      expect(classified503.code).toBe('AUTH_PROVIDER_UNAVAILABLE')
      expect(classified503.retryable).toBe(true)

      const dbErr = new Error('Database error saving new user')
      const classifiedDb = classifyAuthError(dbErr, 'signup')
      expect(classifiedDb.code).toBe('AUTH_PROVIDER_UNAVAILABLE')
      expect(classifiedDb.message).toContain('The authentication service is temporarily unavailable')
    })

    it('classifies session sync failures with actionable advice', () => {
      const syncNetErr = new TypeError('Failed to fetch')
      const classifiedNet = classifyAuthError(syncNetErr, 'session_sync')
      expect(classifiedNet.code).toBe('AUTH_SESSION_SYNC_FAILED')
      expect(classifiedNet.isNetworkError).toBe(true)
      expect(classifiedNet.message).toContain('Unable to synchronize your login session')

      const syncErr = new Error('Cookie write failed')
      const classifiedGeneric = classifyAuthError(syncErr, 'session_sync')
      expect(classifiedGeneric.code).toBe('AUTH_SESSION_SYNC_FAILED')
      expect(classifiedGeneric.message).toContain('Session synchronization failed')
    })

    it('classifies null / undefined / arbitrary errors as unknown with safe message', () => {
      const classifiedNull = classifyAuthError(null)
      expect(classifiedNull.code).toBe('AUTH_UNKNOWN_ERROR')
      expect(classifiedNull.message).toBe('An unexpected authentication error occurred. Please try again.')

      const classifiedObj = classifyAuthError({ custom: 'odd error' })
      expect(classifiedObj.code).toBe('AUTH_UNKNOWN_ERROR')
      expect(classifiedObj.message).toBe('An unexpected authentication error occurred. Please try again.')
    })
  })

  describe('Message Safety & Information Leak Prevention', () => {
    it('never exposes sensitive tokens, passwords, database columns, or internal URLs in classified messages', () => {
      const leaks = [
        'sb-secret-key-12345',
        'http://internal-supabase:8000/auth/v1',
        'column "users.full_name" does not exist',
        'SELECT * FROM auth.users WHERE id = $1',
        'password1234!',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.token',
      ]

      for (const leak of leaks) {
        const error = new Error(`Internal failure: ${leak}`)
        const classified = classifyAuthError(error)

        expect(classified.message).not.toContain(leak)
        expect(classified.message).not.toContain('Internal failure')
      }
    })
  })
})
