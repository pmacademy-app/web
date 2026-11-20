import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { notificationPreferencesUpdateSchema } from '@/lib/api/contracts/settings'

const { createServiceRoleClientMock } = vi.hoisted(() => ({ createServiceRoleClientMock: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ createServiceRoleClient: createServiceRoleClientMock }))
vi.mock('@/lib/monitoring/logger', () => ({ logSystemError: vi.fn(async () => null) }))

import { BroadcastService } from '../broadcasts/broadcast-service'

const root = path.resolve(__dirname, '../..')
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')

describe('notification preferences: no cross-user or unknown-column writes', () => {
  it('accepts the fields the settings screen sends', () => {
    const parsed = notificationPreferencesUpdateSchema.safeParse({
      in_app_enabled: true,
      email_enabled: false,
      preferred_reminder_hour: 9,
      learning_email: true,
      marketing_email: false,
    })
    expect(parsed.success).toBe(true)
  })

  it.each([['user_id'], ['unsubscribe_token'], ['updated_at'], ['timezone']])('rejects %s in the body', (key) => {
    expect(notificationPreferencesUpdateSchema.safeParse({ [key]: 'x' }).success).toBe(false)
  })

  it('rejects an out-of-range reminder hour and non-boolean toggles', () => {
    expect(notificationPreferencesUpdateSchema.safeParse({ preferred_reminder_hour: 24 }).success).toBe(false)
    expect(notificationPreferencesUpdateSchema.safeParse({ learning_email: 'yes' }).success).toBe(false)
  })

  it('the route validates the body and sets user_id after the spread', () => {
    const src = read('app/api/settings/notifications/route.ts')
    expect(src).toContain('body: notificationPreferencesUpdateSchema')
    expect(src).not.toContain('request.json()')
    expect(src.indexOf('...rest,')).toBeLessThan(src.indexOf('user_id: authUserId,'))
  })
})

describe('referral lookup: rate limited, no internal id', () => {
  it('declares a per-IP rate limit and does not return the user id', () => {
    const src = read('app/api/referrals/resolve/route.ts')
    expect(src).toMatch(/rateLimit:\s*\[/)
    expect(src).not.toMatch(/id:\s*referrer\.id/)
  })
})

describe('scheduled jobs: bounded duration', () => {
  it('every cron route declares maxDuration = 60', () => {
    for (const dir of fs.readdirSync(path.join(root, 'app/api/cron'))) {
      expect(read(`app/api/cron/${dir}/route.ts`), dir).toMatch(/export const maxDuration = 60\b/)
    }
  })
})

describe('broadcasts: batches after the first are picked up', () => {
  beforeEach(() => vi.clearAllMocks())

  it('the cron continues a broadcast left in sending, once each', async () => {
    const statuses: string[] = []
    const client = {
      from: () => ({
        select: () => ({
          eq: (_col: string, status: string) => {
            statuses.push(status)
            const rows = status === 'scheduled' ? [{ id: 'b1' }] : [{ id: 'b2' }, { id: 'b1' }]
            const result = { data: rows, error: null }
            return { lte: async () => result, then: (r: (v: typeof result) => unknown) => r(result) }
          },
        }),
        update: () => ({ eq: async () => ({ error: null }) }),
      }),
    }
    createServiceRoleClientMock.mockReturnValue(client)
    const spy = vi
      .spyOn(BroadcastService, 'executeBroadcastBatch')
      .mockResolvedValue({} as Awaited<ReturnType<typeof BroadcastService.executeBroadcastBatch>>)

    const result = await BroadcastService.processScheduledBroadcasts()

    expect(statuses).toEqual(['scheduled', 'sending'])
    expect(spy.mock.calls.map((c) => c[0])).toEqual(['b1', 'b2'])
    expect(result).toEqual({ processed: 2, errors: 0 })
    spy.mockRestore()
  })
})
