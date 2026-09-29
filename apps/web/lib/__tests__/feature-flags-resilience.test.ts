import { describe, it, expect, vi, beforeEach } from 'vitest'

// Keep the incident sink out of the real database for this suite.
const logErrorReport = vi.fn().mockResolvedValue('err_mock')
vi.mock('@/lib/monitoring/logger', () => ({ logErrorReport }))

// A controllable fake for the single read the service performs.
let maybeSingleImpl: () => Promise<{ data: unknown; error: unknown }>
const createServiceRoleClient = vi.fn(() => ({
  from: () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: () => maybeSingleImpl(),
      }),
    }),
  }),
}))
vi.mock('@/lib/supabase', () => ({ createServiceRoleClient }))

import { FeatureFlagService } from '@/lib/notifications/feature-flags/service'

describe('FeatureFlagService — resilience', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    maybeSingleImpl = async () => ({ data: { value: {} }, error: null })
  })

  it('hydrates admin overrides from the database when available', async () => {
    maybeSingleImpl = async () => ({ data: { value: { EMAIL_ENABLED: false } }, error: null })
    const svc = new FeatureFlagService()

    expect(svc.isEnabled('EMAIL_ENABLED')).toBe(true) // compiled default before hydration
    await svc.ensureHydrated(true)
    expect(svc.isEnabled('EMAIL_ENABLED')).toBe(false) // admin kill switch applied
  })

  it('recovers from a transient blip via the in-call retry (no incident)', async () => {
    let calls = 0
    maybeSingleImpl = async () => {
      calls++
      if (calls === 1) throw { message: 'gateway timeout', code: '504' }
      return { data: { value: { EMAIL_ENABLED: false } }, error: null }
    }
    const svc = new FeatureFlagService()
    await svc.ensureHydrated(true)

    expect(calls).toBe(2)
    expect(svc.isEnabled('EMAIL_ENABLED')).toBe(false)
    expect(logErrorReport).not.toHaveBeenCalled()
  })

  it('keeps serving compiled defaults and reports a structured incident on sustained failure', async () => {
    maybeSingleImpl = async () => {
      throw { message: 'relation "system_settings" does not exist', code: '42P01' }
    }
    const svc = new FeatureFlagService()
    await svc.ensureHydrated(true)

    // Compiled default still served — never a dangerous throw.
    expect(svc.isEnabled('EMAIL_ENABLED')).toBe(true)
    expect(logErrorReport).toHaveBeenCalledTimes(1)
    const report = logErrorReport.mock.calls[0][0]
    expect(report.kind).toBe('db_unavailable')
    expect(report.operation).toBe('config.flag_hydrate')
    // Structured, not "[object Object]".
    expect(report.details.message).toContain('does not exist')
    expect(report.details.code).toBe('42P01')
    expect(report.details.servingCompiledDefaults).toBe(true)
  })

  it('backs off after a failure instead of re-hitting a failing database every call', async () => {
    maybeSingleImpl = async () => {
      throw { message: 'unreachable' }
    }
    const svc = new FeatureFlagService()
    await svc.ensureHydrated(true) // force: one failing load (2 attempts)
    const callsAfterFirst = createServiceRoleClient.mock.calls.length

    // A non-forced call inside the backoff window must NOT touch the database again.
    await svc.ensureHydrated()
    expect(createServiceRoleClient.mock.calls.length).toBe(callsAfterFirst)
  })

  it('applies the admin kill switch once the database recovers', async () => {
    maybeSingleImpl = async () => {
      throw { message: 'down' }
    }
    const svc = new FeatureFlagService()
    await svc.ensureHydrated(true)
    expect(svc.isEnabled('EMAIL_ENABLED')).toBe(true)

    // Database comes back; a forced hydrate picks up the override immediately.
    maybeSingleImpl = async () => ({ data: { value: { EMAIL_ENABLED: false } }, error: null })
    await svc.ensureHydrated(true)
    expect(svc.isEnabled('EMAIL_ENABLED')).toBe(false)
  })
})
