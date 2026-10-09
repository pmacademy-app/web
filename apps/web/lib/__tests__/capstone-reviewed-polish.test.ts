/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Growth R1 / Task 8 — `capstone.reviewed` carries the real recipient and links a published
 * review to the learner's public portfolio.
 *
 * - The dispatch resolves the learner's email/name/username/portfolio visibility with one
 *   extra `users` lookup, and degrades to the old placeholders if that lookup fails.
 * - A published review deep-links to `/p/<username>` only when the portfolio is public;
 *   every other case keeps `/capstones/<slug>`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const dispatchMock = vi.fn(async (event: unknown) => {
  void event
  return { dispatched: true, handlerCount: 1, errors: [] as unknown[] }
})
vi.mock('@/lib/notifications/dispatcher', () => ({
  globalNotificationDispatcher: { dispatch: (e: unknown) => dispatchMock(e) },
}))
vi.mock('@/lib/notifications/events/connectors', () => ({
  initializeNotificationConnectors: vi.fn(),
}))
vi.mock('@/lib/admin/guard', () => ({
  logAdminAction: vi.fn(async () => {}),
}))

import { ModerationService } from '@/lib/admin/moderation-service'
import { buildInAppContentFromEvent } from '@/lib/notifications/in-app/service'
import { validateEventPayload } from '@/lib/notifications/events'

const submission = { id: 's1', user_id: 'learner-1', module_slug: 'foundations', status: 'submitted', reviewed_at: null }

/** Table-aware client: capstone_submissions read/update, plus a `users` lookup. */
function client(usersResult: { data: unknown; error: unknown } | (() => never)) {
  const userSelects: string[] = []
  const c = {
    from: vi.fn((table: string) => {
      if (table === 'users') {
        return {
          select: vi.fn((cols: string) => {
            userSelects.push(cols)
            return {
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => {
                  if (typeof usersResult === 'function') return usersResult()
                  return usersResult
                }),
              })),
            }
          }),
        }
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: submission, error: null })) })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(() => ({ select: vi.fn(async () => ({ data: [{ id: 's1' }], error: null })) })),
        })),
      }
    }),
  }
  return { client: c as any, userSelects }
}

describe('capstone.reviewed dispatch carries the real recipient', () => {
  beforeEach(() => {
    dispatchMock.mockClear()
  })

  it('passes real email/name and portfolio fields from one users lookup', async () => {
    const { client: c, userSelects } = client({
      data: { email: 'learner@example.com', name: 'Riya Learner', username: 'riyapm', is_portfolio_public: true },
      error: null,
    })

    expect(await ModerationService.reviewCapstone('admin-1', 'admin@prodily.app', 's1', 'approve', c)).toBe(true)

    expect(userSelects).toEqual(['email, name, username, is_portfolio_public'])
    expect(dispatchMock).toHaveBeenCalledTimes(1)
    const event = dispatchMock.mock.calls[0][0] as any
    expect(event.id).toBe('capstone-reviewed-s1')
    expect(event.userEmail).toBe('learner@example.com')
    expect(event.userName).toBe('Riya Learner')
    expect(event.payload.username).toBe('riyapm')
    expect(event.payload.isPortfolioPublic).toBe(true)
    expect(event.payload.isPublished).toBe(true)
    expect(validateEventPayload('capstone.reviewed', event.payload)).toBe(true)
  })

  it('falls back to placeholders when the users row is missing', async () => {
    const { client: c } = client({ data: null, error: null })
    expect(await ModerationService.reviewCapstone('admin-1', 'admin@prodily.app', 's1', 'approve', c)).toBe(true)
    const event = dispatchMock.mock.calls[0][0] as any
    expect(event.userEmail).toBe('')
    expect(event.userName).toBe('Learner')
    expect(event.payload.username).toBeNull()
    expect(event.payload.isPortfolioPublic).toBe(false)
  })

  it('still dispatches when the users lookup throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client: c } = client(() => {
      throw new Error('users lookup failed')
    })
    expect(await ModerationService.reviewCapstone('admin-1', 'admin@prodily.app', 's1', 'reject', c)).toBe(true)
    expect(dispatchMock).toHaveBeenCalledTimes(1)
    const event = dispatchMock.mock.calls[0][0] as any
    expect(event.userName).toBe('Learner')
    expect(event.payload.isPublished).toBe(false)
    errorSpy.mockRestore()
  })
})

describe('capstone.reviewed in-app deep link', () => {
  const build = (payload: Record<string, unknown>) =>
    buildInAppContentFromEvent({ event: 'capstone.reviewed', payload } as any)

  it('links a published review to the public portfolio', () => {
    const content = build({ moduleTitle: 'Foundations', moduleSlug: 'foundations', isPublished: true, username: 'riyapm', isPortfolioPublic: true })
    expect(content.actionUrl).toBe('/p/riyapm')
    expect(content.body).toBe('The Prodily team reviewed your Foundations capstone and published it to your portfolio.')
  })

  it('keeps the capstone link when published without a username or with a private portfolio', () => {
    expect(build({ moduleSlug: 'foundations', isPublished: true }).actionUrl).toBe('/capstones/foundations')
    expect(build({ moduleSlug: 'foundations', isPublished: true, username: 'riyapm', isPortfolioPublic: false }).actionUrl).toBe(
      '/capstones/foundations'
    )
  })

  it('keeps the capstone link for a rejected (not published) review', () => {
    expect(
      build({ moduleSlug: 'foundations', isPublished: false, username: 'riyapm', isPortfolioPublic: true }).actionUrl
    ).toBe('/capstones/foundations')
  })
})
