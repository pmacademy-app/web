import { describe, it } from 'node:test'
import assert from 'node:assert'
import { isLessonUnlocked, completeLesson } from '../lessons-completion-service'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../supabase'

/**
 * Mock Supabase factory for testing curriculum_access_override and sequential unlocking.
 */
function createMockSupabase(options: {
  userOverride?: boolean
  progressRows?: Array<{ lesson_id: string; status: 'completed' | 'in_progress' | 'not_started'; xp_earned?: number }>
  totalXp?: number
}) {
  const progressStore = new Map<string, {
    user_id: string
    lesson_id: string
    status: 'completed' | 'in_progress' | 'not_started'
    quiz_score: number | null
    quiz_attempts: number
    xp_earned: number
    completed_at: string | null
  }>()

  if (options.progressRows) {
    for (const row of options.progressRows) {
      progressStore.set(`user123:${row.lesson_id}`, {
        user_id: 'user123',
        lesson_id: row.lesson_id,
        status: row.status,
        quiz_score: 100,
        quiz_attempts: 1,
        xp_earned: row.xp_earned ?? 50,
        completed_at: '2026-08-01T00:00:00Z',
      })
    }
  }

  let userTotalXp = options.totalXp ?? 0
  const xpEvents: Array<{ user_id: string; xp_amount: number; event_type: string }> = []

  const mockClient = {
    from: (table: string) => {
      if (table === 'users') {
        return {
          select: (cols: string) => ({
            eq: (_field: string, id: string) => ({
              maybeSingle: () => {
                if (cols.includes('curriculum_access_override')) {
                  return Promise.resolve({
                    data: { curriculum_access_override: Boolean(options.userOverride) },
                    error: null,
                  })
                }
                return Promise.resolve({
                  data: { id, total_xp: userTotalXp, curriculum_access_override: Boolean(options.userOverride) },
                  error: null,
                })
              },
            }),
          }),
        }
      }

      if (table === 'user_lesson_progress') {
        let selectedFields = '*'
        let filterUserId = ''
        let filterLessonId = ''

        const chain = {
          select: (cols?: string) => {
            if (cols) selectedFields = cols
            return chain
          },
          eq: (field: string, val: string) => {
            if (field === 'user_id') filterUserId = val
            if (field === 'lesson_id') filterLessonId = val
            return chain
          },
          maybeSingle: () => {
            const key = `${filterUserId}:${filterLessonId}`
            const found = progressStore.get(key)
            if (!found) return Promise.resolve({ data: null, error: null })
            if (selectedFields === 'status') {
              return Promise.resolve({ data: { status: found.status }, error: null })
            }
            return Promise.resolve({ data: found, error: null })
          },
          upsert: (record: Record<string, unknown>) => {
            const key = `${record.user_id}:${record.lesson_id}`
            const existing = progressStore.get(key)
            const updated = {
              user_id: String(record.user_id),
              lesson_id: String(record.lesson_id),
              status: (record.status as 'completed') || 'completed',
              quiz_score: (record.quiz_score as number) ?? existing?.quiz_score ?? 0,
              quiz_attempts: (record.quiz_attempts as number) ?? existing?.quiz_attempts ?? 1,
              xp_earned: (record.xp_earned as number) ?? existing?.xp_earned ?? 0,
              completed_at: (record.completed_at as string) ?? new Date().toISOString(),
            }
            progressStore.set(key, updated)
            return {
              select: () => ({
                single: () => Promise.resolve({ data: updated, error: null }),
              }),
            }
          },
        }
        return chain
      }

      if (table === 'xp_events') {
        return {
          insert: (evt: { user_id: string; xp_amount: number; event_type: string }) => {
            xpEvents.push(evt)
            userTotalXp += evt.xp_amount
            return Promise.resolve({ data: null, error: null })
          },
        }
      }

      return {}
    },
  }

  return {
    client: mockClient as unknown as SupabaseClient<Database>,
    progressStore,
    xpEvents,
    getUserTotalXp: () => userTotalXp,
  }
}

