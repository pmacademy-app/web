/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Growth R1 / Task 7 — `fellow.granted` typed, idempotent event.
 *
 * - The event is registered and routed in-app (with a portfolio deep link).
 * - The grant and fellow-request review paths that dispatch it live in the admin console
 *   repository and are tested there.
 *
 * The email side (Task 9) lives in fellow-granted-email.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { enqueueSpy, createInAppSpy } = vi.hoisted(() => ({
  enqueueSpy: vi.fn(),
  createInAppSpy: vi.fn(),
}))

// Isolation only: the connector tests below run the real dispatcher, and any other handler
// registered for the event must not reach the real queue. Nothing here asserts on it.
vi.mock('@/lib/notifications/queue/processor', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, enqueueNotificationItem: (...args: unknown[]) => enqueueSpy(...args) }
})

vi.mock('@/lib/notifications/in-app/service', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, createInAppNotification: (...args: unknown[]) => createInAppSpy(...args) }
})

import { globalNotificationDispatcher } from '@/lib/notifications/dispatcher'
import { initializeNotificationConnectors } from '@/lib/notifications/events/connectors'
import { EVENT_DEFINITIONS, validateEventPayload } from '@/lib/notifications/events'
import { buildInAppContentFromEvent } from '@/lib/notifications/in-app/service'

function envelope(event: string, payload: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  return {
    id: `${event}-evt`,
    event,
    userId: 'user-1',
    userEmail: 'jordan@example.com',
    userName: 'Jordan PM',
    userTimezone: 'UTC',
    priority: 'high',
    category: 'achievements',
    occurredAt: '2026-10-09T00:00:00.000Z',
    payload,
    ...overrides,
  } as any
}

let dispatchSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  enqueueSpy.mockReset().mockResolvedValue({ success: true, queueId: 'q-1' })
  createInAppSpy.mockReset().mockResolvedValue({ success: true, id: 'n-1' })
  dispatchSpy = vi
    .spyOn(globalNotificationDispatcher, 'dispatch')
    .mockResolvedValue({ dispatched: true, handlerCount: 2, errors: [] })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('fellow.granted event definition', () => {
  it('is a registered achievements event with a payload guard', () => {
    const def = EVENT_DEFINITIONS['fellow.granted']
    expect(def).toBeDefined()
    expect(def.category).toBe('achievements')
    expect(def.defaultPriority).toBe('high')

    const grantedAt = '2026-10-09T00:00:00.000Z'
    expect(validateEventPayload('fellow.granted', { username: 'jordanpm', isPortfolioPublic: true, portfolioUrl: 'x', grantedAt })).toBe(true)
    expect(validateEventPayload('fellow.granted', { username: null, isPortfolioPublic: false, portfolioUrl: null, grantedAt })).toBe(true)
    expect(validateEventPayload('fellow.granted', { username: 'jordanpm' })).toBe(false)
    expect(validateEventPayload('fellow.granted', { username: 42, grantedAt })).toBe(false)
    expect(validateEventPayload('fellow.granted', null)).toBe(false)
  })
})

describe('fellow.granted in-app content', () => {
  it('deep-links to the public portfolio when it is public', () => {
    const content = buildInAppContentFromEvent(envelope('fellow.granted', { username: 'jordanpm', isPortfolioPublic: true }))
    expect(content.title).toBe('You are now a PM Fellow!')
    expect(content.body).toBe('Congratulations! Your PM Fellow badge is now live on your public portfolio.')
    expect(content.actionUrl).toBe('/p/jordanpm')
  })

  it('falls back to portfolio settings without a username or public portfolio', () => {
    expect(buildInAppContentFromEvent(envelope('fellow.granted', { username: null, isPortfolioPublic: true })).actionUrl).toBe(
      '/settings?tab=portfolio'
    )
    expect(
      buildInAppContentFromEvent(envelope('fellow.granted', { username: 'jordanpm', isPortfolioPublic: false })).actionUrl
    ).toBe('/settings?tab=portfolio')
  })
})

describe('fellow.granted in-app connector', () => {
  const payload = {
    username: 'jordanpm',
    isPortfolioPublic: true,
    portfolioUrl: 'https://prodily.example/p/jordanpm',
    grantedAt: '2026-10-09T00:00:00.000Z',
  }

  it('registers an in-app handler', () => {
    initializeNotificationConnectors(true)
    const ids = globalNotificationDispatcher.getRegisteredHandlerIds('fellow.granted')
    expect(ids).toContain('connector.in_app.fellow.granted')
  })

  it('writes the in-app row under the per-grant event id', async () => {
    dispatchSpy.mockRestore()
    initializeNotificationConnectors(true)

    const result = await globalNotificationDispatcher.dispatch(
      envelope('fellow.granted', payload, { id: 'fellow-granted-user-1-1791590400000' })
    )
    expect(result.errors).toEqual([])

    expect(createInAppSpy).toHaveBeenCalledTimes(1)
    const inApp = createInAppSpy.mock.calls[0][0] as any
    expect(inApp.idempotencyKey).toBe('fellow-granted-user-1-1791590400000')
    expect(inApp.category).toBe('achievements')
    expect(inApp.actionUrl).toBe('/p/jordanpm')
  })
})
