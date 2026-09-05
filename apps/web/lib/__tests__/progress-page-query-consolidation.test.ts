/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest'
import { getSkillRadarSummary } from '../skillRadar'
import { getUserBadgesData } from '../badges-db'

/**
 * Verifies the Progress-page query consolidation: when a caller already has
 * `user_lesson_progress` rows (and, for skill radar, a lesson→module map) it
 * can hand them to these services via the new `preloaded` param and the
 * services must NOT issue their own duplicate query for that data — while
 * still behaving identically to the original always-fetch path when no
 * preload is given (protecting the other, unrelated call sites).
 */

function chainable(result: { data: unknown; error?: unknown }, singleResult: { data: unknown; error?: unknown }) {
  const obj: any = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') return (resolve: (v: unknown) => void) => resolve(result)
        if (prop === 'maybeSingle' || prop === 'single') return () => chainable(singleResult, singleResult)
        return () => obj
      },
    }
  )
  return obj
}

describe('Progress page query consolidation', () => {
  it('getSkillRadarSummary skips the user_lesson_progress query and curriculum file read when preloaded data is given', async () => {
    const fromSpy = vi.fn((table: string) => {
      // Should never be called for 'user_lesson_progress' when progressRows is preloaded.
      if (table === 'user_lesson_progress') {
        throw new Error('getSkillRadarSummary should not query user_lesson_progress when preloaded.progressRows is provided')
      }
      return chainable({ data: [] }, { data: null })
    })
    const supabase = { from: fromSpy } as any

    const progressRows = [
      { lesson_id: 'les_1', status: 'completed' as const, quiz_score: 100, quiz_attempts: 1 },
      { lesson_id: 'les_2', status: 'completed' as const, quiz_score: 80, quiz_attempts: 2 },
    ]
    const lessonModuleMap = new Map([
      ['les_1', 'foundations'],
      ['les_2', 'discovery'],
    ])

    const summary = await getSkillRadarSummary(supabase, 'user-1', { progressRows, lessonModuleMap })

    expect(fromSpy).not.toHaveBeenCalled()
    expect(summary.breakdown).toHaveLength(7)
    expect(summary.overallScore).toBeGreaterThan(0)
  })

  it('getSkillRadarSummary falls back to its own query when no preload is given (other call sites unaffected)', async () => {
    const fromSpy = vi.fn((table: string) => {
      if (table === 'user_lesson_progress') {
        return chainable(
          { data: [{ lesson_id: 'les_1', status: 'completed', quiz_score: 100, quiz_attempts: 1 }] },
          { data: null }
        )
      }
      return chainable({ data: [] }, { data: null })
    })
    const supabase = { from: fromSpy } as any

    const summary = await getSkillRadarSummary(supabase, 'user-1')

    expect(fromSpy).toHaveBeenCalledWith('user_lesson_progress')
    expect(summary.breakdown).toHaveLength(7)
  })

  it('getUserBadgesData skips the user_lesson_progress and capstone_submissions queries when preloaded rows are given', async () => {
    const fromSpy = vi.fn((table: string) => {
      if (table === 'user_lesson_progress' || table === 'capstone_submissions') {
        throw new Error(`getUserBadgesData should not query ${table} when preloaded rows are provided`)
      }
      if (table === 'users') {
        return chainable({ data: null }, { data: { total_xp: 500, level: 3, current_streak: 2, longest_streak: 5, is_portfolio_public: true, streak_freezes_available: 0, email: 'a@b.com', name: 'Test User' } })
      }
      if (table === 'badges') return chainable({ data: [] }, { data: null })
      if (table === 'user_badges') return chainable({ data: [] }, { data: null })
      return chainable({ data: [] }, { data: null })
    })
    const supabase = { from: fromSpy } as any

    const progressRows = [
      { lesson_id: 'les_1', status: 'completed', quiz_score: 100, quiz_attempts: 1 },
      { lesson_id: 'les_2', status: 'completed', quiz_score: 90, quiz_attempts: 1 },
    ]
    const capstoneRows = [{ status: 'submitted' }, { status: 'draft' }]

    const result = await getUserBadgesData(supabase, 'user-1', { progressRows, capstoneRows })

    expect(fromSpy).not.toHaveBeenCalledWith('user_lesson_progress')
    expect(fromSpy).not.toHaveBeenCalledWith('capstone_submissions')
    expect(result.totalAvailable).toBeGreaterThan(0)
  })
})
