/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Growth R1 / Task 9 — the `fellow.granted` email.
 *
 * - The event is routed by email (`achievement.fellow_granted`, idempotent per user) and is
 *   skipped when the learner has no email address.
 * - The template is registered, renders its subject and portfolio CTA, and is exposed as a
 *   non-critical transactional automation.
 *
 * The event itself (definition, grant transition, in-app content) is covered by
 * fellow-granted-event.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { enqueueSpy, createInAppSpy } = vi.hoisted(() => ({
  enqueueSpy: vi.fn(),
  createInAppSpy: vi.fn(),
}))

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
import { EMAIL_TEMPLATE_MAP, renderEmailTemplate } from '@/emails'
import { AUTOMATION_METADATA, DEFAULT_AUTOMATION_TOGGLES } from '@/lib/notifications/automations/service'
import { BRAND } from '@/lib/brand'

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

beforeEach(() => {
  enqueueSpy.mockReset().mockResolvedValue({ success: true, queueId: 'q-1' })
  createInAppSpy.mockReset().mockResolvedValue({ success: true, id: 'n-1' })
})

describe('fellow.granted email connector', () => {
  const payload = {
    username: 'jordanpm',
    isPortfolioPublic: true,
    portfolioUrl: 'https://prodily.example/p/jordanpm',
    grantedAt: '2026-10-09T00:00:00.000Z',
  }

  it('registers an email handler', () => {
    initializeNotificationConnectors(true)
    const ids = globalNotificationDispatcher.getRegisteredHandlerIds('fellow.granted')
    expect(ids).toContain('connector.achievement.fellow_granted')
  })

  it('enqueues one idempotent achievement.fellow_granted email', async () => {
    initializeNotificationConnectors(true)

    const result = await globalNotificationDispatcher.dispatch(
      envelope('fellow.granted', payload, { id: 'fellow-granted-user-1-1791590400000' })
    )
    expect(result.errors).toEqual([])

    const emails = enqueueSpy.mock.calls.map((c) => c[0] as any).filter((p) => p.templateKey === 'achievement.fellow_granted')
    expect(emails).toHaveLength(1)
    expect(emails[0]).toMatchObject({
      userId: 'user-1',
      toEmail: 'jordan@example.com',
      toName: 'Jordan PM',
      channel: 'email',
      category: 'achievements',
      priorityLevel: 'high',
      // Keyed by the per-grant event id: a retry is deduplicated, a re-grant is emailed again.
      idempotencyKey: 'fellow-granted:fellow-granted-user-1-1791590400000',
      eventId: 'fellow-granted-user-1-1791590400000',
      eventType: 'fellow.granted',
      templateVariables: { userName: 'Jordan PM', username: 'jordanpm', portfolioUrl: payload.portfolioUrl },
    })
  })

  it('skips the email when the learner has no email address', async () => {
    initializeNotificationConnectors(true)

    await globalNotificationDispatcher.dispatch(envelope('fellow.granted', payload, { userEmail: '' }))

    expect(enqueueSpy.mock.calls.some((c) => (c[0] as any).templateKey === 'achievement.fellow_granted')).toBe(false)
    expect(createInAppSpy).toHaveBeenCalledTimes(1)
  })
})

describe('achievement.fellow_granted email + automation', () => {
  it('is registered in the template map with the Fellow subject', () => {
    expect(EMAIL_TEMPLATE_MAP['achievement.fellow_granted']).toBeDefined()
    expect(EMAIL_TEMPLATE_MAP['achievement.fellow_granted'].subjectLine).toBe(`You're now a ${BRAND.company} PM Fellow!`)
  })

  it('renders the subject and the portfolio CTA', async () => {
    const portfolioUrl = 'https://prodily.example/p/jordanpm'
    const { html, text, subject } = await renderEmailTemplate('achievement.fellow_granted', {
      userName: 'Jordan PM',
      username: 'jordanpm',
      portfolioUrl,
    })
    expect(subject).toBe(`You're now a ${BRAND.company} PM Fellow!`)
    expect(html).toContain(`href="${portfolioUrl}"`)
    expect(text).toContain('View your Fellow portfolio')
    expect(text).toContain('Jordan PM')
    expect(text).not.toMatch(/credential/i)
  })

  it('is a non-critical transactional automation enabled by default', () => {
    const meta = AUTOMATION_METADATA.find((a) => a.key === 'achievement.fellow_granted')
    expect(meta).toMatchObject({ name: 'PM Fellow Granted', category: 'Transactional', isCritical: false })
    expect(DEFAULT_AUTOMATION_TOGGLES['achievement.fellow_granted']).toBe(true)
  })
})
