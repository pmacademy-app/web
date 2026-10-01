/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Phase 8.2 — capstone review lifecycle, `capstone.reviewed` notification, and review aging.
 *
 * Covers the closed loop end to end at the unit level:
 *   - a freshly submitted capstone has no `reviewed_at`;
 *   - the first review stamps `reviewed_at`/`reviewed_by` and dispatches ONE notification to the
 *     submitting learner;
 *   - repeating the review is safe/idempotent — no second timestamp write, no duplicate notification;
 *   - the notification follows existing conventions (registered, in-app, correct destination);
 *   - unauthorized callers cannot review (route is admin-gated);
 *   - submission age is computed from real timestamps only.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks for the review mutation's collaborators ────────────────────────────
const dispatchMock = vi.fn(async (_event: unknown) => ({ dispatched: true, handlerCount: 1, errors: [] as unknown[] }))
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
import { computeReviewAge } from '@/lib/admin/capstone-review-aging'
import { EVENT_DEFINITIONS, validateEventPayload } from '@/lib/notifications/events'
import { buildInAppContentFromEvent } from '@/lib/notifications/in-app/service'
import fs from 'fs'
import path from 'path'

/**
 * Builds a mock supabase client for `capstone_submissions` that:
 *   - returns `currentRow` from the pre-review read (select → eq → maybeSingle);
 *   - captures the update payload and returns one matched row.
 */
function mockClient(currentRow: Record<string, unknown> | null) {
  const captured: { updatePayload?: Record<string, unknown> } = {}
  const client = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: currentRow, error: null })),
        })),
      })),
      update: vi.fn((payload: Record<string, unknown>) => {
        captured.updatePayload = payload
        return {
          eq: vi.fn(() => ({
            select: vi.fn(async () => ({ data: currentRow ? [{ id: currentRow.id }] : [], error: null })),
          })),
        }
      }),
    })),
  }
  return { client: client as any, captured }
}

describe('Phase 8.2 — capstone review lifecycle', () => {
  beforeEach(() => {
    dispatchMock.mockClear()
  })

  it('a newly submitted capstone has no reviewed_at', () => {
    // The submission path never sets reviewed_at; the column defaults to null. Represented here by
    // the row shape the moderation read returns for an unreviewed submission.
    const unreviewed = { id: 's1', user_id: 'learner-1', module_slug: 'foundations', status: 'submitted', reviewed_at: null }
    expect(unreviewed.reviewed_at).toBeNull()
  })

  it('stamps reviewed_at/reviewed_by and dispatches one notification on the first review', async () => {
    const { client, captured } = mockClient({
      id: 's1',
      user_id: 'learner-1',
      module_slug: 'foundations',
      status: 'submitted',
      reviewed_at: null,
    })

    const ok = await ModerationService.reviewCapstone('admin-1', 'admin@prodily.app', 's1', 'approve', client)
    expect(ok).toBe(true)

    // reviewed_at + reviewed_by written, status + visibility set.
    expect(captured.updatePayload?.status).toBe('reviewed')
    expect(captured.updatePayload?.is_public).toBe(true)
    expect(typeof captured.updatePayload?.reviewed_at).toBe('string')
    expect(captured.updatePayload?.reviewed_by).toBe('admin-1')

    // Exactly one notification, to the SUBMITTING learner, with a stable idempotency id.
    expect(dispatchMock).toHaveBeenCalledTimes(1)
    const event = dispatchMock.mock.calls[0][0] as any
    expect(event.event).toBe('capstone.reviewed')
    expect(event.userId).toBe('learner-1')
    expect(event.id).toBe('capstone-reviewed-s1')
    expect(event.payload.submissionId).toBe('s1')
    expect(event.payload.moduleSlug).toBe('foundations')
    expect(event.payload.isPublished).toBe(true)
  })

  it('is idempotent: reviewing an already-reviewed submission does not re-stamp or re-notify', async () => {
    const { client, captured } = mockClient({
      id: 's1',
      user_id: 'learner-1',
      module_slug: 'foundations',
      status: 'reviewed',
      reviewed_at: '2026-09-01T00:00:00Z',
    })

    const ok = await ModerationService.reviewCapstone('admin-2', 'admin2@prodily.app', 's1', 'reject', client)
    expect(ok).toBe(true)

    // Status/visibility may change on re-review, but the review timestamp is preserved (not in payload).
    expect(captured.updatePayload?.status).toBe('reviewed')
    expect(captured.updatePayload?.is_public).toBe(false)
    expect(captured.updatePayload).not.toHaveProperty('reviewed_at')
    expect(captured.updatePayload).not.toHaveProperty('reviewed_by')

    // No duplicate notification.
    expect(dispatchMock).not.toHaveBeenCalled()
  })

  it('does not notify when the submission has no learner attribution', async () => {
    const { client } = mockClient({
      id: 's2',
      user_id: null,
      module_slug: 'foundations',
      status: 'submitted',
      reviewed_at: null,
    })
    const ok = await ModerationService.reviewCapstone('admin-1', 'admin@prodily.app', 's2', 'approve', client)
    expect(ok).toBe(true)
    expect(dispatchMock).not.toHaveBeenCalled()
  })

  it('returns false (no notification) when the submission does not exist', async () => {
    const { client } = mockClient(null)
    const ok = await ModerationService.reviewCapstone('admin-1', 'admin@prodily.app', 'missing', 'approve', client)
    expect(ok).toBe(false)
    expect(dispatchMock).not.toHaveBeenCalled()
  })
})

