/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * B9-A — out-of-band critical alerting (F-REL-4).
 *
 * Before this, a critical incident's only alert was an in-app notification written into
 * the same database the incident was reporting on.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  buildAlertPayload,
  deliverOutOfBandAlert,
  ALERT_HTTP_TIMEOUT_MS,
  type OutOfBandAlert,
} from '../monitoring/out-of-band-alert'

const ALERT: OutOfBandAlert = {
  incidentId: 'inc_123',
  severity: 'critical',
  kind: 'db_unavailable',
  domain: 'db',
  operation: 'leaderboard.weekly_xp_events',
  message: 'Weekly leaderboard XP events query failed',
  nextAction: 'Check Supabase availability and connection limits.',
  fingerprint: 'fp_abc',
}

const originalFetch = global.fetch
const originalUrl = process.env.ALERT_WEBHOOK_URL

beforeEach(() => {
  vi.restoreAllMocks()
  delete process.env.ALERT_WEBHOOK_URL
})

afterEach(() => {
  global.fetch = originalFetch
  if (originalUrl === undefined) delete process.env.ALERT_WEBHOOK_URL
  else process.env.ALERT_WEBHOOK_URL = originalUrl
})

describe('B9-A · buildAlertPayload', () => {
  it('renders a text field most chat webhooks can display directly', () => {
    const payload = buildAlertPayload(ALERT) as any
    expect(payload.text).toContain('[CRITICAL]')
    expect(payload.text).toContain('db_unavailable')
    expect(payload.text).toContain('leaderboard.weekly_xp_events')
    expect(payload.text).toContain('inc_123')
  })

  it('carries the structured fields alongside the text', () => {
    const payload = buildAlertPayload(ALERT) as any
    expect(payload.incidentId).toBe('inc_123')
    expect(payload.kind).toBe('db_unavailable')
    expect(payload.domain).toBe('db')
    expect(payload.fingerprint).toBe('fp_abc')
  })

  it('adds no field the incident did not already carry', () => {
    // Redaction (ADR-005) runs upstream. A field invented here would bypass it.
    const payload = buildAlertPayload(ALERT) as any
    const allowed = new Set([
      'text', 'incidentId', 'severity', 'kind', 'domain',
      'operation', 'message', 'nextAction', 'fingerprint',
    ])
    for (const key of Object.keys(payload)) expect(allowed.has(key)).toBe(true)
  })

  it('omits the guidance line when the incident has none', () => {
    const payload = buildAlertPayload({ ...ALERT, nextAction: null }) as any
    expect(payload.text).not.toContain('Next:')
  })
})

describe('B9-A · deliverOutOfBandAlert', () => {
  it('does nothing and reports why when no channel is configured', async () => {
    const fetchSpy = vi.fn()
    global.fetch = fetchSpy as any

    await expect(deliverOutOfBandAlert(ALERT)).resolves.toEqual({
      delivered: false,
      reason: 'not_configured',
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('posts the alert to the configured channel', async () => {
    process.env.ALERT_WEBHOOK_URL = 'https://hooks.example.com/abc'
    const fetchSpy = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }))
    global.fetch = fetchSpy as any

    await expect(deliverOutOfBandAlert(ALERT)).resolves.toEqual({ delivered: true })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://hooks.example.com/abc')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body).incidentId).toBe('inc_123')
  })

  it('bounds the request so a hung channel cannot stall the incident path', async () => {
    process.env.ALERT_WEBHOOK_URL = 'https://hooks.example.com/abc'
    const fetchSpy = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }))
    global.fetch = fetchSpy as any

    await deliverOutOfBandAlert(ALERT)
    expect(fetchSpy.mock.calls[0][1].signal).toBeDefined()
    expect(ALERT_HTTP_TIMEOUT_MS).toBe(8000)
  })

  it('refuses a plaintext http:// channel rather than sending in the clear', async () => {
    process.env.ALERT_WEBHOOK_URL = 'http://hooks.example.com/abc'
    const fetchSpy = vi.fn()
    global.fetch = fetchSpy as any

    await expect(deliverOutOfBandAlert(ALERT)).resolves.toEqual({
      delivered: false,
      reason: 'not_configured',
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('treats a malformed URL as unconfigured instead of throwing', async () => {
    process.env.ALERT_WEBHOOK_URL = 'not-a-url'
    global.fetch = vi.fn() as any

    await expect(deliverOutOfBandAlert(ALERT)).resolves.toEqual({
      delivered: false,
      reason: 'not_configured',
    })
  })

  it('swallows a channel rejection', async () => {
    process.env.ALERT_WEBHOOK_URL = 'https://hooks.example.com/abc'
    global.fetch = vi.fn().mockResolvedValue(new Response('nope', { status: 500 })) as any

    await expect(deliverOutOfBandAlert(ALERT)).resolves.toEqual({
      delivered: false,
      reason: 'failed',
    })
  })

  it('swallows a network failure and never rejects', async () => {
    process.env.ALERT_WEBHOOK_URL = 'https://hooks.example.com/abc'
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as any

    await expect(deliverOutOfBandAlert(ALERT)).resolves.toEqual({
      delivered: false,
      reason: 'failed',
    })
  })

  it('swallows a timeout abort', async () => {
    process.env.ALERT_WEBHOOK_URL = 'https://hooks.example.com/abc'
    const abort = new Error('The operation was aborted due to timeout')
    abort.name = 'TimeoutError'
    global.fetch = vi.fn().mockRejectedValue(abort) as any

    await expect(deliverOutOfBandAlert(ALERT)).resolves.toEqual({
      delivered: false,
      reason: 'failed',
    })
  })
})
