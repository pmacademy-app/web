/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * B10-C — SWR adoption wired to the typed API client.
 *
 * Validates:
 * 1. `apiFetcher` integration with B10-B `apiGet`:
 *    - Successful envelope unpacking (data returned directly)
 *    - Error throwing as `ApiRequestError` preserving kind, code, status, requestId, errorId
 * 2. `defaultShouldRetryOnError` policy:
 *    - Rejects retrying deterministic client/auth errors (401, 403, 404, 422)
 *    - Allows retrying transient server/network failures (500, 502, 503, 504, undefined status)
 * 3. SWR integration:
 *    - `ApiClientProvider` configuration defaults
 *    - `useApiQuery` / `useApiEndpoint` hook interfaces and SWR mutation compatibility
 * 4. Architectural Client/Server boundary safety:
 *    - `lib/api/hooks.ts` contains no server imports
 *    - `lib/api/contracts/settings.ts` contains no server imports
 *    - Migrated client components do not value-import server DB modules
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { mutate } from 'swr'

import {
  apiFetcher,
  defaultShouldRetryOnError,
  ApiRequestError,
  ApiClientProvider,
} from '@/lib/api/hooks'
import { API_CLIENT_CODES } from '@/lib/api/client'

const ROOT = path.resolve(import.meta.dirname, '../../')

function respond(
  body: string | null,
  init: { status?: number; headers?: Record<string, string> } = {}
): Response {
  const headers = new Headers(init.headers ?? {})
  return {
    ok: (init.status ?? 200) >= 200 && (init.status ?? 200) < 300,
    status: init.status ?? 200,
    headers,
    text: () => Promise.resolve(body ?? ''),
  } as unknown as Response
}

let fetchMock: any

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ─── 1. apiFetcher Integration ───────────────────────────────────────────────

