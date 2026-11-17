import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SupabaseFake } from './helpers/supabase-fake'

/**
 * Audit 2026-11-17 #12: the notification API must not answer success when the
 * database failed, and the security fallback link must point at a real page.
 */

const fake = new SupabaseFake()

vi.mock('@/lib/supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/supabase')>()),
  createServiceRoleClient: () => fake,
}))

vi.mock('@/lib/auth', () => ({
  getAuthenticatedUserFromRequest: vi.fn(async () => ({ id: 'usr_n', email: 'n@example.com' })),
}))

vi.mock('@/lib/notifications/feature-flags/service', () => ({
  globalFeatureFlagService: { isEnabledAsync: vi.fn(async () => true) },
}))

vi.mock('@/lib/monitoring/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/monitoring/logger')>()),
  logSystemError: vi.fn(async () => undefined),
  logErrorReport: vi.fn(async () => undefined),
}))

import { GET, PATCH } from '../../app/api/notifications/route'

function patch(body: unknown) {
  return PATCH(
    new Request('https://prodily.app/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  )
}

beforeEach(() => {
  fake.clearAll()
  fake.seed('in_app_notifications', [
    {
      id: 'n1',
      user_id: 'usr_n',
      category: 'security',
      title: 'New sign-in',
      body: 'b',
      action_url: null,
      priority: 3,
      is_read: false,
      created_at: new Date().toISOString(),
    },
  ])
})

describe('GET /api/notifications', () => {
  it('returns 500 when the read fails instead of an empty successful list', async () => {
    fake.forceError('in_app_notifications', new Error('db down'))
    const res = await GET(new Request('https://prodily.app/api/notifications'))
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.success).not.toBe(true)
  })

  it('links a security notification without action_url to the settings security tab', async () => {
    const res = await GET(new Request('https://prodily.app/api/notifications'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.items[0].deepLink).toBe('/settings?tab=security')
  })
})

describe('PATCH /api/notifications', () => {
  it.each([
    ['mark_all_read', { action: 'mark_all_read' }],
    ['batch', { action: 'mark_read', notificationIds: ['n1'] }],
    ['single', { action: 'mark_read', notificationId: 'n1' }],
  ])('%s returns 500 when the update fails', async (_name, body) => {
    fake.forceError('in_app_notifications', new Error('db down'))
    const res = await patch(body)
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.success).not.toBe(true)
  })

  it('mark_all_read still succeeds when the update succeeds', async () => {
    const res = await patch({ action: 'mark_all_read' })
    expect(res.status).toBe(200)
    expect(fake.getTableRows('in_app_notifications')[0].is_read).toBe(true)
  })
})
