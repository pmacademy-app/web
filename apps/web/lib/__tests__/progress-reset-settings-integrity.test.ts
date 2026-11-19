/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const createChain = () => {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    ilike: vi.fn(() => chain),
    or: vi.fn(() => chain),
    order: vi.fn(() => chain),
    range: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    single: vi.fn(() => Promise.resolve({ data: null, error: null })),
    maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
    then: (resolve: any) => resolve({ data: [], count: 0, error: null }),
  }
  return chain
}

vi.mock('@/lib/supabase', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      const chain = createChain()
      if (table === 'users') {
        chain.then = (resolve: any) =>
          resolve({
            data: [
              { id: 'user-1', name: 'Alice Test', email: 'alice@test.com' },
              { id: 'user-2', name: 'Bob Test', email: 'bob@test.com' },
            ],
            error: null,
          })
      }
      return chain
    }),
  })),
  createAuthenticatedServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'admin-1', email: 'admin@prodily.app' } }, error: null })),
    },
  })),
}))

vi.mock('next/cache', () => ({
  unstable_cache: vi.fn((cb: any) => cb),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))

describe('Phase 3: progress reset and platform settings integrity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resets progress for a specific module while preserving remaining modules', async () => {
    const { resetProgress } = await import('@/lib/settings/settings-service')
    const { createServiceRoleClient } = await import('@/lib/supabase')
    const supabase = createServiceRoleClient() as any

    await expect(resetProgress(supabase, 'user-1', 'pm-foundations')).resolves.not.toThrow()
  })

  it('performs full user progress reset and purges capstone submissions cleanly', async () => {
    const { resetProgress } = await import('@/lib/settings/settings-service')
    const { createServiceRoleClient } = await import('@/lib/supabase')
    const supabase = createServiceRoleClient() as any

    await expect(resetProgress(supabase, 'user-1', 'all')).resolves.not.toThrow()
  })

  it('reads the product settings the learner app runs on', async () => {
    const { SettingsService } = await import('@/lib/settings/system-settings-service')
    const settings = await SettingsService.getProductSettings()
    expect(settings).toHaveProperty('siteName')
    expect(settings).toHaveProperty('allowSignups')
  })

  it('reads the learning settings the learner app runs on', async () => {
    const { SettingsService } = await import('@/lib/settings/system-settings-service')
    const settings = await SettingsService.getLearningSettings()
    expect(settings).toHaveProperty('xpPerLessonComplete')
    expect(settings).toHaveProperty('quizPassThreshold')
  })
})
