/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest'
import { resolveFilteredUserIds } from '../admin/user-filter-query'

/**
 * Verifies the new `userIds` filter (Individual audience mode for email
 * broadcasts): it must intersect with any other active filters, and must
 * still respect the unconditional suppression-list exclusion so a manually
 * selected but unsubscribed/bounced address is never targeted.
 */
function chainable(result: { data: unknown; error?: unknown }) {
  const obj: any = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') return (resolve: (v: unknown) => void) => resolve(result)
        return () => obj
      },
    }
  )
  return obj
}

describe('Admin Broadcast — Individual audience targeting (userIds filter)', () => {
  it('resolves to exactly the given user IDs when no other filters are set', async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'email_suppressions') return chainable({ data: [] })
        return chainable({ data: [] })
      }),
    } as any

    const { ids } = await resolveFilteredUserIds({ userIds: ['user-a', 'user-b'] }, supabase)
    expect(ids).not.toBeNull()
    expect([...(ids as Set<string>)].sort()).toEqual(['user-a', 'user-b'])
  })

  it('excludes suppressed (unsubscribed/bounced) addresses even when explicitly selected', async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'email_suppressions') {
          return chainable({ data: [{ email: 'suppressed@example.com' }] })
        }
        if (table === 'users') {
          return chainable({
            data: [
              { id: 'user-a', email: 'a@example.com' },
              { id: 'user-suppressed', email: 'suppressed@example.com' },
            ],
          })
        }
        return chainable({ data: [] })
      }),
    } as any

    const { ids } = await resolveFilteredUserIds({ userIds: ['user-a', 'user-suppressed'] }, supabase)
    expect(ids).not.toBeNull()
    expect(ids?.has('user-a')).toBe(true)
    expect(ids?.has('user-suppressed')).toBe(false)
  })

  it('intersects userIds with other active filters rather than overriding them', async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'email_suppressions') return chainable({ data: [] })
        if (table === 'user_notification_preferences') {
          // Only user-a and user-c have opted into marketing email.
          return chainable({ data: [{ user_id: 'user-a' }, { user_id: 'user-c' }] })
        }
        return chainable({ data: [] })
      }),
    } as any

    const { ids } = await resolveFilteredUserIds(
      { userIds: ['user-a', 'user-b', 'user-c'], marketingEmailOptIn: true },
      supabase
    )
    expect(ids).not.toBeNull()
    // user-b is explicitly selected but not opted into marketing email — excluded by intersection.
    expect([...(ids as Set<string>)].sort()).toEqual(['user-a', 'user-c'])
  })
})
