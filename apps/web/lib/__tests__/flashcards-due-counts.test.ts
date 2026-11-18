import { describe, it, expect, vi, beforeEach } from 'vitest'

// Audit #16: due-card counts for a page of learners in one batched read, with the same rule as
// getDueCardsCount (lib/flashcards-service.ts).

const lessons: Record<string, string[]> = {
  'l-1': ['fc-l-1-1', 'fc-l-1-2'],
  'l-2': ['fc-l-2-1'],
  'l-3': ['fc-l-3-1', 'fc-l-3-2'],
}

vi.mock('@/lib/lesson-loader', () => ({
  fetchCurriculumData: vi.fn(async () => ({ lessons: Object.keys(lessons).map((id) => ({ id, module: 'm' })) })),
  fetchCompiledLesson: vi.fn(async (id: string) => ({
    blocks: [{ type: 'text' }, { type: 'flashcardDeck', cards: (lessons[id] ?? []).map((cid) => ({ id: cid })) }],
  })),
}))

import { fetchCompiledLesson } from '@/lib/lesson-loader'
import { getDueCardsCounts } from '../flashcards-due-counts'

type Calls = Array<{ table: string; filters: Array<[string, unknown]>; orders: string[]; range: [number, number] | null }>

function fake(tables: Record<string, Array<Record<string, unknown>>>, calls: Calls, fail?: string) {
  return {
    from: (table: string) => {
      const call: Calls[number] = { table, filters: [], orders: [], range: null }
      calls.push(call)
      const b: Record<string, unknown> = {}
      b.select = () => b
      b.in = (col: string, v: unknown) => {
        call.filters.push([col, v])
        return b
      }
      b.order = (col: string) => {
        call.orders.push(col)
        return b
      }
      b.range = (from: number, to: number) => {
        call.range = [from, to]
        return b
      }
      b.then = (resolve: (v: unknown) => unknown) => {
        if (fail === table) return Promise.resolve({ data: null, error: { message: `${table} down` } }).then(resolve)
        let rows = tables[table] ?? []
        for (const [col, v] of call.filters) rows = rows.filter((r) => (v as unknown[]).includes(r[col]))
        return Promise.resolve({ data: rows, error: null }).then(resolve)
      }
      return b
    },
  }
}

const NOW = new Date('2026-11-17T12:00:00Z')
const PAST = '2026-11-16T00:00:00Z'
const FUTURE = '2026-11-20T00:00:00Z'

beforeEach(() => vi.mocked(fetchCompiledLesson).mockClear())

describe('getDueCardsCounts', () => {
  it('counts due cards per learner from two paged, ordered reads', async () => {
    const calls: Calls = []
    const supabase = fake(
      {
        user_lesson_progress: [
          { user_id: 'a', lesson_id: 'l-1', status: 'completed' },
          { user_id: 'b', lesson_id: 'l-2', status: 'in_progress' },
          { user_id: 'b', lesson_id: 'unknown-lesson', status: 'completed' },
        ],
        user_flashcard_srs: [
          // a: one card reviewed and not due yet, one never reviewed -> 1 due
          { user_id: 'a', flashcard_id: 'fc-l-1-1', lesson_id: 'l-1', next_review_at: FUTURE },
          // b: l-2 card overdue (1) plus an SRS record in l-3 unlocks l-3 (2 cards, one overdue,
          // one never reviewed) -> 3 due
          { user_id: 'b', flashcard_id: 'fc-l-2-1', lesson_id: 'l-2', next_review_at: PAST },
          { user_id: 'b', flashcard_id: 'fc-l-3-1', lesson_id: 'l-3', next_review_at: PAST },
        ],
      },
      calls
    )

    const counts = await getDueCardsCounts(supabase as never, ['a', 'b', 'c'], NOW)
    expect(Object.fromEntries(counts)).toEqual({ a: 1, b: 3, c: 0 })

    // One read per table for the whole page, each paged with a stable order.
    expect(calls.map((c) => c.table).sort()).toEqual(['user_flashcard_srs', 'user_lesson_progress'])
    const progress = calls.find((c) => c.table === 'user_lesson_progress')!
    expect(progress.orders).toEqual(['user_id', 'lesson_id'])
    expect(progress.range).toEqual([0, 999])
    expect(progress.filters).toContainEqual(['status', ['completed', 'in_progress', 'started']])
    const srs = calls.find((c) => c.table === 'user_flashcard_srs')!
    expect(srs.orders).toEqual(['user_id', 'flashcard_id'])
    // Each needed lesson is loaded once, not once per learner.
    expect(vi.mocked(fetchCompiledLesson).mock.calls.map((c) => c[0]).sort()).toEqual(['l-1', 'l-2', 'l-3'])
  })

  it('counts an overdue SRS card whose record names another lesson', async () => {
    const supabase = fake(
      {
        user_lesson_progress: [],
        // The record says l-1 but the card lives in l-3's deck.
        user_flashcard_srs: [
          { user_id: 'a', flashcard_id: 'fc-l-3-2', lesson_id: 'l-1', next_review_at: PAST },
          { user_id: 'a', flashcard_id: 'fc-gone-1', lesson_id: 'l-1', next_review_at: PAST },
        ],
      },
      []
    )
    const counts = await getDueCardsCounts(supabase as never, ['a'], NOW)
    // l-1 deck (2 never reviewed) + fc-l-3-2 overdue; a card no longer in the curriculum is ignored.
    expect(counts.get('a')).toBe(3)
  })

  it('throws on a failed read', async () => {
    await expect(getDueCardsCounts(fake({}, [], 'user_flashcard_srs') as never, ['a'], NOW)).rejects.toThrow('user_flashcard_srs down')
  })

  it('makes no read for an empty page', async () => {
    const calls: Calls = []
    expect((await getDueCardsCounts(fake({}, calls) as never, [], NOW)).size).toBe(0)
    expect(calls).toHaveLength(0)
  })
})