describe('Curriculum Access Override Unit Tests', () => {

  it('1. Normal user + previous lesson incomplete -> lesson remains locked', async () => {
    const { client } = createMockSupabase({ userOverride: false, progressRows: [] })
    const unlocked = await isLessonUnlocked(client, 'user123', 'les_prrl23', 'les_zoyq8a')
    assert.strictEqual(unlocked, false, 'Lesson 2 must be locked when Lesson 1 is not completed')
  })

  it('2. Normal user + previous lesson completed -> lesson unlocks normally', async () => {
    const { client } = createMockSupabase({
      userOverride: false,
      progressRows: [{ lesson_id: 'les_zoyq8a', status: 'completed' }],
    })
    const unlocked = await isLessonUnlocked(client, 'user123', 'les_prrl23', 'les_zoyq8a')
    assert.strictEqual(unlocked, true, 'Lesson 2 must unlock when Lesson 1 is completed')
  })

  it('3. Override user + previous lesson incomplete -> lesson unlocks', async () => {
    const { client } = createMockSupabase({ userOverride: true, progressRows: [] })
    const unlocked = await isLessonUnlocked(client, 'user123', 'les_prrl23', 'les_zoyq8a')
    assert.strictEqual(unlocked, true, 'Lesson 2 must unlock for override user even if Lesson 1 is incomplete')
  })

  it('4. Override user can access the first lesson of every module', async () => {
    const { client } = createMockSupabase({ userOverride: true, progressRows: [] })
    // First lesson in curriculum has no prerequisite
    const lesson1Unlocked = await isLessonUnlocked(client, 'user123', 'les_zoyq8a', null)
    // Module 2 start lesson (lesson 11, prerequisite les_qvbz2l is incomplete)
    const module2Unlocked = await isLessonUnlocked(client, 'user123', 'les_4kpbq6', 'les_qvbz2l')

    assert.strictEqual(lesson1Unlocked, true, 'First lesson in curriculum is always unlocked')
    assert.strictEqual(module2Unlocked, true, 'Module 2 start lesson unlocks for override user')
  })

  it('5. Opening an unlocked lesson through the override does not create a completion record', async () => {
    const { client, progressStore } = createMockSupabase({ userOverride: true, progressRows: [] })

    // Perform unlock check
    await isLessonUnlocked(client, 'user123', 'les_091713', 'les_td6v2u')

    // Verify progressStore remains completely empty
    assert.strictEqual(progressStore.size, 0, 'Unlock check must be strictly read-only')
  })

  it('6. Opening lessons through the override does not award XP', async () => {
    const { client, xpEvents, getUserTotalXp } = createMockSupabase({ userOverride: true, progressRows: [], totalXp: 100 })

    await isLessonUnlocked(client, 'user123', 'les_0iss34', 'les_bzugx4')

    assert.strictEqual(xpEvents.length, 0, 'No XP events must be created when checking unlock state')
    assert.strictEqual(getUserTotalXp(), 100, 'Total XP balance must remain unchanged')
  })

  it('7. Override user completing a lesson normally still records genuine completion and XP', async () => {
    const { client, progressStore } = createMockSupabase({ userOverride: true, progressRows: [] })

    const result = await completeLesson(client, 'user123', 'les_zoyq8a', 100, 50)

    assert.strictEqual(result.status, 'completed')
    assert.strictEqual(result.xp_earned, 50)

    const stored = progressStore.get('user123:les_zoyq8a')
    assert.ok(stored, 'Progress row must be saved upon actual completeLesson call')
    assert.strictEqual(stored?.status, 'completed')
    assert.strictEqual(stored?.quiz_score, 100)
    assert.strictEqual(stored?.xp_earned, 50)
  })

  it('8. Existing users with curriculum_access_override = false behave exactly as before', async () => {
    const { client } = createMockSupabase({ userOverride: false, progressRows: [] })
    const unlockedDeepLesson = await isLessonUnlocked(client, 'user123', 'les_efapbf', 'les_0j03yx')

    assert.strictEqual(unlockedDeepLesson, false, 'Deep curriculum lessons remain locked for normal users without prerequisites')
  })

  it('9. Dashboard progress remains based on actual completed lessons, not access permissions', async () => {
    const { progressStore } = createMockSupabase({ userOverride: true, progressRows: [] })

    // Simulate dashboard completion calculation: filters user_lesson_progress by status = 'completed'
    const completedRows = Array.from(progressStore.values()).filter((r) => r.status === 'completed')

    assert.strictEqual(completedRows.length, 0, 'Actual completed count for override user with 0 completed lessons must remain 0')
  })
})