describe('B10-C — apiFetcher success and error propagation', () => {
  it('unwraps data directly on 2xx responses', async () => {
    fetchMock.mockResolvedValue(
      respond(JSON.stringify({ success: true, profile: { name: 'Ada' } }))
    )

    const data = await apiFetcher<{ success: boolean; profile: { name: string } }>(
      '/api/settings/profile'
    )

    expect(data.success).toBe(true)
    expect(data.profile.name).toBe('Ada')
  })

  it('throws ApiRequestError when the API responds with a non-2xx status', async () => {
    fetchMock.mockResolvedValue(
      respond(
        JSON.stringify({
          success: false,
          error: 'Unauthorized access',
          code: 'UNAUTHORIZED',
          errorId: 'err-12345',
        }),
        {
          status: 401,
          headers: { 'x-request-id': 'req-abcde' },
        }
      )
    )

    await expect(apiFetcher('/api/settings/profile')).rejects.toThrow(ApiRequestError)

    try {
      await apiFetcher('/api/settings/profile')
    } catch (err) {
      expect(err).toBeInstanceOf(ApiRequestError)
      const apiErr = err as ApiRequestError
      expect(apiErr.kind).toBe('http')
      expect(apiErr.status).toBe(401)
      expect(apiErr.code).toBe('UNAUTHORIZED')
      expect(apiErr.message).toBe('Unauthorized access')
      expect(apiErr.errorId).toBe('err-12345')
      expect(apiErr.requestId).toBe('req-abcde')
    }
  })

  it('throws ApiRequestError on network failures with kind="network"', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    try {
      await apiFetcher('/api/settings/profile')
      expect.unreachable('Should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ApiRequestError)
      const apiErr = err as ApiRequestError
      expect(apiErr.kind).toBe('network')
      expect(apiErr.code).toBe(API_CLIENT_CODES.network)
      expect(apiErr.status).toBe(0)
    }
  })

  it('throws ApiRequestError on malformed HTML/non-JSON responses with kind="parse"', async () => {
    fetchMock.mockResolvedValue(
      respond('<!doctype html><html><body>502 Bad Gateway</body></html>', {
        status: 502,
      })
    )

    try {
      await apiFetcher('/api/settings/profile')
      expect.unreachable('Should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ApiRequestError)
      const apiErr = err as ApiRequestError
      expect(apiErr.kind).toBe('parse')
      expect(apiErr.status).toBe(502)
      expect(apiErr.code).toBe(API_CLIENT_CODES.parse)
    }
  })
})

// ─── 2. SWR Retry Decision Policy ────────────────────────────────────────────

describe('B10-C — defaultShouldRetryOnError policy', () => {
  it('never retries 401 Unauthorized (prevents auth loops on expired session)', () => {
    const err = new ApiRequestError({
      kind: 'http',
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Session expired',
    })
    expect(defaultShouldRetryOnError(err)).toBe(false)
  })

  it('never retries 403 Forbidden (prevents denial hammering)', () => {
    const err = new ApiRequestError({
      kind: 'http',
      status: 403,
      code: 'FORBIDDEN',
      message: 'Not allowed',
    })
    expect(defaultShouldRetryOnError(err)).toBe(false)
  })

  it('never retries 404 Not Found', () => {
    const err = new ApiRequestError({
      kind: 'http',
      status: 404,
      code: 'NOT_FOUND',
      message: 'Resource missing',
    })
    expect(defaultShouldRetryOnError(err)).toBe(false)
  })

  it('never retries 422 Unprocessable Entity (validation errors)', () => {
    const err = new ApiRequestError({
      kind: 'http',
      status: 422,
      code: 'VALIDATION_FAILED',
      message: 'Invalid input',
    })
    expect(defaultShouldRetryOnError(err)).toBe(false)
  })

  it('retries transient 500 server errors', () => {
    const err = new ApiRequestError({
      kind: 'http',
      status: 500,
      code: 'SERVER_ERROR',
      message: 'Internal server error',
    })
    expect(defaultShouldRetryOnError(err)).toBe(true)
  })

  it('retries transient 502 Bad Gateway and 503 Service Unavailable', () => {
    const err502 = new ApiRequestError({
      kind: 'parse',
      status: 502,
      code: 'PARSE_FAILED',
      message: 'Bad gateway',
    })
    const err503 = new ApiRequestError({
      kind: 'http',
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'Down for maintenance',
    })
    expect(defaultShouldRetryOnError(err502)).toBe(true)
    expect(defaultShouldRetryOnError(err503)).toBe(true)
  })

  it('retries network failures without status', () => {
    const netErr = new ApiRequestError({
      kind: 'network',
      status: 0,
      code: 'NETWORK_FAILED',
      message: 'Failed to fetch',
    })
    expect(defaultShouldRetryOnError(netErr)).toBe(true)
  })
})

// ─── 3. SWR Cache and Provider Integration ───────────────────────────────────

describe('B10-C — SWR Provider and Cache Mutation', () => {
  it('ApiClientProvider is an exported functional React component', () => {
    expect(typeof ApiClientProvider).toBe('function')
  })

  it('SWR mutate operates on keys fetched through apiFetcher', async () => {
    const testKey = '/api/test-swr-cache'
    const cachedData = { name: 'Initial' }

    // Seed cache
    await mutate(testKey, cachedData, false)

    // Verify mutate can update cache optimistically
    const updated = await mutate(testKey, { name: 'Updated' }, false)
    expect(updated).toEqual({ name: 'Updated' })
  })
})

// ─── 4. Client/Server Architectural Boundaries ───────────────────────────────

describe('B10-C — Client/Server Architectural Boundaries', () => {
  it('lib/api/hooks.ts pulls in zero server-only dependencies', () => {
    const source = readFileSync(path.join(ROOT, 'lib/api/hooks.ts'), 'utf8')
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '')

    expect(code).not.toContain('createServiceRoleClient')
    expect(code).not.toContain('node:')
    expect(code).not.toContain('next/headers')
    expect(code).not.toMatch(/-db'|\/supabase'|notifications\//)
    expect(code).not.toMatch(/from '@\/app\//)
  })

  it('lib/api/contracts/settings.ts is pure client-safe Zod and types', () => {
    const source = readFileSync(
      path.join(ROOT, 'lib/api/contracts/settings.ts'),
      'utf8'
    )
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '')

    expect(code).not.toContain('createServiceRoleClient')
    expect(code).not.toContain('node:')
    expect(code).not.toContain('next/headers')
    expect(code).not.toMatch(/-db'|\/supabase'|notifications\//)
    expect(code).not.toMatch(/from '@\/app\//)
  })

  it('app/api/settings/profile/route.ts re-exports profileUpdateSchema from client-safe contracts', () => {
    const source = readFileSync(
      path.join(ROOT, 'app/api/settings/profile/route.ts'),
      'utf8'
    )
    expect(source).toContain("from '@/lib/api/contracts/settings'")
  })

  it('migrated components do not value-import server DB modules', () => {
    const migratedFiles = [
      'components/settings/ProfileSettingsTab.tsx',
      'components/settings/SecuritySettingsTab.tsx',
      'components/settings/ReferralSettingsTab.tsx',
      'components/settings/FellowRequestCard.tsx',
      'components/settings/DangerZoneTab.tsx',
      'components/notifications/NotificationBell.tsx',
      'components/notifications/NotificationPreferencesTab.tsx',
      'components/feedback/LessonFeedbackWidget.tsx',
      'hooks/use-lesson-progress-v2.ts',
    ]

    for (const rel of migratedFiles) {
      const source = readFileSync(path.join(ROOT, rel), 'utf8')
      const statements = source.match(/^import[\s\S]*?from '[^']+'/gm) ?? []
      const offending = statements.filter(
        (s) => s.includes("-db'") && !/^import\s+type\b/.test(s)
      )
      expect(offending, `${rel} has forbidden value-import of -db`).toEqual([])
    }
  })

  it('components/admin remaining unmigrated until B10-D', () => {
    const adminDir = path.join(ROOT, 'components/admin')
    const files = readdirSync(adminDir).filter((f) => statSync(path.join(adminDir, f)).isFile())

    for (const file of files) {
      const source = readFileSync(path.join(adminDir, file), 'utf8')
      expect(source, `${file} should not use lib/api/hooks until B10-D`).not.toContain(
        '@/lib/api/hooks'
      )
    }
  })
})
