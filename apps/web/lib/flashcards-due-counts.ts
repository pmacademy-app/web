import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/db/pagination'
import { fetchCompiledLesson, fetchCurriculumData } from '@/lib/lesson-loader'

/** Progress statuses that unlock a lesson's flashcards (same set as getReviewQueueData). */
const UNLOCKING_STATUSES = ['completed', 'in_progress', 'started']

type DeckBlock = { type: string; cards?: { id: string }[] }

async function lessonCardIds(lessonId: string): Promise<string[]> {
  const lesson = await fetchCompiledLesson(lessonId)
  const ids: string[] = []
  for (const block of (lesson?.blocks ?? []) as DeckBlock[]) {
    if (block.type !== 'flashcardDeck' || !Array.isArray(block.cards)) continue
    for (const card of block.cards) ids.push(card.id)
  }
  return ids
}

/**
 * Due-card counts for a page of learners in two paged reads, for the daily reminder (audit #16).
 *
 * Same rule as `getDueCardsCount` in lib/flashcards-service.ts: a learner's cards are the decks
 * of lessons they completed, started or have an SRS record in, plus any card they have an SRS
 * record for elsewhere in the curriculum. A card is due when it has no SRS record or its
 * `next_review_at` has passed. Every learner in `userIds` gets an entry (0 when nothing is due).
 * A failed read throws.
 */
export async function getDueCardsCounts(
  supabase: SupabaseClient<Database>,
  userIds: readonly string[],
  now: Date = new Date()
): Promise<Map<string, number>> {
  const ids = [...new Set(userIds)]
  const counts = new Map<string, number>(ids.map((id) => [id, 0]))
  if (ids.length === 0) return counts

  const [progressRows, srsRows, curriculum] = await Promise.all([
    fetchAllRows<{ user_id: string; lesson_id: string }>((lo, hi) =>
      supabase
        .from('user_lesson_progress')
        .select('user_id, lesson_id')
        .in('user_id', ids)
        .in('status', UNLOCKING_STATUSES)
        .order('user_id')
        .order('lesson_id')
        .range(lo, hi)
    ),
    fetchAllRows<{ user_id: string; flashcard_id: string; lesson_id: string | null; next_review_at: string }>((lo, hi) =>
      supabase
        .from('user_flashcard_srs')
        .select('user_id, flashcard_id, lesson_id, next_review_at')
        .in('user_id', ids)
        .order('user_id')
        .order('flashcard_id')
        .range(lo, hi)
    ),
    fetchCurriculumData(),
  ])

  const curriculumLessonIds = (curriculum?.lessons ?? []).map((l) => l.id)
  const inCurriculum = new Set(curriculumLessonIds)

  const unlockedByUser = new Map<string, Set<string>>()
  const unlock = (userId: string, lessonId: string | null) => {
    if (!lessonId || !inCurriculum.has(lessonId)) return
    const set = unlockedByUser.get(userId) ?? new Set<string>()
    set.add(lessonId)
    unlockedByUser.set(userId, set)
  }
  for (const row of progressRows) unlock(row.user_id, row.lesson_id)

  const reviewAtByUser = new Map<string, Map<string, number>>()
  for (const row of srsRows) {
    unlock(row.user_id, row.lesson_id)
    const map = reviewAtByUser.get(row.user_id) ?? new Map<string, number>()
    map.set(row.flashcard_id, new Date(row.next_review_at).getTime())
    reviewAtByUser.set(row.user_id, map)
  }

  // Each needed lesson is loaded once for the whole page.
  const neededLessons = [...new Set([...unlockedByUser.values()].flatMap((set) => [...set]))]
  const cardsByLesson = new Map<string, string[]>()
  const loaded = await Promise.all(neededLessons.map(lessonCardIds))
  neededLessons.forEach((id, i) => cardsByLesson.set(id, loaded[i]))

  const nowTime = now.getTime()
  const orphans = new Map<string, string[]>()
  for (const userId of ids) {
    const reviewAt = reviewAtByUser.get(userId) ?? new Map<string, number>()
    const cards = new Set<string>()
    for (const lessonId of unlockedByUser.get(userId) ?? []) {
      for (const cardId of cardsByLesson.get(lessonId) ?? []) cards.add(cardId)
    }
    let due = 0
    for (const cardId of cards) {
      const at = reviewAt.get(cardId)
      if (at === undefined || at <= nowTime) due++
    }
    counts.set(userId, due)
    const outside = [...reviewAt.keys()].filter((cardId) => !cards.has(cardId))
    if (outside.length > 0) orphans.set(userId, outside)
  }

  // SRS records whose card is not in an unlocked deck still count when the card exists
  // somewhere in the curriculum, as getReviewQueueData does.
  if (orphans.size > 0) {
    const remaining = curriculumLessonIds.filter((id) => !cardsByLesson.has(id))
    const remainingCards = await Promise.all(remaining.map(lessonCardIds))
    const allCards = new Set<string>([...cardsByLesson.values(), ...remainingCards].flat())
    for (const [userId, cardIds] of orphans) {
      const reviewAt = reviewAtByUser.get(userId)!
      const extra = cardIds.filter((cardId) => allCards.has(cardId) && reviewAt.get(cardId)! <= nowTime).length
      counts.set(userId, (counts.get(userId) ?? 0) + extra)
    }
  }

  return counts
}