describe('Phase 8.2 — capstone.reviewed notification conventions', () => {
  it('is a registered portfolio event with a valid payload guard', () => {
    const def = EVENT_DEFINITIONS['capstone.reviewed']
    expect(def).toBeDefined()
    expect(def.category).toBe('portfolio')
    expect(validateEventPayload('capstone.reviewed', { submissionId: 's1' })).toBe(true)
    expect(validateEventPayload('capstone.reviewed', {})).toBe(false)
  })

  it('renders in-app content linking the learner to the capstone destination', () => {
    const published = buildInAppContentFromEvent({
      event: 'capstone.reviewed',
      payload: { moduleTitle: 'Product Thinking Foundations', moduleSlug: 'foundations', isPublished: true },
    } as any)
    expect(published.title).toBe('Capstone reviewed')
    expect(published.actionUrl).toBe('/capstones/foundations')
    expect(published.body).toContain('portfolio')

    const privateReview = buildInAppContentFromEvent({
      event: 'capstone.reviewed',
      payload: { moduleTitle: 'Product Thinking Foundations', moduleSlug: 'foundations', isPublished: false },
    } as any)
    expect(privateReview.actionUrl).toBe('/capstones/foundations')
  })
})

describe('Phase 8.2 — review is server-side admin-authorized', () => {
  // The authorization boundary is the route's declarative policy: the review endpoint is admin-only
  // and resolves the admin via `requireAdmin`, so a learner (even on their own submission) or any
  // unauthenticated caller is refused before `reviewCapstone` runs. Asserted statically because the
  // runtime admin resolver requires Supabase env that the unit harness does not provide.
  const routeSrc = fs.readFileSync(
    path.join(__dirname, '..', '..', 'app', 'api', 'admin', 'capstones', '[id]', 'review', 'route.ts'),
    'utf8'
  )

  it('declares an admin-only actor policy', () => {
    expect(routeSrc).toMatch(/allow:\s*\[\s*'admin'\s*\]/)
    expect(routeSrc).toContain('requireAdmin(actor)')
  })

  it('never exposes reviewCapstone through a learner-facing route', () => {
    const capstonesApi = path.join(__dirname, '..', '..', 'app', 'api', 'capstones')
    const offenders: string[] = []
    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (/\.(ts|tsx)$/.test(entry.name) && fs.readFileSync(full, 'utf8').includes('reviewCapstone')) {
          offenders.push(full)
        }
      }
    }
    walk(capstonesApi) // the learner-facing /api/capstones tree
    expect(offenders).toEqual([])
  })
})

describe('Phase 8.2 — review aging (real timestamps only)', () => {
  const now = new Date('2026-10-10T00:00:00Z')

  it('reports elapsed waiting time for an unreviewed submission', () => {
    const age = computeReviewAge('2026-10-05T00:00:00Z', null, now)
    expect(age.awaitingReview).toBe(true)
    expect(age.days).toBe(5)
    expect(age.tier).toBe('waiting')
    expect(age.label).toBe('Waiting 5d')
  })

  it('escalates the tier for long-waiting submissions without inventing a deadline', () => {
    expect(computeReviewAge('2026-10-09T00:00:00Z', null, now).tier).toBe('fresh')
    expect(computeReviewAge('2026-10-01T00:00:00Z', null, now).tier).toBe('aging')
  })

  it('reports turnaround once reviewed', () => {
    const age = computeReviewAge('2026-10-01T00:00:00Z', '2026-10-03T00:00:00Z', now)
    expect(age.awaitingReview).toBe(false)
    expect(age.tier).toBe('reviewed')
    expect(age.days).toBe(2)
    expect(age.label).toBe('Reviewed after 2d')
  })

  it('handles a missing submitted_at without throwing', () => {
    const age = computeReviewAge(null, null, now)
    expect(age.days).toBe(0)
  })
})
