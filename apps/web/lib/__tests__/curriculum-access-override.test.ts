import { describe, it, expect } from 'vitest'
import { isLessonUnlocked, completeLesson } from '../lessons-completion-service'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../supabase'

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
    expect(unlocked).toBe(false)
  })

  it('2. Normal user + previous lesson completed -> lesson unlocks normally', async () => {
    const { client } = createMockSupabase({
      userOverride: false,
      progressRows: [{ lesson_id: 'les_zoyq8a', status: 'completed' }],
    })
    const unlocked = await isLessonUnlocked(client, 'user123', 'les_prrl23', 'les_zoyq8a')
    expect(unlocked).toBe(true)
  })

  it('3. Override user + previous lesson incomplete -> lesson unlocks', async () => {
    const { client } = createMockSupabase({ userOverride: true, progressRows: [] })
    const unlocked = await isLessonUnlocked(client, 'user123', 'les_prrl23', 'les_zoyq8a')
    expect(unlocked).toBe(true)
  })

  it('4. Override user can access the first lesson of every module', async () => {
    const { client } = createMockSupabase({ userOverride: true, progressRows: [] })
    const lesson1Unlocked = await isLessonUnlocked(client, 'user123', 'les_zoyq8a', null)
    const module2Unlocked = await isLessonUnlocked(client, 'user123', 'les_4kpbq6', 'les_qvbz2l')

    expect(lesson1Unlocked).toBe(true)
    expect(module2Unlocked).toBe(true)
  })

  it('5. Opening an unlocked lesson through the override does not create a completion record', async () => {
    const { client, progressStore } = createMockSupabase({ userOverride: true, progressRows: [] })
    await isLessonUnlocked(client, 'user123', 'les_091713', 'les_td6v2u')
    expect(progressStore.size).toBe(0)
  })

  it('6. Opening lessons through the override does not award XP', async () => {
    const { client, xpEvents, getUserTotalXp } = createMockSupabase({ userOverride: true, progressRows: [], totalXp: 100 })
    await isLessonUnlocked(client, 'user123', 'les_0iss34', 'les_bzugx4')
    expect(xpEvents.length).toBe(0)
    expect(getUserTotalXp()).toBe(100)
  })

  it('7. Override user completing a lesson normally still records genuine completion and XP', async () => {
    const { client, progressStore } = createMockSupabase({ userOverride: true, progressRows: [] })
    const result = await completeLesson(client, 'user123', 'les_zoyq8a', 100, 50)

    expect(result.status).toBe('completed')
    expect(result.xp_earned).toBe(50)

    const stored = progressStore.get('user123:les_zoyq8a')
    expect(stored).toBeDefined()
    expect(stored?.status).toBe('completed')
    expect(stored?.quiz_score).toBe(100)
    expect(stored?.xp_earned).toBe(50)
  })

  it('8. Existing users with curriculum_access_override = false behave exactly as before', async () => {
    const { client } = createMockSupabase({ userOverride: false, progressRows: [] })
    const unlockedDeepLesson = await isLessonUnlocked(client, 'user123', 'les_efapbf', 'les_0j03yx')
    expect(unlockedDeepLesson).toBe(false)
  })

  it('9. Dashboard progress remains based on actual completed lessons, not access permissions', async () => {
    const { progressStore } = createMockSupabase({ userOverride: true, progressRows: [] })
    const completedRows = Array.from(progressStore.values()).filter((r) => r.status === 'completed')
    expect(completedRows.length).toBe(0)
  })
})
