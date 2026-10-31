import { describe, it, expect, vi, beforeEach } from 'vitest'

// ISSUE-23: evaluateBadgesAfterXp runs the badge evaluator with a service-role client and never
// lets a failure reach the caller (it is meant to run inside after()).

vi.mock('@/lib/badges-db', () => ({
  evaluateAndAwardBadges: vi.fn(async () => []),
}))

vi.mock('@/lib/monitoring/logger', () => ({
  logSystemError: vi.fn(async () => null),
}))

import * as supabaseModule from '@/lib/supabase'
import { evaluateAndAwardBadges } from '@/lib/badges-db'
import { logSystemError } from '@/lib/monitoring/logger'
import { evaluateBadgesAfterXp } from '../badges/evaluate-after-xp'

const client = { tag: 'service-role' }

beforeEach(() => {
  vi.mocked(evaluateAndAwardBadges).mockReset()
  vi.mocked(logSystemError).mockReset()
  vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(client as never)
})

describe('ISSUE-23 evaluateBadgesAfterXp', () => {
  it('evaluates the learner with the service-role client', async () => {
    vi.mocked(evaluateAndAwardBadges).mockResolvedValue([])
    await expect(evaluateBadgesAfterXp('u-1')).resolves.toBeUndefined()
    expect(evaluateAndAwardBadges).toHaveBeenCalledWith(client, 'u-1')
    expect(logSystemError).not.toHaveBeenCalled()
  })

  it('a rejected evaluator does not propagate and is logged', async () => {
    vi.mocked(evaluateAndAwardBadges).mockRejectedValue(new Error('db down'))
    await expect(evaluateBadgesAfterXp('u-1')).resolves.toBeUndefined()
    expect(logSystemError).toHaveBeenCalledTimes(1)
    const entry = vi.mocked(logSystemError).mock.calls[0][0]
    expect(entry.operation).toBe('badges_evaluate_after_xp')
    expect(entry.userId).toBe('u-1')
    expect(entry.message).toContain('db down')
  })

  it('a failing client factory or logger still does not throw', async () => {
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockImplementation(() => {
      throw new Error('no key')
    })
    vi.mocked(logSystemError).mockRejectedValue(new Error('logger down'))
    await expect(evaluateBadgesAfterXp('u-1')).resolves.toBeUndefined()
    expect(evaluateAndAwardBadges).not.toHaveBeenCalled()
  })
})
