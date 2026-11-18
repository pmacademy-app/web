import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'
import { SupabaseFake } from './helpers/supabase-fake'

/**
 * Audit 2026-11-17 #7 (account deletion order and cleanup) and #13 (resets must
 * fail loudly instead of reporting success after a failed write).
 */

const fake = new SupabaseFake()
const storageList = vi.fn()
const storageRemove = vi.fn()
const deleteUser = vi.fn()
Object.assign(fake, { storage: { from: vi.fn(() => ({ list: storageList, remove: storageRemove })) } })
fake.auth.admin.deleteUser = deleteUser as unknown as typeof fake.auth.admin.deleteUser

vi.mock('@/lib/supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/supabase')>()),
  createServiceRoleClient: () => fake,
}))

vi.mock('@/lib/auth', () => ({
  getAuthenticatedUserFromRequest: vi.fn(async () => ({ id: 'usr_del', email: 'del@example.com' })),
}))

vi.mock('@/lib/settings/destructive-reauth', () => ({
  verifyDestructiveReauth: vi.fn(async () => ({ ok: true, userId: 'usr_del', user: { id: 'usr_del' } })),
}))

const logSystemError = vi.fn(async () => undefined)
vi.mock('@/lib/monitoring/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/monitoring/logger')>()),
  logSystemError: (...args: unknown[]) => logSystemError(...(args as [])),
}))

vi.mock('../xp/xp-service', () => ({ getTotalXp: vi.fn(async () => 0) }))

import { deleteAccount, resetProgress, resetXp } from '../settings/settings-service'
import { POST as deleteAccountPOST } from '@/app/api/settings/delete-account/route'

const client = fake as unknown as SupabaseClient<Database>

/** Makes the next write (update/delete) against `table` fail. */
function failWritesTo(table: string) {
  const original = fake.from.bind(fake)
  return vi.spyOn(fake, 'from').mockImplementation((name: string) => {
    const builder = original(name)
    if (name === table) {
      for (const method of ['delete', 'update'] as const) {
        const real = (builder[method] as (...a: unknown[]) => typeof builder).bind(builder)
        ;(builder as unknown as Record<string, unknown>)[method] = (...args: unknown[]) => {
          real(...args)
          fake.forceError(table, new Error(`${table} write failed`))
          return builder
        }
      }
    }
    return builder
  })
}

beforeEach(() => {
  vi.restoreAllMocks()
  fake.clearAll()
  storageList.mockReset().mockResolvedValue({ data: [{ name: 'avatar-1.png' }], error: null })
  storageRemove.mockReset().mockResolvedValue({ data: [], error: null })
  deleteUser.mockReset().mockResolvedValue({ data: null, error: null })
  logSystemError.mockClear()
  fake.seed('users', [{ id: 'usr_del', email: 'del@example.com', total_xp: 50, level: 2 }])
  fake.seed('user_lesson_progress', [{ user_id: 'usr_del', lesson_id: 'l1' }])
  fake.seed('quiz_attempts', [{ user_id: 'usr_del', lesson_id: 'l1' }])
})

describe('#7 deleteAccount', () => {
  it('removes the avatar folder and the users row, and no longer loops over cascading tables', async () => {
    const touched: string[] = []
    const original = fake.from.bind(fake)
    vi.spyOn(fake, 'from').mockImplementation((t: string) => {
      touched.push(t)
      return original(t)
    })

    await deleteAccount(client, 'usr_del')

    expect(storageList).toHaveBeenCalledWith('usr_del', { limit: 1000 })
    expect(storageRemove).toHaveBeenCalledWith(['usr_del/avatar-1.png'])
    expect(touched).toEqual(['users'])
    expect(fake.getTableRows('users')).toHaveLength(0)
  })

  it('does not touch certificates (they cascade from users)', async () => {
    fake.seed('certificates', [{ user_id: 'usr_del', learner_name: 'Del' }])
    await deleteAccount(client, 'usr_del')
    // The fake has no FK cascade; the row is untouched by app code, in particular not renamed.
    expect(fake.getTableRows('certificates')[0].learner_name).toBe('Del')
  })

  it('throws when the avatar listing fails', async () => {
    storageList.mockResolvedValue({ data: null, error: { message: 'storage down' } })
    await expect(deleteAccount(client, 'usr_del')).rejects.toThrow(/avatar/)
  })

  it('throws when the avatar removal fails', async () => {
    storageRemove.mockResolvedValue({ data: null, error: { message: 'storage down' } })
    await expect(deleteAccount(client, 'usr_del')).rejects.toThrow(/avatar/)
  })

  it('throws when the users delete fails', async () => {
    failWritesTo('users')
    await expect(deleteAccount(client, 'usr_del')).rejects.toThrow(/user row/)
  })
})

