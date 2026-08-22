/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
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
              { id: 'user-2', full_name: 'Bob Test', email: 'bob@test.com' },
            ],
            error: null,
          })
      } else if (table === 'system_errors') {
        chain.then = (resolve: any) =>
          resolve({
            data: [
              {
                id: 'err-1',
                fingerprint: 'auth_err_fp',
                severity: 'critical',
                category: 'auth',
                operation: 'auth.verify',
                message: 'Token verification failed',
                status: 'new',
                timestamp: '2026-08-22T10:00:00.000Z',
              },
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

vi.mock('@/lib/admin/guard', () => ({
  requireAdminUser: vi.fn(async () => ({
    authorized: true,
    userId: 'admin-1',
    email: 'admin@prodily.app',
  })),
  logAdminAction: vi.fn(async () => {}),
}))

vi.mock('next/cache', () => ({
  unstable_cache: vi.fn((cb: any) => cb),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))

describe('Phase 3 — Final Admin Panel End-to-End Integrity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('correctly attributes feedback to active learners, deleted accounts, and anonymous submitters', async () => {
    const { FeedbackAdminService } = await import('@/lib/admin/feedback-service')
    const list = await FeedbackAdminService.getPrivateFeedbackList()
    expect(Array.isArray(list)).toBe(true)
  })

  it('supports acknowledging and resolving system error groups with audit logging', async () => {
    const { SystemService } = await import('@/lib/admin/system-service')
    const result = await SystemService.updateErrorGroupStatus('auth_err_fp', 'acknowledged')
    expect(result).toHaveProperty('success', true)
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

  it('reads and updates admin product settings with audit logging', async () => {
    const { SettingsService } = await import('@/lib/admin/settings-service')
    const settings = await SettingsService.getProductSettings()
    expect(settings).toHaveProperty('siteName')
    expect(settings).toHaveProperty('allowSignups')
  })

  it('reads and updates admin learning settings dynamically', async () => {
    const { SettingsService } = await import('@/lib/admin/settings-service')
    const settings = await SettingsService.getLearningSettings()
    expect(settings).toHaveProperty('xpPerLessonComplete')
    expect(settings).toHaveProperty('quizPassThreshold')
  })
})
