/**
 * Phase 6 — server-side access gate (`resolveLessonAccessForUser`).
 *
 * Exercises the DB-backed path the lesson page uses: it loads the learner's override + full
 * progress set once and delegates to the pure resolver. Covers treatment entry unlock,
 * intra-module sequencing, grandfathering across a flag flip, override, and that it never
 * writes progress/XP.
 */

import { describe, it, expect } from 'vitest'
import { resolveLessonAccessForUser } from '../lessons-completion-service'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../supabase'
import type { CurriculumEntry } from '@/types'

const MODULE_SLUGS = [
  'foundations', 'discovery', 'design', 'execution', 'growth',
  'leadership', 'technical', 'strategy', 'capstone',
]
const curriculum: CurriculumEntry[] = Array.from({ length: 90 }, (_, i) => ({
  id: `les_${String(i + 1).padStart(3, '0')}`,
  order: i + 1,
  title: `Lesson ${i + 1}`,
  module: MODULE_SLUGS[Math.floor(i / 10)],
  estimatedReadingTime: 5,
})) as CurriculumEntry[]
const id = (n: number) => `les_${String(n).padStart(3, '0')}`

function mockSupabase(opts: {
  override?: boolean
  rows?: Array<{ lesson_id: string; status: 'completed' | 'in_progress' | 'not_started' }>
}) {
  let writes = 0
  const client = {
    from(table: string) {
      if (table === 'users') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: { curriculum_access_override: Boolean(opts.override) }, error: null }),
            }),
          }),
        }
      }
      if (table === 'user_lesson_progress') {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: opts.rows ?? [], error: null }),
          }),
          upsert: () => {
            writes++
            return { select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }
          },
        }
      }
      return {}
    },
  }
  return { client: client as unknown as SupabaseClient<Database>, getWrites: () => writes }
}

describe('resolveLessonAccessForUser', () => {
  it('treatment: unlocks a module entry lesson for a new learner', async () => {
    const { client } = mockSupabase({ rows: [] })
    const info = await resolveLessonAccessForUser(client, 'u1', id(11), { curriculum, treatment: true })
    expect(info.isAccessible).toBe(true)
    expect(info.reason).toBe('module_entry')
  })

  it('treatment: locks the second lesson of a module until the first is complete', async () => {
    const locked = mockSupabase({ rows: [] })
    expect((await resolveLessonAccessForUser(locked.client, 'u1', id(12), { curriculum, treatment: true })).isAccessible).toBe(false)

    const ready = mockSupabase({ rows: [{ lesson_id: id(11), status: 'completed' }] })
    const info = await resolveLessonAccessForUser(ready.client, 'u1', id(12), { curriculum, treatment: true })
    expect(info.isAccessible).toBe(true)
  })

  it('control: keeps the global-sequential gate (module 2 entry locked for a new learner)', async () => {
    const { client } = mockSupabase({ rows: [] })
    expect((await resolveLessonAccessForUser(client, 'u1', id(11), { curriculum, treatment: false })).isAccessible).toBe(false)
    expect((await resolveLessonAccessForUser(client, 'u1', id(1), { curriculum, treatment: false })).isAccessible).toBe(true)
  })

  it('rollback: an opened module-entry lesson stays accessible after the flag flips to control', async () => {
    // Learner opened les_011 in treatment → an in_progress row exists. Now treatment=false.
    const { client } = mockSupabase({ rows: [{ lesson_id: id(11), status: 'in_progress' }] })
    const info = await resolveLessonAccessForUser(client, 'u1', id(11), { curriculum, treatment: false })
    expect(info.isAccessible).toBe(true)
    expect(info.reason).toBe('grandfathered')

    // ...but the NEXT lesson in that module is still locked (intra-module sequencing holds).
    const next = await resolveLessonAccessForUser(client, 'u1', id(12), { curriculum, treatment: false })
    expect(next.isAccessible).toBe(false)
  })

  it('override unlocks everything', async () => {
    const { client } = mockSupabase({ override: true, rows: [] })
    expect((await resolveLessonAccessForUser(client, 'u1', id(90), { curriculum, treatment: false })).isAccessible).toBe(true)
  })

  it('never writes progress or XP (read-only gate)', async () => {
    const m = mockSupabase({ rows: [] })
    await resolveLessonAccessForUser(m.client, 'u1', id(11), { curriculum, treatment: true })
    expect(m.getWrites()).toBe(0)
  })
})
