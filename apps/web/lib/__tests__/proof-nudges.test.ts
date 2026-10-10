import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'
import type { ProofState } from '@/lib/growth/proof-state'

// Growth R5 / B6, B7: "make your portfolio public" and "you qualify for PM Fellow" nudges.
// Once, plus one reminder after seven days; a stable 30% holdout per nudge; dry runs write nothing.

const mocks = vi.hoisted(() => ({
  enqueue: vi.fn(),
  createInApp: vi.fn(),
  automationEnabled: vi.fn(),
  holdout: vi.fn(),
  loadProofStates: vi.fn(),
}))
vi.mock('@/lib/notifications/queue/processor', () => ({ enqueueNotificationItem: mocks.enqueue }))
vi.mock('@/lib/notifications/in-app/service', () => ({ createInAppNotification: mocks.createInApp }))
vi.mock('@/lib/notifications/automations/service', () => ({
  EmailAutomationsService: { isAutomationEnabled: mocks.automationEnabled },
}))
vi.mock('@/lib/notifications/lifecycle/holdout', () => ({ isLifecycleHoldout: mocks.holdout }))
vi.mock('@/lib/growth/proof-state-db', () => ({ loadProofStates: mocks.loadProofStates }))

import { applicableNudges, nudgeRoundDue, NUDGE_REMINDER_AFTER_MS } from '@/lib/growth/proof-nudges'
import { runProofNudgesForPage } from '@/lib/growth/proof-nudges-run'

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const NOW = new Date('2026-10-20T09:00:00Z')
const DAY = 24 * 60 * 60 * 1000

const state = (overrides: Partial<ProofState> = {}): ProofState => ({
  portfolio: { isPublic: false, readyButPrivate: true, readinessPercent: 86 },
  fellowState: 'not_eligible',
  latestFellowRequestStatus: null,
  nextCapstone: null,
  certificate: { completedLessons: 40, totalLessons: 90, earned: false },
  ...overrides,
})

describe('applicableNudges', () => {
  it('nudges a ready private portfolio first, then Fellow eligibility', () => {
    expect(applicableNudges(state({ fellowState: 'eligible' }))).toEqual(['nudge.portfolio_ready', 'nudge.fellow_eligible'])
  })

  it('never nudges a learner whose Fellow request was rejected', () => {
    expect(
      applicableNudges(state({ portfolio: { isPublic: true, readyButPrivate: false, readinessPercent: 100 }, fellowState: 'eligible', latestFellowRequestStatus: 'rejected' })),
    ).toEqual([])
  })
})

describe('nudgeRoundDue', () => {
  it('sends the first round, then a reminder only after seven days, then nothing', () => {
    expect(nudgeRoundDue({ sentAt: null, remindedAt: null, heldOut: false }, NOW)).toBe('initial')
    expect(nudgeRoundDue({ sentAt: new Date(NOW.getTime() - 6 * DAY).toISOString(), remindedAt: null, heldOut: false }, NOW)).toBeNull()
    expect(
      nudgeRoundDue({ sentAt: new Date(NOW.getTime() - NUDGE_REMINDER_AFTER_MS).toISOString(), remindedAt: null, heldOut: false }, NOW),
    ).toBe('reminder')
    expect(nudgeRoundDue({ sentAt: '2026-10-01T00:00:00Z', remindedAt: '2026-10-08T00:00:00Z', heldOut: false }, NOW)).toBeNull()
    expect(nudgeRoundDue({ sentAt: null, remindedAt: null, heldOut: true }, NOW)).toBeNull()
  })
})

