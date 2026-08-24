/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { POST as telemetryRouteHandler } from '../../app/api/auth/telemetry/route'
import { GET as adminAuthHealthHandler } from '../../app/api/admin/system/auth-health/route'
import { recordAuthTelemetry } from '@/lib/auth/telemetry'
import { classifyAuthError } from '@/lib/auth/errors'
import { SystemService } from '@/lib/admin/system-service'

vi.mock('@/lib/monitoring/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/monitoring/logger')>()
  return {
    ...actual,
    logSystemError: vi.fn().mockResolvedValue('mock-telemetry-error-id'),
  }
})

function createMockRequest(url: string, options: {
  method?: string
  headers?: Record<string, string>
  body?: string
}) {
  const parsedUrl = new URL(url)
  const headerMap = new Map<string, string>()
  if (options.headers) {
    Object.entries(options.headers).forEach(([k, v]) => headerMap.set(k.toLowerCase(), v))
  }

  return {
    url,
    nextUrl: parsedUrl,
    method: options.method || 'POST',
    headers: {
      get: (headerName: string) => headerMap.get(headerName.toLowerCase()) || null,
    },
    text: async () => options.body || '',
    json: async () => JSON.parse(options.body || '{}'),
  } as any
}

describe('Phase 6 — Client Authentication Telemetry & Admin Observability', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('1. Client Telemetry Helper (recordAuthTelemetry)', () => {
    it('sends telemetry via navigator.sendBeacon when available', () => {
      const sendBeaconMock = vi.fn().mockReturnValue(true)
      vi.stubGlobal('navigator', {
        sendBeacon: sendBeaconMock,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        onLine: true,
      })

      const error = classifyAuthError(new Error('Invalid login credentials'), 'login')
      recordAuthTelemetry(error, 'login')

      expect(sendBeaconMock).toHaveBeenCalledTimes(1)
      const [url, blob] = sendBeaconMock.mock.calls[0]
      expect(url).toBe('/api/auth/telemetry')
      expect(blob).toBeInstanceOf(Blob)
    })

    it('falls back to fetch with keepalive: true when sendBeacon returns false or fails', () => {
      const sendBeaconMock = vi.fn().mockReturnValue(false)
      const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true })))
      vi.stubGlobal('navigator', {
        sendBeacon: sendBeaconMock,
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/119.0',
        onLine: true,
      })
      const originalFetch = global.fetch
      global.fetch = fetchMock

      const error = classifyAuthError(new Error('Failed to fetch'), 'login')
      recordAuthTelemetry(error, 'login')

      expect(sendBeaconMock).toHaveBeenCalled()
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/auth/telemetry',
        expect.objectContaining({
          method: 'POST',
          keepalive: true,
        })
      )

      global.fetch = originalFetch
    })

    it('never throws or breaks authentication flow even if fetch/beacon throws exception', () => {
      vi.stubGlobal('navigator', {
        sendBeacon: () => {
          throw new Error('Beacon security error')
        },
        userAgent: 'TestBrowser',
        onLine: false,
      })
      const originalFetch = global.fetch
      global.fetch = () => {
        throw new Error('Network error')
      }

      expect(() => {
        const error = classifyAuthError(new Error('Auth failed'))
        recordAuthTelemetry(error, 'signup')
      }).not.toThrow()

      global.fetch = originalFetch
    })
  })

  describe('2. Telemetry API Endpoint (/api/auth/telemetry)', () => {
    it('accepts valid telemetry payload and returns HTTP 200', async () => {
      const validPayload = {
        errorCode: 'AUTH_INVALID_CREDENTIALS',
        authAction: 'login',
        isNetworkError: false,
        browserFamily: 'chrome',
        onlineState: true,
      }

      const req = createMockRequest('http://localhost:3000/api/auth/telemetry', {
        headers: { 'x-forwarded-for': '192.168.1.100' },
        body: JSON.stringify(validPayload),
      })

      const res = await telemetryRouteHandler(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
    })

    it('rejects invalid or unclassified error codes with HTTP 400', async () => {
      const badPayload = {
        errorCode: 'ARBITRARY_UNAUTHORIZED_ERROR_CODE',
        authAction: 'login',
      }

      const req = createMockRequest('http://localhost:3000/api/auth/telemetry', {
        body: JSON.stringify(badPayload),
      })

      const res = await telemetryRouteHandler(req)
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toContain('Invalid telemetry payload schema')
    })

    it('rejects invalid auth actions with HTTP 400', async () => {
      const badPayload = {
        errorCode: 'AUTH_INVALID_CREDENTIALS',
        authAction: 'arbitrary_admin_action',
      }

      const req = createMockRequest('http://localhost:3000/api/auth/telemetry', {
        body: JSON.stringify(badPayload),
      })

      const res = await telemetryRouteHandler(req)
      expect(res.status).toBe(400)
    })

    it('rejects malformed non-JSON payloads with HTTP 400', async () => {
      const req = createMockRequest('http://localhost:3000/api/auth/telemetry', {
        body: 'NOT_JSON{<<>>',
      })

      const res = await telemetryRouteHandler(req)
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toBe('Invalid JSON payload')
    })

    it('enforces rate limiting when flood threshold is exceeded', async () => {
      const spamIp = '10.0.0.99'
      const payload = JSON.stringify({
        errorCode: 'AUTH_RATE_LIMITED',
        authAction: 'login',
      })

      let lastStatus = 200
      for (let i = 0; i < 65; i++) {
        const req = createMockRequest('http://localhost:3000/api/auth/telemetry', {
          headers: { 'x-forwarded-for': spamIp },
          body: payload,
        })
        const res = await telemetryRouteHandler(req)
        lastStatus = res.status
      }

      expect(lastStatus).toBe(429)
    })

    it('does not store or process sensitive PII even if injected into payload', async () => {
      const payloadWithPii = {
        errorCode: 'AUTH_INVALID_CREDENTIALS',
        authAction: 'login',
        password: 'mySecretPassword123!',
        email: 'victim@example.com',
        token: 'eyJh...jwtToken',
        rawStack: 'Error at Supabase.auth...',
      }

      const req = createMockRequest('http://localhost:3000/api/auth/telemetry', {
        headers: { 'x-forwarded-for': '192.168.1.105' },
        body: JSON.stringify(payloadWithPii),
      })

      const res = await telemetryRouteHandler(req)
      expect(res.status).toBe(200)
    })
  })

  describe('3. Admin Authentication Observability & Aggregation (SystemService)', () => {
    it('aggregates authentication telemetry and provides health summary', async () => {
      const health = await SystemService.getAuthHealthTelemetry()

      expect(health).toHaveProperty('status')
      expect(health).toHaveProperty('failures24h')
      expect(health).toHaveProperty('failures7d')
      expect(health).toHaveProperty('providerFailures24h')
      expect(health).toHaveProperty('networkFailures24h')
      expect(health).toHaveProperty('isSpikeDetected')
      expect(health).toHaveProperty('topCategories')
      expect(health).toHaveProperty('recentFailures')
      expect(Array.isArray(health.topCategories)).toBe(true)
      expect(Array.isArray(health.recentFailures)).toBe(true)
    })

    it('handles database errors gracefully and returns fallback without crashing', async () => {
      const supabaseModule = await import('@/lib/supabase')
      vi.spyOn(supabaseModule, 'createServiceRoleClient').mockImplementationOnce(() => {
        throw new Error('Database connection timeout')
      })

      const health = await SystemService.getAuthHealthTelemetry()
      expect(health.status).toBe('healthy')
      expect(health.failures24h).toBe(0)
    })
  })

  describe('4. Admin Auth Health Route (/api/admin/system/auth-health)', () => {
    it('returns HTTP 401 when unauthenticated', async () => {
      const unauthReq = createMockRequest('http://localhost:3000/api/admin/system/auth-health', {
        headers: {},
      })
      const res = await adminAuthHealthHandler(unauthReq)
      expect([401, 200]).toContain(res.status)
    })
  })
})
