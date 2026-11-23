/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest'
import { addFriend, removeFriend } from '../leaderboard/leaderboard-db'

/**
 * Root-cause regression test for the broken "Add Friend" action.
 *
 * The bug: addFriend() used a single `.or('username.eq.X,id.eq.X')` filter to
 * support lookup by either username or ID. Since `id` is a UUID column,
 * Postgres/PostgREST rejects the WHOLE query with an "invalid input syntax for
 * type uuid" error whenever X is a plain username (the normal case — the UI
 * always sends a username). The resulting DB error was silently discarded
 * (only `data` was destructured), so every add-by-username attempt surfaced
 * as an incorrect "Learner not found", regardless of whether the username was
 * real. The fix queries by the correct single column based on the
 * identifier's shape (UUID vs. username), never combining them in one filter.
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

describe('Friend Accountability — Add Friend', () => {
  it('finds a real user by username without ever combining username/id into one OR filter', async () => {
    const eqSpy = vi.fn((_col: string, _val: string) => chainable({ data: { id: 'user-bob', username: 'bob' } }))
    const orSpy = vi.fn(() => {
      throw new Error('addFriend must not use .or() — it causes Postgres to reject the query for non-UUID usernames')
    })

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'users') {
          return { select: vi.fn(() => ({ eq: eqSpy, or: orSpy })) }
        }
        if (table === 'user_friends') {
          return { insert: vi.fn(() => chainable({ data: null, error: null })) }
        }
        return chainable({ data: null })
      }),
    } as any

    const result = await addFriend(supabase, 'user-alice', 'bob')

    expect(orSpy).not.toHaveBeenCalled()
    expect(eqSpy).toHaveBeenCalledWith('username', 'bob')
    expect(result.success).toBe(true)
    expect(result.message).toContain('bob')
  })

  it('looks up by id (not username) when the identifier is a valid UUID', async () => {
    const targetId = 'a1b2c3d4-e5f6-4890-8abc-ef1234567890'
    const eqSpy = vi.fn((_col: string, _val: string) => chainable({ data: { id: targetId, username: 'carol' } }))

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'users') return { select: vi.fn(() => ({ eq: eqSpy })) }
        if (table === 'user_friends') return { insert: vi.fn(() => chainable({ data: null, error: null })) }
        return chainable({ data: null })
      }),
    } as any

    await addFriend(supabase, 'user-alice', targetId)
    expect(eqSpy).toHaveBeenCalledWith('id', targetId)
  })

  it('throws a clear error when the username genuinely does not exist', async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'users') return { select: vi.fn(() => ({ eq: vi.fn(() => chainable({ data: null, error: null })) })) }
        return chainable({ data: null })
      }),
    } as any

    await expect(addFriend(supabase, 'user-alice', 'nonexistent_user')).rejects.toThrow(/not found/)
  })

  it('surfaces a DB lookup error instead of silently reporting "not found"', async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'users') {
          return { select: vi.fn(() => ({ eq: vi.fn(() => chainable({ data: null, error: { message: 'connection reset' } })) })) }
        }
        return chainable({ data: null })
      }),
    } as any

    await expect(addFriend(supabase, 'user-alice', 'bob')).rejects.toThrow(/Failed to look up learner/)
  })

  it('prevents adding yourself as a friend', async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'users') return { select: vi.fn(() => ({ eq: vi.fn(() => chainable({ data: { id: 'user-alice', username: 'alice' } })) })) }
        return chainable({ data: null })
      }),
    } as any

    await expect(addFriend(supabase, 'user-alice', 'alice')).rejects.toThrow(/cannot add yourself/)
  })

  it('treats a duplicate-friend insert as a non-fatal success (idempotent add)', async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'users') return { select: vi.fn(() => ({ eq: vi.fn(() => chainable({ data: { id: 'user-bob', username: 'bob' } })) })) }
        if (table === 'user_friends') {
          return { insert: vi.fn(() => chainable({ data: null, error: 'duplicate key value violates unique constraint' })) }
        }
        return chainable({ data: null })
      }),
    } as any

    const result = await addFriend(supabase, 'user-alice', 'bob')
    expect(result.success).toBe(true)
  })

  it('propagates a genuine (non-duplicate) insert failure', async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'users') return { select: vi.fn(() => ({ eq: vi.fn(() => chainable({ data: { id: 'user-bob', username: 'bob' } })) })) }
        if (table === 'user_friends') {
          return { insert: vi.fn(() => chainable({ data: null, error: 'permission denied for table user_friends' })) }
        }
        return chainable({ data: null })
      }),
    } as any

    await expect(addFriend(supabase, 'user-alice', 'bob')).rejects.toBeTruthy()
  })

  const ALICE = '11111111-1111-4111-8111-111111111111'
  const BOB = '22222222-2222-4222-8222-222222222222'

  /** Records every filter call on each delete, so tests can assert exactly what ran. */
  function recordingDeleteClient(deleteResults: Array<{ error: unknown }> = []) {
    const deletes: Array<Array<[string, unknown[]]>> = []
    const supabase = {
      from: vi.fn((table: string) => {
        if (table !== 'user_friends') return chainable({ data: null })
        return {
          delete: () => {
            const calls: Array<[string, unknown[]]> = []
            const result = deleteResults[deletes.length] ?? { error: null }
            deletes.push(calls)
            const chain: any = new Proxy(
              {},
              {
                get(_t, prop) {
                  if (prop === 'then') return (resolve: (v: unknown) => void) => resolve({ data: null, ...result })
                  return (...args: unknown[]) => {
                    calls.push([String(prop), args])
                    return chain
                  }
                },
              }
            )
            return chain
          },
        }
      }),
    } as any
    return { supabase, deletes }
  }

  it('removeFriend deletes both directions with plain equality filters', async () => {
    const { supabase, deletes } = recordingDeleteClient()

    const result = await removeFriend(supabase, ALICE, BOB)

    expect(result.success).toBe(true)
    expect(deletes).toEqual([
      [['eq', ['user_id', ALICE]], ['eq', ['friend_id', BOB]]],
      [['eq', ['user_id', BOB]], ['eq', ['friend_id', ALICE]]],
    ])
  })

  it('removeFriend never builds an or= filter from the friend id', async () => {
    const { supabase, deletes } = recordingDeleteClient()

    await removeFriend(supabase, ALICE, BOB)

    const methods = deletes.flat().map(([method]) => method)
    expect(methods).not.toContain('or')
    expect(methods).not.toContain('filter')
  })

  it('removeFriend rejects a friend id that is not a uuid before touching the database', async () => {
    const { supabase, deletes } = recordingDeleteClient()
    const injection = `${BOB}),user_id.not.is.null,and(user_id.eq.${BOB}`

    await expect(removeFriend(supabase, ALICE, injection)).rejects.toMatchObject({ code: 'VALIDATION' })
    expect(deletes).toHaveLength(0)
  })

  it('removeFriend surfaces a delete error instead of reporting success', async () => {
    const { supabase } = recordingDeleteClient([{ error: { message: 'boom' } }])

    await expect(removeFriend(supabase, ALICE, BOB)).rejects.toEqual({ message: 'boom' })
  })
})
