/**
 * CQ-02: the scheduled-broadcast cron must not run the portfolio activation
 * campaign runner. That runner reads users without paging, stops at the first
 * 50 auth users, swallows read errors and sends outside the email queue. Until
 * it is rebuilt, a matching broadcast is marked failed and logged instead, and
 * it must never fall through to the generic executeBroadcastBatch path either.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { createServiceRoleClientMock, logSystemErrorMock, executeCampaignMock } = vi.hoisted(() => ({
  createServiceRoleClientMock: vi.fn(),
  logSystemErrorMock: vi.fn(async () => null),
  executeCampaignMock: vi.fn(async () => undefined),
}))

vi.mock('@/lib/supabase', () => ({
  createServiceRoleClient: createServiceRoleClientMock,
}))

vi.mock('@/lib/monitoring/logger', () => ({
  logSystemError: logSystemErrorMock,
}))

vi.mock('@/lib/campaigns/portfolio-activation-runner', () => ({
  executePortfolioActivationCampaign: executeCampaignMock,
}))

const { logAdminActionMock } = vi.hoisted(() => ({ logAdminActionMock: vi.fn(async () => undefined) }))

vi.mock('@/lib/admin/guard', () => ({ logAdminAction: logAdminActionMock }))

vi.mock('@/lib/api/actor', () => ({
  requireAdmin: () => ({ userId: 'admin-1', email: 'admin@example.test' }),
}))

// Pass-through: the route's own auth wrapper is covered elsewhere; here we only
// care how the handler maps the service's refusal.
vi.mock('@/lib/api/with-route', () => ({
  withRoute:
    (_config: unknown, handler: (ctx: { actor: unknown; params: Record<string, string> }) => Promise<Response>) =>
    (_req: unknown, ctx: { params: Record<string, string> }) =>
      handler({ actor: { kind: 'admin' }, params: ctx.params }),
}))

import {
  BroadcastService,
  BroadcastRefusedError,
  isPortfolioActivationBroadcast,
} from '../admin/broadcast-service'
import { POST as executeRoute } from '@/app/api/admin/emails/broadcasts/[id]/execute/route'

type DueRow = {
  id: string
  name?: string
  template_key?: string
  recipient_filters?: Record<string, unknown>
}

interface UpdateCall {
  id: string
  values: Record<string, unknown>
}

function makeSupabase(due: DueRow[], options: { updateError?: { message: string }; record?: Record<string, unknown> } = {}) {
  const updates: UpdateCall[] = []
  const client = {
    from: vi.fn((table: string) => {
      expect(table).toBe('email_broadcasts')
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            lte: vi.fn(async () => ({ data: due, error: null })),
            maybeSingle: vi.fn(async () => ({ data: options.record ?? null, error: null })),
          })),
        })),
        update: vi.fn((values: Record<string, unknown>) => ({
          eq: vi.fn(async (_col: string, id: string) => {
            updates.push({ id, values })
            return { data: null, error: options.updateError ?? null }
          }),
        })),
      }
    }),
  }
  return { client, updates }
}

describe('CQ-02 portfolio activation hook in processScheduledBroadcasts', () => {
  let batchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    batchSpy = vi
      .spyOn(BroadcastService, 'executeBroadcastBatch')
      .mockResolvedValue({} as Awaited<ReturnType<typeof BroadcastService.executeBroadcastBatch>>)
  })

  afterEach(() => {
    batchSpy.mockRestore()
  })

  const matchCases: Array<[string, DueRow]> = [
    ['template_key', { id: 'b-template', template_key: 'marketing.portfolio_activation' }],
    ['campaignId filter', { id: 'b-campaign', recipient_filters: { campaignId: 'portfolio_activation_sep_2026' } }],
    ['target filter', { id: 'b-target', recipient_filters: { target: 'portfolio_activation_sep_2026' } }],
    ['name', { id: 'b-name', name: 'portfolio_activation_sep_2026' }],
  ]

  it.each(matchCases)('skips the runner and marks failed when matched by %s', async (_label, row) => {
    const { client, updates } = makeSupabase([row])
    createServiceRoleClientMock.mockReturnValue(client)

    const result = await BroadcastService.processScheduledBroadcasts()

    expect(executeCampaignMock).not.toHaveBeenCalled()
    expect(batchSpy).not.toHaveBeenCalled()
    expect(updates).toHaveLength(1)
    expect(updates[0].id).toBe(row.id)
    expect(updates[0].values.status).toBe('failed')
    expect(typeof updates[0].values.updated_at).toBe('string')
    expect(logSystemErrorMock).toHaveBeenCalledTimes(1)
    expect(logSystemErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'warning',
        category: 'cron',
        operation: 'broadcast_portfolio_activation_disabled',
        message: expect.stringContaining(row.id),
      })
    )
    expect(result).toEqual({ processed: 0, errors: 0 })
  })

  it('still sends a normal scheduled broadcast through executeBroadcastBatch', async () => {
    const { client, updates } = makeSupabase([
      { id: 'b-normal', name: 'Weekly digest', template_key: 'marketing.weekly_digest' },
    ])
    createServiceRoleClientMock.mockReturnValue(client)

    const result = await BroadcastService.processScheduledBroadcasts()

    expect(batchSpy).toHaveBeenCalledTimes(1)
    expect(batchSpy).toHaveBeenCalledWith('b-normal')
    expect(executeCampaignMock).not.toHaveBeenCalled()
    expect(logSystemErrorMock).not.toHaveBeenCalled()
    expect(updates).toHaveLength(0)
    expect(result).toEqual({ processed: 1, errors: 0 })
  })

  it('handles a mixed batch: skips the campaign row, sends the normal row', async () => {
    const { client, updates } = makeSupabase([
      { id: 'b-campaign', template_key: 'marketing.portfolio_activation' },
      { id: 'b-normal', template_key: 'marketing.weekly_digest' },
    ])
    createServiceRoleClientMock.mockReturnValue(client)

    const result = await BroadcastService.processScheduledBroadcasts()

    expect(batchSpy).toHaveBeenCalledTimes(1)
    expect(batchSpy).toHaveBeenCalledWith('b-normal')
    expect(executeCampaignMock).not.toHaveBeenCalled()
    expect(updates.map((u) => u.id)).toEqual(['b-campaign'])
    expect(result).toEqual({ processed: 1, errors: 0 })
  })
  it('includes the update error in the log when marking the row failed fails', async () => {
    const { client } = makeSupabase([{ id: 'b-template', template_key: 'marketing.portfolio_activation' }], {
      updateError: { message: 'permission denied' },
    })
    createServiceRoleClientMock.mockReturnValue(client)

    const result = await BroadcastService.processScheduledBroadcasts()

    expect(batchSpy).not.toHaveBeenCalled()
    expect(logSystemErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'broadcast_portfolio_activation_disabled',
        message: expect.stringContaining('permission denied'),
      })
    )
    expect(result).toEqual({ processed: 0, errors: 0 })
  })
})

describe('CQ-02 manual execute path', () => {
  const campaignRecord = {
    id: 'b-manual',
    name: 'Manual run',
    template_key: 'marketing.portfolio_activation',
    status: 'scheduled',
    recipient_filters: {},
    batch_size: 100,
    last_batch_index: -1,
    sent_count: 0,
    failed_count: 0,
    skipped_count: 0,
    started_at: null,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('isPortfolioActivationBroadcast matches every campaign marker and nothing else', () => {
    expect(isPortfolioActivationBroadcast({ template_key: 'marketing.portfolio_activation' })).toBe(true)
    expect(isPortfolioActivationBroadcast({ name: 'portfolio_activation_sep_2026' })).toBe(true)
    expect(isPortfolioActivationBroadcast({ name: 'Prodily Public Portfolio & First Capstone Campaign' })).toBe(true)
    expect(isPortfolioActivationBroadcast({ recipient_filters: { campaignId: 'portfolio_activation_sep_2026' } })).toBe(true)
    expect(isPortfolioActivationBroadcast({ recipient_filters: { target: 'portfolio_activation_sep_2026' } })).toBe(true)
    expect(isPortfolioActivationBroadcast({ name: 'Weekly digest', template_key: 'marketing.weekly_digest', recipient_filters: null })).toBe(false)
  })

  it('executeBroadcastBatch refuses the campaign before claiming a batch', async () => {
    const { client, updates } = makeSupabase([], { record: campaignRecord })
    createServiceRoleClientMock.mockReturnValue(client)

    await expect(BroadcastService.executeBroadcastBatch('b-manual')).rejects.toBeInstanceOf(BroadcastRefusedError)
    expect(updates).toHaveLength(0)
    expect(executeCampaignMock).not.toHaveBeenCalled()
  })

  it('the execute route answers 409 and logs no admin action', async () => {
    const { client, updates } = makeSupabase([], { record: campaignRecord })
    createServiceRoleClientMock.mockReturnValue(client)

    const res = await (executeRoute as unknown as (req: unknown, ctx: { params: Record<string, string> }) => Promise<Response>)(
      new Request('http://localhost/api/admin/emails/broadcasts/b-manual/execute', { method: 'POST' }),
      { params: { id: 'b-manual' } }
    )

    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('Portfolio activation campaign b-manual cannot be sent')
    expect(updates).toHaveLength(0)
    expect(logAdminActionMock).not.toHaveBeenCalled()
  })
})
