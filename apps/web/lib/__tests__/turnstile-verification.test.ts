import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { verifyTurnstileToken, evaluateSiteverifyBudget } from '@/lib/security/turnstile'
import { checkTurnstileBuildConfig, TURNSTILE_SITE_KEY_ENV } from '@/lib/security/turnstile-env'

const mockEvaluatePersistentRateLimit = vi.fn()
vi.mock('@/lib/rate-limit', () => ({
  evaluatePersistentRateLimit: (...args: unknown[]) => mockEvaluatePersistentRateLimit(...args),
}))

/** Reads the form-encoded body a Siteverify call was made with. */
function siteverifyBody(spy: { mock: { calls: unknown[][] } }): URLSearchParams {
  const init = spy.mock.calls[0]?.[1] as { body?: string } | undefined
  return new URLSearchParams(init?.body || '')
}

vi.mock('@/lib/monitoring/logger', () => ({
  logSystemError: vi.fn().mockResolvedValue('err_test_123'),
  logErrorReport: vi.fn().mockResolvedValue(undefined),
  sanitizeErrorMessage: (msg: string) => msg,
}))

describe('Turnstile Server-Side Verification Unit Tests', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env = { ...originalEnv }
    process.env.TURNSTILE_SECRET_KEY = '1x0000000000000000000000000000000AA'
    delete process.env.DEV_TURNSTILE_BYPASS
    mockEvaluatePersistentRateLimit.mockResolvedValue({ success: true, remaining: 499, resetInMs: 3_600_000 })
  })

  afterEach(() => {
    process.env = originalEnv
    vi.restoreAllMocks()
  })

  it('1. Missing token string: returns CAPTCHA_FAILED without making external fetch call', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const result = await verifyTurnstileToken(undefined)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('CAPTCHA_FAILED')
      expect(result.errorCodes).toContain('missing-input-response')
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('2. Empty token string: returns CAPTCHA_FAILED without making external fetch call', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const result = await verifyTurnstileToken('   ')

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('CAPTCHA_FAILED')
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('3. Invalid token: Cloudflare returns success: false -> returns CAPTCHA_FAILED', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: false,
          'error-codes': ['invalid-input-response'],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )

    const result = await verifyTurnstileToken('invalid_token_sample', '203.0.113.1')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('CAPTCHA_FAILED')
      expect(result.errorCodes).toContain('invalid-input-response')
    }
  })

  it('4. Expired token: Cloudflare returns timeout-or-duplicate -> returns CAPTCHA_FAILED', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: false,
          'error-codes': ['timeout-or-duplicate'],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )

    const result = await verifyTurnstileToken('expired_token_sample')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('CAPTCHA_FAILED')
      expect(result.errorCodes).toContain('timeout-or-duplicate')
    }
  })

  it('5. Reused token: Cloudflare returns timeout-or-duplicate on replay -> returns CAPTCHA_FAILED', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: false,
          'error-codes': ['timeout-or-duplicate'],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )

    const result = await verifyTurnstileToken('reused_token_sample')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('CAPTCHA_FAILED')
    }
  })

  it('6. Cloudflare timeout (>5000ms): Fetch aborts and fails closed, returning CAPTCHA_UNAVAILABLE', async () => {
    const timeoutError = new Error('The operation was aborted due to timeout')
    timeoutError.name = 'TimeoutError'
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(timeoutError)

    const result = await verifyTurnstileToken('some_valid_token')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('CAPTCHA_UNAVAILABLE')
      expect(result.isTimeout).toBe(true)
    }
  })

  it('7. Cloudflare 5xx / Network Error: fails closed, returning CAPTCHA_UNAVAILABLE', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 502, statusText: 'Bad Gateway' })
    )

    const result = await verifyTurnstileToken('some_valid_token')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('CAPTCHA_UNAVAILABLE')
    }
  })

  it('8. Missing production secret (NODE_ENV === "production"): fails closed and returns CAPTCHA_UNAVAILABLE', async () => {
    delete process.env.TURNSTILE_SECRET_KEY
    ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'

    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const { logSystemError } = await import('@/lib/monitoring/logger')

    const result = await verifyTurnstileToken('some_token')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('CAPTCHA_UNAVAILABLE')
    }
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(logSystemError).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'critical',
        category: 'auth',
        operation: 'auth.turnstile_verify',
      })
    )
  })

  it('9. Development bypass opt-in: when NODE_ENV !== "production" AND DEV_TURNSTILE_BYPASS === "true", returns success: true', async () => {
    ;(process.env as Record<string, string | undefined>).NODE_ENV = 'development'
    process.env.DEV_TURNSTILE_BYPASS = 'true'
    delete process.env.TURNSTILE_SECRET_KEY

    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const result = await verifyTurnstileToken('dummy_dev_token')

    expect(result.success).toBe(true)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('10. Production bypass lock: when NODE_ENV === "production", DEV_TURNSTILE_BYPASS has zero effect and fails closed if secret missing', async () => {
    ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'
    process.env.DEV_TURNSTILE_BYPASS = 'true'
    delete process.env.TURNSTILE_SECRET_KEY

    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const result = await verifyTurnstileToken('attempted_bypass_token')

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('CAPTCHA_UNAVAILABLE')
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('Successful verification: Cloudflare returns success: true -> returns success with challenge metadata', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          challenge_ts: '2026-09-10T23:59:00Z',
          hostname: 'prodily.adityagangwani.me',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )

    const result = await verifyTurnstileToken('valid_cf_token', '198.51.100.22')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.hostname).toBe('prodily.adityagangwani.me')
      expect(result.challengeTs).toBe('2026-09-10T23:59:00Z')
    }
  })
  // ==========================================================================
  // F-02 - `remoteip` must only ever carry a real, resolved client address
  // ==========================================================================

  it('F-02: sends remoteip when a trusted client IP was resolved', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    await verifyTurnstileToken('valid_cf_token', '203.0.113.7')
    expect(siteverifyBody(fetchSpy).get('remoteip')).toBe('203.0.113.7')
  })

  it('F-02: never forwards the `unresolved` bucket sentinel as remoteip', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    // Cloudflare answers `bad-request` for a malformed remoteip, which this module
    // would then report to the learner as a challenge failure they can never pass.
    await verifyTurnstileToken('valid_cf_token', 'unresolved')

    const body = siteverifyBody(fetchSpy)
    expect(body.has('remoteip')).toBe(false)
    expect(body.get('response')).toBe('valid_cf_token')
  })

  it('F-02: omits remoteip entirely when no client IP is supplied', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    await verifyTurnstileToken('valid_cf_token', undefined)
    expect(siteverifyBody(fetchSpy).has('remoteip')).toBe(false)
  })

  it('F-02: the secret travels in the POST body, form-encoded, never in the URL', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    await verifyTurnstileToken('valid_cf_token', '198.51.100.4')

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify')
    expect(String(url)).not.toContain('1x0000000000000000000000000000000AA')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/x-www-form-urlencoded'
    )
    expect(siteverifyBody(fetchSpy).get('secret')).toBe('1x0000000000000000000000000000000AA')
  })

  // ==========================================================================
  // F-06 - platform-wide Siteverify budget
  // ==========================================================================

  it('F-06: consumes one constant-key, fail-closed platform budget per verification', async () => {
    const result = await evaluateSiteverifyBudget()

    expect(result.success).toBe(true)
    expect(mockEvaluatePersistentRateLimit).toHaveBeenCalledTimes(1)

    const [key, options] = mockEvaluatePersistentRateLimit.mock.calls[0] as [
      string,
      { windowMs: number; limit: number; failClosed: boolean },
    ]
    // A constant key is the point: no IP or address rotation can buy a fresh budget.
    expect(key).toBe('turnstile_siteverify_global')
    expect(options.failClosed).toBe(true)
    expect(options.windowMs).toBe(60 * 60 * 1000)
    // Generous enough that organic traffic never reaches it (busiest observed organic
    // day was 49 signups), tight enough to bound function-time amplification.
    expect(options.limit).toBe(500)
  })

  it('F-06: reports exhaustion so the caller can refuse before contacting Cloudflare', async () => {
    mockEvaluatePersistentRateLimit.mockResolvedValueOnce({
      success: false,
      remaining: 0,
      resetInMs: 1_800_000,
    })

    const result = await evaluateSiteverifyBudget()
    expect(result.success).toBe(false)
    expect(result.resetInMs).toBe(1_800_000)
  })

  // ==========================================================================
  // F-03 - a production build cannot silently omit the public site key
  // ==========================================================================

  it('F-03: rejects a production build with no public site key', () => {
    const result = checkTurnstileBuildConfig({ NODE_ENV: 'production' })

    expect(result.ok).toBe(false)
    expect(result.error).toContain(TURNSTILE_SITE_KEY_ENV)
  })

  it('F-03: rejects a production build whose public site key is blank', () => {
    expect(
      checkTurnstileBuildConfig({ NODE_ENV: 'production', [TURNSTILE_SITE_KEY_ENV]: '   ' }).ok
    ).toBe(false)
  })

  it('F-03: accepts a production build with the public site key set', () => {
    expect(
      checkTurnstileBuildConfig({
        NODE_ENV: 'production',
        [TURNSTILE_SITE_KEY_ENV]: '1x00000000000000000000AA',
      }).ok
    ).toBe(true)
  })

  it('F-03: does not accept a bare TURNSTILE_SITE_KEY as a substitute', () => {
    // Only the NEXT_PUBLIC_-prefixed name reaches the browser; accepting a second
    // name would allow a "configured" key that the client never receives.
    expect(
      checkTurnstileBuildConfig({ NODE_ENV: 'production', TURNSTILE_SITE_KEY: 'looks-configured' }).ok
    ).toBe(false)
  })

  it('F-03: leaves dev and test runs usable without a site key', () => {
    expect(checkTurnstileBuildConfig({ NODE_ENV: 'development' }).ok).toBe(true)
    expect(checkTurnstileBuildConfig({ NODE_ENV: 'test' }).ok).toBe(true)
  })

  it('F-03: never reads the server secret, so it cannot pull it into build scope', () => {
    const result = checkTurnstileBuildConfig({
      NODE_ENV: 'production',
      TURNSTILE_SECRET_KEY: 'server-only-value',
    })

    expect(result.ok).toBe(false)
    expect(result.error).not.toContain('server-only-value')
  })
})
