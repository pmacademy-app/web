/**
 * ensureUserProfile: consent `undefined` vs explicit `null`, and `skipWelcome`.
 *
 * Google sign-ups without consent pass `consent: null` (no consent, whatever the
 * metadata says) and `skipWelcome: true` (the welcome goes out from the consent
 * gate). Every other caller omits both and keeps its behaviour.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ dispatch: vi.fn(), inserted: [] as Array<Record<string, unknown>> }))

vi.mock('@/lib/notifications/dispatcher', () => ({ globalNotificationDispatcher: { dispatch: h.dispatch } }))
vi.mock('@/lib/notifications/events/connectors', () => ({ initializeNotificationConnectors: vi.fn() }))

import { ensureUserProfile } from '@/lib/auth'

const METADATA_CONSENT = {
  terms_accepted_at: '2026-10-20T00:00:00.000Z',
  terms_version: '2026-09-23',
  privacy_version: '2026-09-23',
  age_confirmed_at: '2026-10-20T00:00:00.000Z',
  age_confirmed_minimum: 18,
}

function fakeClient() {
  return {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      insert: (row: Record<string, unknown>) => {
        h.inserted.push(row)
        return { select: () => ({ single: async () => ({ data: row, error: null }) }) }
      },
    }),
  } as never
}

const user = {
  id: 'usr_1',
  email: 'a@example.com',
  app_metadata: { provider: 'google' },
  user_metadata: { full_name: 'A', ...METADATA_CONSENT },
} as never

describe('ensureUserProfile consent and welcome options', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.inserted.length = 0
    h.dispatch.mockResolvedValue(undefined)
  })

  it('omitted consent is derived from auth metadata and the welcome is sent (existing behaviour)', async () => {
    await ensureUserProfile(fakeClient(), user)
    expect(h.inserted[0]).toMatchObject(METADATA_CONSENT)
    expect(h.dispatch).toHaveBeenCalledWith(expect.objectContaining({ id: 'welcome-usr_1', event: 'user.registered' }))
  })

  it('explicit null consent leaves the consent columns unset even when metadata has some', async () => {
    await ensureUserProfile(fakeClient(), user, { consent: null })
    for (const key of Object.keys(METADATA_CONSENT)) expect(h.inserted[0]).not.toHaveProperty(key)
  })

  it('skipWelcome creates the row without dispatching the welcome', async () => {
    await ensureUserProfile(fakeClient(), user, { consent: null, skipWelcome: true })
    expect(h.inserted).toHaveLength(1)
    expect(h.dispatch).not.toHaveBeenCalled()
  })
})