describe('runProofNudgesForPage', () => {
  let events: Array<Record<string, unknown>>
  let historyFails: boolean

  const client = () =>
    ({
      from(table: string) {
        if (table !== 'notification_events') throw new Error(`unexpected table ${table}`)
        const chain: Record<string, unknown> = {}
        chain.select = () => chain
        chain.in = () => chain
        chain.then = (resolve: (v: unknown) => unknown) =>
          Promise.resolve(historyFails ? { data: null, error: { message: 'down' } } : { data: events, error: null }).then(resolve)
        chain.insert = (row: Record<string, unknown>) => {
          events.push(row)
          return Promise.resolve({ error: null })
        }
        return chain
      },
    }) as unknown as SupabaseClient<Database>

  const candidate = { id: USER, email: 'ada@example.test', name: 'Ada' }
  const run = (opts: { dryRun?: boolean; now?: Date } = {}) =>
    runProofNudgesForPage(client(), [candidate], { now: opts.now ?? NOW, dryRun: opts.dryRun })

  beforeEach(() => {
    events = []
    historyFails = false
    for (const fn of Object.values(mocks)) fn.mockReset()
    mocks.automationEnabled.mockResolvedValue(true)
    mocks.holdout.mockReturnValue(false)
    mocks.enqueue.mockResolvedValue({ success: true })
    mocks.createInApp.mockResolvedValue({ success: true })
    mocks.loadProofStates.mockResolvedValue(new Map([[USER, state()]]))
  })

  it('sends one nudge (in-app and email) and records it', async () => {
    const result = await run()

    expect(result.sent['nudge.portfolio_ready']).toBe(1)
    expect(mocks.createInApp).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: `nudge.portfolio_ready-${USER}` }))
    expect(mocks.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ templateKey: 'nudge.portfolio_ready', idempotencyKey: `nudge.portfolio_ready-${USER}` }),
    )
    expect(events).toEqual([expect.objectContaining({ event_type: 'nudge.portfolio_ready', user_id: USER, skipped_reason: null })])
  })

  it('does not repeat within seven days, reminds once after, then stops', async () => {
    await run()
    await run({ now: new Date(NOW.getTime() + DAY) })
    expect(mocks.enqueue).toHaveBeenCalledTimes(1)

    await run({ now: new Date(NOW.getTime() + 8 * DAY) })
    expect(mocks.enqueue).toHaveBeenCalledTimes(2)
    expect(mocks.enqueue.mock.calls[1][0]).toMatchObject({ idempotencyKey: `nudge.portfolio_ready-${USER}-r1`, templateVariables: { isReminder: true } })

    await run({ now: new Date(NOW.getTime() + 30 * DAY) })
    expect(mocks.enqueue).toHaveBeenCalledTimes(2)
  })

  it('records a holdout once and never sends to it', async () => {
    mocks.holdout.mockReturnValue(true)

    expect((await run()).heldOut).toBe(1)
    await run({ now: new Date(NOW.getTime() + 10 * DAY) })

    expect(mocks.enqueue).not.toHaveBeenCalled()
    expect(mocks.createInApp).not.toHaveBeenCalled()
    expect(events).toEqual([expect.objectContaining({ event_type: 'nudge.portfolio_ready', skipped_reason: 'nudge_holdout' })])
  })

  it('counts but writes nothing on a dry run', async () => {
    const result = await run({ dryRun: true })
    expect(result.sent['nudge.portfolio_ready']).toBe(1)
    expect(mocks.enqueue).not.toHaveBeenCalled()
    expect(mocks.createInApp).not.toHaveBeenCalled()
    expect(events).toEqual([])
  })

  it('sends nothing when the nudge automation is off', async () => {
    mocks.automationEnabled.mockResolvedValue(false)
    expect((await run()).sent['nudge.portfolio_ready']).toBe(0)
    expect(mocks.loadProofStates).not.toHaveBeenCalled()
  })

  it('skips the page when its history or proof state cannot be read', async () => {
    historyFails = true
    expect((await run()).skipped).toBe(true)
    historyFails = false
    mocks.loadProofStates.mockResolvedValue(null)
    expect((await run()).skipped).toBe(true)
    expect(mocks.enqueue).not.toHaveBeenCalled()
  })

  it('never calls Fellow a certificate or credential', async () => {
    mocks.loadProofStates.mockResolvedValue(
      new Map([[USER, state({ portfolio: { isPublic: true, readyButPrivate: false, readinessPercent: 100 }, fellowState: 'eligible' })]]),
    )
    await run()
    expect(mocks.enqueue).toHaveBeenCalledWith(expect.objectContaining({ templateKey: 'nudge.fellow_eligible' }))
    expect(JSON.stringify(mocks.createInApp.mock.calls)).not.toMatch(/certif|credential/i)
  })
})
