import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  apiGet,
  apiPost,
  apiPatch,
  apiDelete,
  ApiRequestError,
  API_CLIENT_CODES,
} from '@/lib/api/client'

describe('CQ-30: Typed API Client & Error Envelope Normalization', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('normalizes successful 200 JSON responses', async () => {
    const mockResponse = new Response(JSON.stringify({ ok: true, data: { count: 42 } }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-request-id': 'req_123' },
    })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse)

    const result = await apiGet<{ ok: boolean; data: { count: number } }>('/api/metrics')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.data.count).toBe(42)
      expect(result.status).toBe(200)
      expect(result.requestId).toBe('req_123')
    }
  })

  it('maps standard 400 error envelope to structured ApiError', async () => {
    const errorBody = {
      success: false,
      error: 'Invalid parameter provided.',
      code: 'VALIDATION_FAILED',
      requestId: 'req_err_400',
    }
    const mockResponse = new Response(JSON.stringify(errorBody), {
      status: 400,
      headers: { 'content-type': 'application/json', 'x-request-id': 'req_err_400' },
    })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse)

    const result = await apiPost('/api/feedback', { text: '' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('http')
      expect(result.error.code).toBe('VALIDATION_FAILED')
      expect(result.error.message).toBe('Invalid parameter provided.')
      expect(result.error.status).toBe(400)
      expect(result.error.requestId).toBe('req_err_400')
    }
  })

  it('handles HTML / non-JSON responses with parse error kind', async () => {
    const mockResponse = new Response('<html>502 Bad Gateway</html>', {
      status: 502,
      headers: { 'content-type': 'text/html' },
    })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse)

    const result = await apiGet('/api/service')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('parse')
      expect(result.error.code).toBe(API_CLIENT_CODES.parse)
      expect(result.error.status).toBe(502)
    }
  })

  it('handles network / connectivity failures with network error kind', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))

    const result = await apiGet('/api/offline')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('network')
      expect(result.error.code).toBe(API_CLIENT_CODES.network)
      expect(result.error.status).toBe(0)
    }
  })

  it('supports ApiRequestError instantiation with full metadata', () => {
    const error = new ApiRequestError({
      kind: 'http',
      code: 'AUTH_REQUIRED',
      message: 'Sign in to access this resource.',
      status: 401,
      errorId: 'err_sec_99',
      requestId: 'req_auth_1',
    })

    expect(error.name).toBe('ApiRequestError')
    expect(error.message).toBe('Sign in to access this resource.')
    expect(error.code).toBe('AUTH_REQUIRED')
    expect(error.status).toBe(401)
    expect(error.errorId).toBe('err_sec_99')
    expect(error.requestId).toBe('req_auth_1')
    expect(error instanceof Error).toBe(true)
    expect(error instanceof ApiRequestError).toBe(true)
  })

  it('supports apiPatch and apiDelete methods', async () => {
    const mockPatchRes = new Response(JSON.stringify({ updated: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockPatchRes)

    await apiPatch('/api/settings', { theme: 'light' })
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/settings',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ theme: 'light' }),
      })
    )

    const mockDelRes = new Response(JSON.stringify({ deleted: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
    fetchSpy.mockResolvedValueOnce(mockDelRes)

    await apiDelete('/api/item/1')
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/item/1',
      expect.objectContaining({
        method: 'DELETE',
      })
    )
  })
})
