/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Audit 2026-11-17 #2: the "request changes" loop must not go silent after the first round.
 *
 * One in-memory capstone row goes through the real submit and review code:
 * submit, request changes, resubmit, request changes again. The learner must get one
 * notification per reviewed revision, and the resubmission must sit in the admin
 * "awaiting review" segment (status 'submitted' AND reviewed_at IS NULL) until reviewed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const dispatchMock = vi.hoisted(() =>
  vi.fn<(event: unknown) => Promise<{ dispatched: boolean }>>(async () => ({ dispatched: true }))
)
vi.mock('@/lib/notifications/dispatcher', () => ({
  globalNotificationDispatcher: { dispatch: (e: unknown) => dispatchMock(e) },
}))
vi.mock('@/lib/notifications/events/connectors', () => ({ initializeNotificationConnectors: vi.fn() }))
vi.mock('@/lib/admin/guard', () => ({ logAdminAction: vi.fn(async () => {}) }))
vi.mock('@/lib/events/product-events', () => ({ trackProductEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/xp-service', () => ({ awardXp: vi.fn(async () => {}), hasXpEvent: vi.fn(async () => true) }))
vi.mock('@/lib/xp', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getRuntimeXpValues: vi.fn(async () => ({ CAPSTONE_SUBMITTED: 150 })),
}))
vi.mock('@/lib/streaks-db', () => ({ updateUserStreak: vi.fn(async () => {}) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { submitCapstoneAction } from '@/lib/capstones-db'
import { ModerationService } from '@/lib/admin/moderation-service'

const CONTENT = `
# Product Opportunity Brief: Customer Activation & Retention Improvement

## 1. Problem Statement
The user onboarding dropoff rate is currently 42% within the first 14 days. Customers report feeling overwhelmed by excessive initial configuration steps and lack of clear progress indicators. Solving this will unlock immediate customer retention and increase core product engagement.

## 2. Jobs-To-Be-Done (JTBD)
When a new product manager signs up for our workspace, they want a guided, friction-free onboarding checklist so that they can configure their first project dashboard in under 5 minutes without consulting engineering support.

## 3. Target Personas & User Segment
Our primary user is the Early Career Product Manager and Senior PM transitioning into SaaS. Their main operational constraint is limited setup time during intense work sprints. Secondary persona is the Associate PM learning foundational frameworks.

## 4. Success Metrics & Guardrails
- Primary Metric: 14-day user onboarding completion rate increases from 58% to 80%.
- Secondary Metric: Time to first completed project deliverable drops from 25 minutes to 6 minutes.
- Guardrail Metric: User support ticket submissions regarding setup must not exceed 3% of new signups.
`.repeat(2)

type Result = () => { data: unknown; error: unknown }

/**
 * A permissive chain: every builder call returns itself, awaiting it yields `result`, and
 * `single`/`maybeSingle` yield `singleResult` (defaults to `result`).
 */
function chain(result: Result, singleResult: Result = result): any {
  const c: any = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') return (resolve: any, reject: any) => Promise.resolve(result()).then(resolve, reject)
        if (prop === 'single' || prop === 'maybeSingle') return async () => singleResult()
        return () => c
      },
    }
  )
  return c
}

/** One capstone row shared by the learner submit path and the admin review path. */
function createDb(initial: Record<string, unknown>) {
  const row: Record<string, unknown> = { ...initial }
  const client: any = {
    rpc: async () => ({ data: null, error: null }),
    from: (table: string) => {
      if (table === 'users') {
        return chain(() => ({ data: { email: 'a@example.com', name: 'A', username: 'a', is_portfolio_public: false }, error: null }))
      }
      if (table !== 'capstone_submissions') return chain(() => ({ data: null, error: null }))
      return {
        select: () =>
          chain(
            () => ({ data: [{ ...row }], error: null }),
            () => ({ data: { ...row }, error: null })
          ),
        update: (payload: Record<string, unknown>) => {
          Object.assign(row, payload)
          return chain(
            () => ({ data: [{ ...row }], error: null }),
            () => ({ data: { ...row }, error: null })
          )
        },
      }
    },
  }
  return { client, row }
}

/** The admin queue's awaiting segment, as moderation-service filters it. */
const isAwaiting = (row: Record<string, unknown>) => row.status === 'submitted' && row.reviewed_at == null

describe('capstone resubmission loop (audit #2)', () => {
  beforeEach(() => dispatchMock.mockClear())

  it('notifies on every reviewed revision and puts the resubmission back in the awaiting queue', async () => {
    const { client, row } = createDb({
      id: 'sub-1',
      user_id: 'learner-1',
      module_slug: 'foundations',
      status: 'draft',
      is_public: false,
      content: CONTENT,
      submitted_at: '2026-11-01T00:00:00Z',
      reviewed_at: null,
      reviewed_by: null,
      revision_count: 0,
      review_history: [],
      review_scores: null,
      review_feedback: null,
    })
    const changes = { feedback: 'Tighten the success metrics.' }

    // Submit.
    expect((await submitCapstoneAction(client, 'learner-1', 'foundations', CONTENT)).success).toBe(true)
    expect(isAwaiting(row)).toBe(true)

    // Request changes (first review).
    expect(await ModerationService.reviewCapstone('admin-1', 'admin@x.test', 'sub-1', 'request_changes', changes, client)).toBe(true)
    expect(row.status).toBe('reviewed')
    expect(row.reviewed_at).toEqual(expect.any(String))
    expect(isAwaiting(row)).toBe(false)

    // Resubmit: back in the awaiting queue, previous review kept in history.
    expect((await submitCapstoneAction(client, 'learner-1', 'foundations', CONTENT)).success).toBe(true)
    expect(row.status).toBe('submitted')
    expect(row.revision_count).toBe(1)
    expect(row.reviewed_at).toBeNull()
    expect(row.reviewed_by).toBeNull()
    expect(isAwaiting(row)).toBe(true)
    expect((row.review_history as unknown[]).length).toBe(1)

    // Request changes again.
    expect(await ModerationService.reviewCapstone('admin-1', 'admin@x.test', 'sub-1', 'request_changes', changes, client)).toBe(true)
    expect(row.reviewed_at).toEqual(expect.any(String))
    expect(isAwaiting(row)).toBe(false)

    const reviewed = dispatchMock.mock.calls
      .map((call) => call[0] as any)
      .filter((event) => event.event === 'capstone.reviewed')
    expect(reviewed).toHaveLength(2)
    expect(reviewed.map((event) => event.id)).toEqual(['capstone-reviewed-sub-1', 'capstone-reviewed-sub-1-r1'])
    expect(reviewed.map((event) => event.payload.revisionCount)).toEqual([0, 1])
    expect(reviewed.every((event) => event.payload.action === 'request_changes')).toBe(true)
  })

  it('still notifies a resubmission saved before the resubmit path cleared reviewed_at', async () => {
    const { client } = createDb({
      id: 'sub-2',
      user_id: 'learner-1',
      module_slug: 'foundations',
      status: 'submitted',
      is_public: false,
      reviewed_at: '2026-11-02T00:00:00Z',
      revision_count: 1,
      review_history: [{ action: 'request_changes', reviewed_at: '2026-11-02T00:00:00Z' }],
    })

    expect(await ModerationService.reviewCapstone('admin-1', 'admin@x.test', 'sub-2', 'reject', { feedback: 'No.' }, client)).toBe(true)
    expect(dispatchMock).toHaveBeenCalledTimes(1)
    expect((dispatchMock.mock.calls[0][0] as any).id).toBe('capstone-reviewed-sub-2-r1')
  })

  it('a resubmission that is approved uses the published notice id', async () => {
    const { client } = createDb({
      id: 'sub-3',
      user_id: 'learner-1',
      module_slug: 'foundations',
      status: 'submitted',
      is_public: false,
      reviewed_at: null,
      revision_count: 1,
      review_history: [{ action: 'request_changes', reviewed_at: '2026-11-02T00:00:00Z' }],
    })

    expect(await ModerationService.reviewCapstone('admin-1', 'admin@x.test', 'sub-3', 'approve', {}, client)).toBe(true)
    expect(dispatchMock).toHaveBeenCalledTimes(1)
    expect((dispatchMock.mock.calls[0][0] as any).id).toBe('capstone-reviewed-sub-3-published')
  })
})