describe('#7 POST /api/settings/delete-account', () => {
  function request() {
    return new NextRequest('https://prodily.app/api/settings/delete-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'pw' }),
    })
  }

  it('deletes the auth user before any application data, then cleans up', async () => {
    const order: string[] = []
    deleteUser.mockImplementation(async () => {
      order.push('auth')
      return { data: null, error: null }
    })
    storageList.mockImplementation(async () => {
      order.push('storage')
      return { data: [], error: null }
    })

    const res = await deleteAccountPOST(request())
    expect(res.status).toBe(200)
    expect((await res.json()).success).toBe(true)
    expect(deleteUser).toHaveBeenCalledWith('usr_del')
    expect(order).toEqual(['auth', 'storage'])
  })

  it('fails the request and touches nothing when the auth delete fails', async () => {
    deleteUser.mockResolvedValue({ data: null, error: { message: 'gotrue down' } })

    const res = await deleteAccountPOST(request())
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.success).not.toBe(true)
    expect(json.code).toBe('ACCOUNT_DELETE_FAILED')
    expect(storageList).not.toHaveBeenCalled()
    expect(fake.getTableRows('users')).toHaveLength(1)
    expect(logSystemError).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'settings.delete_account_auth_user', userId: 'usr_del' })
    )
  })

  it('still answers success once the auth user is gone, and records a failed cleanup', async () => {
    storageList.mockResolvedValue({ data: null, error: { message: 'storage down' } })

    const res = await deleteAccountPOST(request())
    expect(res.status).toBe(200)
    expect(logSystemError).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'settings.delete_account_cleanup', userId: 'usr_del' })
    )
  })
})

describe('#13 resetProgress and resetXp throw on the first failed write', () => {
  it('full reset throws when a delete fails and stops there', async () => {
    failWritesTo('quiz_attempts')
    await expect(resetProgress(client, 'usr_del', 'all')).rejects.toThrow(/quiz attempts/)
    // The step before ran, the step after did not get a chance to report success.
    expect(fake.getTableRows('user_lesson_progress')).toHaveLength(0)
  })

  it('full reset throws when the first delete fails', async () => {
    failWritesTo('user_lesson_progress')
    await expect(resetProgress(client, 'usr_del')).rejects.toThrow(/lesson progress/)
    expect(fake.getTableRows('quiz_attempts')).toHaveLength(1)
  })

  it('module reset throws when the capstone delete fails', async () => {
    failWritesTo('capstone_submissions')
    await expect(resetProgress(client, 'usr_del', 'not-a-real-module')).rejects.toThrow(/capstones/)
  })

  it('module reset (legacy slug path) throws when the progress delete fails', async () => {
    failWritesTo('user_lesson_progress')
    await expect(resetProgress(client, 'usr_del', 'not-a-real-module')).rejects.toThrow(/lesson progress/)
  })

  it('full reset succeeds when every write succeeds', async () => {
    await expect(resetProgress(client, 'usr_del', 'all')).resolves.toBeUndefined()
    expect(fake.getTableRows('user_lesson_progress')).toHaveLength(0)
    expect(fake.getTableRows('quiz_attempts')).toHaveLength(0)
  })

  it('resetXp throws when the users total_xp update fails', async () => {
    failWritesTo('users')
    await expect(resetXp(client, 'usr_del')).rejects.toThrow(/XP total/)
  })

  it('resetXp zeroes the cached total when the update succeeds', async () => {
    await expect(resetXp(client, 'usr_del')).resolves.toBe(0)
    expect(fake.getTableRows('users')[0]).toMatchObject({ total_xp: 0, level: 1 })
  })
})
