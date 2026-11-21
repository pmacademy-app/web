import { describe, it, expect, vi } from 'vitest'

const warn = vi.fn()
vi.mock('@/lib/monitoring/log', () => ({ log: { warn: (...a: unknown[]) => warn(...a) } }))

import { learnerFirst, isPermissionDenied } from '@/lib/db/learner-first'

describe('learnerFirst', () => {
  const learner = { name: 'learner' }
  const service = { name: 'service' }

  it('uses the learner client when it succeeds', async () => {
    const run = vi.fn(async (db: { name: string }) => ({ error: null, who: db.name }))
    const res = await learnerFirst('op', learner, service, run as never)
    expect(res).toEqual({ error: null, who: 'learner' })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it.each(['42501', 'PGRST301', 'PGRST303'])('falls back to the service role on %s and logs it', async (code) => {
    warn.mockClear()
    const run = vi.fn(async (db: { name: string }) =>
      db.name === 'learner' ? { error: { code } } : { error: null, who: 'service' }
    )
    const res = await learnerFirst('settings.notifications.update', learner, service, run as never)
    expect(res).toEqual({ error: null, who: 'service' })
    expect(warn).toHaveBeenCalledWith('db.learner_write_fallback', { operation: 'settings.notifications.update', code })
  })

  it('does not retry other errors', async () => {
    const run = vi.fn(async () => ({ error: { code: '23505' } }))
    const res = await learnerFirst('op', learner, service, run as never)
    expect(res).toEqual({ error: { code: '23505' } })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('runs once when there is no learner token (both clients are the service role)', async () => {
    const run = vi.fn(async () => ({ error: { code: '42501' } }))
    await learnerFirst('op', service, service, run as never)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('classifies permission errors', () => {
    expect(isPermissionDenied({ code: '42501' })).toBe(true)
    expect(isPermissionDenied({ code: '23505' })).toBe(false)
    expect(isPermissionDenied(null)).toBe(false)
  })
})
