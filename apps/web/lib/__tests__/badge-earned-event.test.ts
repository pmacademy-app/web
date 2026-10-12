import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'
import { BADGE_DEFINITIONS } from '@/config/badges'
import { EVENT_DEFINITIONS } from '@/lib/notifications/events'

const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn() }))

vi.mock('@/lib/notifications/dispatcher', () => ({
  globalNotificationDispatcher: { dispatch },
}))
vi.mock('@/lib/notifications/events/connectors', () => ({
  initializeNotificationConnectors: vi.fn(),
}))
vi.mock('@/lib/badges', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/badges')>()),
  evaluateEligibleBadges: vi.fn(() => [BADGE_DEFINITIONS[0]]),
}))

import { evaluateAndAwardBadges } from '@/lib/badges-db'

/** Every read resolves empty except the `badges` lookup; every insert succeeds. */
function fakeSupabase() {
  const chain = (table: string): unknown =>
    new Proxy(() => undefined, {
      get(_target, prop) {
        if (prop === 'then') {
          const data = table === 'badges' ? [{ id: 'badge-row-1', key: BADGE_DEFINITIONS[0].key }] : []
          return (resolve: (value: unknown) => void) => resolve({ data, error: null, count: 0 })
        }
        if (prop === 'single' || prop === 'maybeSingle') {
          return () => Promise.resolve({ data: null, error: null })
        }
        return () => chain(table)
      },
    })
  return { from: (table: string) => chain(table) } as unknown as SupabaseClient<Database>
}

describe('badge.earned event from evaluateAndAwardBadges', () => {
  beforeEach(() => {
    dispatch.mockReset()
    dispatch.mockResolvedValue({ dispatched: true })
  })

  it('dispatches a payload the event registry accepts', async () => {
    const awarded = await evaluateAndAwardBadges(fakeSupabase(), 'user-1')

    expect(awarded).toEqual([BADGE_DEFINITIONS[0]])
    expect(dispatch).toHaveBeenCalledTimes(1)

    const event = dispatch.mock.calls[0][0]
    expect(event.id).toBe(`badge-user-1-${BADGE_DEFINITIONS[0].key}`)
    expect(event.payload.badgeKey).toBe(BADGE_DEFINITIONS[0].key)
    // The dispatcher drops any event whose payload fails this check, without throwing.
    expect(EVENT_DEFINITIONS['badge.earned'].validatePayload(event.payload)).toBe(true)
  })
})
