import { describe, it, expect, vi, beforeEach } from 'vitest'

// Growth R5 / B5: a published capstone review sends one email (per submission) with a portfolio
// share when the portfolio is public. Rejections and unpublished reviews send none.

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

const SUBMISSION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function envelope(payload: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  return {
    id: `capstone-reviewed-${SUBMISSION}`,
    event: 'capstone.reviewed',
    userId: 'user-1',
    userEmail: 'jordan@example.com',
    userName: 'Jordan PM',
    userTimezone: 'UTC',
    priority: 'medium',
    category: 'portfolio',
    occurredAt: '2026-10-09T00:00:00.000Z',
    payload,
    ...overrides,
  } as never
}

const published = {
  submissionId: SUBMISSION,
  moduleSlug: 'discovery',
  moduleTitle: 'Users, Problems & Discovery',
  isPublished: true,
  username: 'jordanpm',
  isPortfolioPublic: true,
}

const capstoneEmails = () =>
  enqueueSpy.mock.calls
    .map((call) => call[0] as Record<string, unknown>)
    .filter((params) => params.templateKey === 'achievement.capstone_published')

beforeEach(() => {
  enqueueSpy.mockReset().mockResolvedValue({ success: true, queueId: 'q-1' })
  createInAppSpy.mockReset().mockResolvedValue({ success: true, id: 'n-1' })
  initializeNotificationConnectors(true)
})

describe('capstone.reviewed email connector', () => {
  it('enqueues one email per published submission, with the portfolio for a public one', async () => {
    await globalNotificationDispatcher.dispatch(envelope(published))

    expect(capstoneEmails()).toHaveLength(1)
    expect(capstoneEmails()[0]).toMatchObject({
      toEmail: 'jordan@example.com',
      idempotencyKey: `capstone-published-email-${SUBMISSION}`,
      templateVariables: {
        moduleTitle: 'Users, Problems & Discovery',
        portfolioUrl: expect.stringMatching(/\/p\/jordanpm$/),
        capstoneUrl: expect.stringMatching(/\/capstones\/discovery$/),
      },
    })
  })

  it('sends no portfolio link for a private portfolio', async () => {
    await globalNotificationDispatcher.dispatch(envelope({ ...published, isPortfolioPublic: false }))
    expect((capstoneEmails()[0].templateVariables as Record<string, unknown>).portfolioUrl).toBeNull()
  })

  it.each([
    ['an unpublished review', { ...published, isPublished: false }],
    ['a missing submission id', { ...published, submissionId: undefined }],
  ])('sends nothing for %s', async (_label, payload) => {
    await globalNotificationDispatcher.dispatch(envelope(payload))
    expect(capstoneEmails()).toHaveLength(0)
  })

  it('sends nothing without an email address', async () => {
    await globalNotificationDispatcher.dispatch(envelope(published, { userEmail: '' }))
    expect(capstoneEmails()).toHaveLength(0)
  })
})

describe('CapstonePublished template', () => {
  it('is registered, with an enabled non-critical automation', () => {
    expect(EMAIL_TEMPLATE_MAP['achievement.capstone_published']).toBeDefined()
    expect(AUTOMATION_METADATA.find((a) => a.key === 'achievement.capstone_published')).toMatchObject({ isCritical: false })
    expect(DEFAULT_AUTOMATION_TOGGLES['achievement.capstone_published']).toBe(true)
  })

  it('offers share links and the portfolio for a public portfolio', async () => {
    const { html, text, subject } = await renderEmailTemplate('achievement.capstone_published', {
      userName: 'Jordan PM',
      moduleTitle: 'Discovery',
      portfolioUrl: 'https://prodily.example/p/jordanpm',
      capstoneUrl: 'https://prodily.example/capstones/discovery',
    })
    expect(subject).toBe('Your capstone is published')
    expect(text).toContain('Share on LinkedIn')
    expect(text).toContain('View on your portfolio')
    expect(html).toContain(encodeURIComponent('utm_campaign=capstone_published_email'))
  })

  it('points to the capstone and asks to publish for a private portfolio', async () => {
    const { text } = await renderEmailTemplate('achievement.capstone_published', {
      userName: 'Jordan PM',
      moduleTitle: 'Discovery',
      portfolioUrl: null,
      capstoneUrl: 'https://prodily.example/capstones/discovery',
    })
    expect(text).not.toContain('Share on LinkedIn')
    expect(text).toContain('View your capstone')
    expect(text).toContain('Make your portfolio public')
  })
})

// Growth R5 / B13b: the email opens and shares the capstone's own page when it is public.
describe('CapstonePublished case-study link', () => {
  it('passes the case-study page for a public portfolio', async () => {
    await globalNotificationDispatcher.dispatch(envelope(published))
    expect((capstoneEmails()[0].templateVariables as Record<string, unknown>).casePageUrl).toMatch(
      /\/p\/jordanpm\/capstones\/discovery$/,
    )
  })

  it('renders "View your case study" and shares that page', async () => {
    const { html, text } = await renderEmailTemplate('achievement.capstone_published', {
      userName: 'Jordan PM',
      moduleTitle: 'Discovery',
      portfolioUrl: 'https://prodily.example/p/jordanpm',
      casePageUrl: 'https://prodily.example/p/jordanpm/capstones/discovery',
      capstoneUrl: 'https://prodily.example/capstones/discovery',
    })
    expect(text).toContain('View your case study')
    expect(html).toContain(encodeURIComponent('https://prodily.example/p/jordanpm/capstones/discovery'))
  })
})
