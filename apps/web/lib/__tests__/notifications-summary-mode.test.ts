import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FakeQueryBuilder, SupabaseFake } from './helpers/supabase-fake'

/**
 * Performance plan 2026-11-18, item 10: the bell polls GET /api/notifications?summary=1, which
 * runs one unread head count and answers { success, unreadCount }. The full read (the drawer)
 * keeps its shape but no longer asks PostgREST for an exact total it never shows.
 */

const fake = new SupabaseFake()
const flags = vi.hoisted(() => ({ enabled: true }))

vi.mock('@/lib/supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/supabase')>()),
  createServiceRoleClient: () => fake,
}))

vi.mock('@/lib/auth', () => ({
  getAuthenticatedUserFromRequest: vi.fn(async () => ({ id: 'usr_n', email: 'n@example.com' })),
}))

vi.mock('@/lib/notifications/feature-flags/service', () => ({
  globalFeatureFlagService: { isEnabledAsync: vi.fn(async () => flags.enabled) },
}))

vi.mock('@/lib/monitoring/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/monitoring/logger')>()),
  logSystemError: vi.fn(async () => undefined),
  logErrorReport: vi.fn(async () => undefined),
}))

import { GET } from '../../app/api/notifications/route'

const row = (id: string, isRead: boolean, userId = 'usr_n') => ({
  id,
  user_id: userId,
  category: 'learning',
  title: id,
  body: 'b',
  action_url: null,
  priority: 2,
  is_read: isRead,
  created_at: new Date().toISOString(),
})

const get = (query = '') => GET(new Request(`https://prodily.app/api/notifications${query}`))

let fromSpy: ReturnType<typeof vi.spyOn>
let selectSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  flags.enabled = true
  fake.clearAll()
  fake.seed('in_app_notifications', [row('n1', false), row('n2', false), row('n3', true), row('o1', false, 'usr_other')])
  fromSpy = vi.spyOn(fake, 'from')
  selectSpy = vi.spyOn(FakeQueryBuilder.prototype, 'select')
})

afterEach(() => {
  fromSpy.mockRestore()
  selectSpy.mockRestore()
})

describe('GET /api/notifications?summary=1', () => {
  it('runs one head count query and answers only the unread count', async () => {
    const res = await get('?summary=1')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, unreadCount: 2 })

    expect(fromSpy).toHaveBeenCalledTimes(1)
    expect(selectSpy).toHaveBeenCalledTimes(1)
    expect(selectSpy).toHaveBeenCalledWith('id', { count: 'exact', head: true })
  })

  it('answers zero when nothing is unread', async () => {
    fake.setTableRows('in_app_notifications', [row('n3', true)])
    expect(await (await get('?summary=1')).json()).toEqual({ success: true, unreadCount: 0 })
  })

  it('returns 500 when the count fails instead of a quiet bell', async () => {
    fake.forceError('in_app_notifications', new Error('db down'))
    const res = await get('?summary=1')
    expect(res.status).toBe(500)
    expect((await res.json()).success).not.toBe(true)
  })

  it('answers zero without a query when in-app notifications are disabled', async () => {
    flags.enabled = false
    expect(await (await get('?summary=1')).json()).toEqual({ success: true, unreadCount: 0 })
    expect(fromSpy).not.toHaveBeenCalled()
  })
})

describe('GET /api/notifications (full read for the drawer)', () => {
  it('keeps items, grouped and unreadCount, without an exact count on the list query', async () => {
    const res = await get()
    expect(res.status).toBe(200)
    const json = await res.json()

    expect(json.success).toBe(true)
    expect(json.items.map((i: { id: string }) => i.id).sort()).toEqual(['n1', 'n2', 'n3'])
    expect(json.unreadCount).toBe(2)
    expect(Object.keys(json.grouped)).toEqual(['today', 'yesterday', 'thisWeek', 'earlier'])
    expect(json.pagination).toMatchObject({ total: null, hasMore: false })

    expect(fromSpy).toHaveBeenCalledTimes(2)
    const listSelect = (selectSpy.mock.calls as unknown[][]).find((call) => call[0] !== 'id')
    expect(listSelect?.[1]).toBeUndefined()
  })
})
