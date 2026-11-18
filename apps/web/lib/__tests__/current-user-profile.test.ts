import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SupabaseFake } from './helpers/supabase-fake'

/**
 * Audit 2026-11-17 #18: getCurrentUserProfile must not turn a failed read into
 * "no profile", because the (app) layout answers "no profile" by re-creating it and,
 * failing that, by sending the learner to /login.
 */

const fake = new SupabaseFake()

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => (name === 'sb-access-token' ? { name, value: 'tok' } : undefined),
  })),
  headers: vi.fn(() => new Headers()),
}))

vi.mock('@/lib/supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/supabase')>()),
  createAuthenticatedServerClient: () => fake,
  createServiceRoleClient: () => fake,
}))

import { getCurrentUserProfile, ProfileReadError } from '../auth'
import { log } from '../monitoring/log'

beforeEach(() => {
  fake.clearAll()
  fake.seed('users', [{ id: 'usr_p', email: 'p@example.com', username: 'pat' }])
})

describe('getCurrentUserProfile', () => {
  it('returns the profile row', async () => {
    await expect(getCurrentUserProfile()).resolves.toMatchObject({ id: 'usr_p', username: 'pat' })
  })

  it('returns null when the row genuinely does not exist', async () => {
    fake.seed('users', [])
    // getUser falls back to a default user id that has no row.
    await expect(getCurrentUserProfile()).resolves.toBeNull()
  })

  it('throws ProfileReadError on a query error and logs only the user id', async () => {
    const spy = vi.spyOn(log, 'error')
    const realFrom = fake.from.bind(fake)
    vi.spyOn(fake, 'from').mockImplementation((table: string) => {
      if (table === 'users') fake.forceError('users', Object.assign(new Error('timeout'), { code: '57014' }))
      return realFrom(table)
    })

    await expect(getCurrentUserProfile()).rejects.toBeInstanceOf(ProfileReadError)
    expect(spy).toHaveBeenCalledWith('auth.current_user_profile.read_failed', { userId: 'usr_p', code: '57014' })
    vi.restoreAllMocks()
  })
})
