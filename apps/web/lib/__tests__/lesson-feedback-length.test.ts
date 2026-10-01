/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  recordLessonFeedback,
  getLessonQualityMetrics,
  ALLOWED_FEEDBACK_TAGS,
  ISSUE_TAGS,
  CHURN_TAGS,
} from '../feedback/lesson-feedback-service'

interface MockRow {
  id?: string
  user_id?: string
  lesson_id?: string
  type?: string
  rating?: number | null
  tags?: string[]
  content?: string
  created_at?: string
  [k: string]: unknown
}

function makeSupabase(store: MockRow[]) {
  return {
    from: vi.fn((table: string) => {
      if (table !== 'user_feedback') return {}
      return {
        select: vi.fn(() => {
          let filtered = [...store]
          const chain: Record<string, unknown> = {
            eq: vi.fn((c: string, v: unknown) => {
              filtered = filtered.filter((r) => r[c] === v)
              return chain
            }),
            gte: vi.fn(() => chain),
            not: vi.fn(() => chain),
            order: vi.fn(() => chain),
            limit: vi.fn((n: number) => {
              filtered = filtered.slice(0, n)
              return chain
            }),
            maybeSingle: vi.fn(async () => ({ data: filtered[0] ?? null, error: null })),
            then: (resolve: (r: { data: MockRow[]; error: null }) => void) => resolve({ data: filtered, error: null }),
          }
          return chain
        }),
        insert: vi.fn((payload: MockRow) => {
          const row = { id: `fb-${store.length}`, created_at: new Date().toISOString(), ...payload }
          store.push(row)
          return {
            select: vi.fn(() => ({ single: vi.fn(async () => ({ data: row, error: null })) })),
          }
        }),
      }
    }),
  } as unknown as SupabaseClient<Database>
}

describe('Phase 7 (7.4) — lesson feedback length dimension & churn survey', () => {
  let store: MockRow[]
  beforeEach(() => {
    vi.clearAllMocks()
    store = []
  })

  it('whitelists the new length + churn tags', () => {
    expect(ALLOWED_FEEDBACK_TAGS).toContain('too_long')
    expect(ALLOWED_FEEDBACK_TAGS).toContain('length_would_churn')
    expect(ALLOWED_FEEDBACK_TAGS).toContain('length_would_not_churn')
  })

  it('classifies too_long as a quality issue but keeps churn answers out of the issue metric', () => {
    expect(ISSUE_TAGS.has('too_long')).toBe(true)
    expect(ISSUE_TAGS.has('length_would_churn' as any)).toBe(false)
    expect(CHURN_TAGS.has('length_would_churn')).toBe(true)
    expect(CHURN_TAGS.has('length_would_not_churn')).toBe(true)
  })

  it('persists a too_long tag and a churn answer', async () => {
    const supabase = makeSupabase(store)
    const res = await recordLessonFeedback(supabase, 'user-1', 'foundations-1-1', {
      rating: 2,
      tags: ['too_long', 'length_would_churn'],
    })
    expect(res.success).toBe(true)
    expect(res.feedback.tags).toContain('too_long')
    expect(res.feedback.tags).toContain('length_would_churn')
    expect(store).toHaveLength(1)
  })

  it('still filters unknown tags while accepting the new ones', async () => {
    const supabase = makeSupabase(store)
    const res = await recordLessonFeedback(supabase, 'user-1', 'foundations-1-1', {
      rating: 3,
      tags: ['too_long', 'not_a_real_tag', 'length_would_not_churn'],
    })
    expect(res.feedback.tags.sort()).toEqual(['length_would_not_churn', 'too_long'])
  })

  it('too_long flags a lesson as an issue; a churn answer alone with a high rating does not', async () => {
    // too_long on a high rating → flagged (it is an issue tag)
    store.push({ lesson_id: 'les-long', type: 'lesson_rating', rating: 5, tags: ['too_long'] })
    const longMetrics = await getLessonQualityMetrics(makeSupabase(store), 'les-long')
    expect(longMetrics.flaggedIssuesCount).toBe(1)

    // churn answer on a high rating, no issue tag → NOT flagged, clarity intact
    const store2: MockRow[] = [
      { lesson_id: 'les-ok', type: 'lesson_rating', rating: 5, tags: ['length_would_not_churn'] },
    ]
    const okMetrics = await getLessonQualityMetrics(makeSupabase(store2), 'les-ok')
    expect(okMetrics.flaggedIssuesCount).toBe(0)
    expect(okMetrics.averageClarityScore).toBe(5)
    expect(okMetrics.needsReview).toBe(false)
  })
})
