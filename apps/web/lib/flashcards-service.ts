import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'
import {
  calculateSM2,
  SRSRating,
  FlashcardItem,
  UserFlashcardSRSRow,
  ReviewStats,
  getDueCards,
  calculateReviewStats,
} from '@/lib/srs'
import { awardXp } from '@/lib/xp-service'
import { getRuntimeXpValues } from '@/lib/xp'
import { updateUserStreak } from '@/lib/streaks-db'
import { getLocalDateString } from '@/lib/streaks'
import { fetchCurriculumData, fetchCompiledLesson } from '@/lib/lesson-loader'

interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown }>
}

export interface ReviewQueueData {
  dueCards: FlashcardItem[]
  allUnlockedCards: FlashcardItem[]
  stats: ReviewStats
}

/**
 * Retrieves the review queue data for an authenticated user.
 * Loads unlocked flashcards from completed lessons and evaluates SM-2 due dates.
 */
export async function getReviewQueueData(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<ReviewQueueData> {
  // 1. Fetch all lesson progress rows for the user (completed, in_progress, started)
  const { data: progressRows } = (await (supabase
    .from('user_lesson_progress') as unknown as DBChain)
    .select('lesson_id, status')
    .eq('user_id', userId)) as unknown as {
    data: { lesson_id: string; status: string }[] | null
  }

  // 2. Fetch all user SRS records
  const { data: srsRows } = (await (supabase
    .from('user_flashcard_srs') as unknown as DBChain)
    .select('*')
    .eq('user_id', userId)) as unknown as {
    data: UserFlashcardSRSRow[] | null
  }

  const srsRecordsMap = new Map<string, UserFlashcardSRSRow>()
  const srsLessonIds = new Set<string>()
  for (const row of srsRows || []) {
    srsRecordsMap.set(row.flashcard_id, row)
    const rowLessonId = (row as { lesson_id?: string }).lesson_id
    if (rowLessonId) {
      srsLessonIds.add(rowLessonId)
    }
  }

  // Unlocked lessons = completed lessons + in-progress/started lessons + any lesson with an SRS record
  const unlockedLessonIds = new Set<string>()
  for (const p of progressRows || []) {
    if (p.lesson_id && (p.status === 'completed' || p.status === 'in_progress' || p.status === 'started')) {
      unlockedLessonIds.add(p.lesson_id)
    }
  }
  for (const lid of srsLessonIds) {
    unlockedLessonIds.add(lid)
  }

  // 3. Fetch curriculum and extract flashcards from unlocked lessons
  const curriculum = await fetchCurriculumData()
  const curriculumLessons = curriculum?.lessons ?? []
  const targetLessons = curriculumLessons.filter((l) => unlockedLessonIds.has(l.id))

  const unlockedCards: FlashcardItem[] = []
  const cardIdsInUnlocked = new Set<string>()

  for (const lessonSummary of targetLessons) {
    const lessonDetail = await fetchCompiledLesson(lessonSummary.id)
    if (!lessonDetail || !lessonDetail.blocks) continue

    const flashcardBlocks = (lessonDetail.blocks as { type: string; cards?: { id: string; front: string; back: string; concept?: string }[] }[]).filter(
      (b) => b.type === 'flashcardDeck'
    )

    for (const block of flashcardBlocks) {
      if (block.cards && Array.isArray(block.cards)) {
        for (const card of block.cards) {
          if (!cardIdsInUnlocked.has(card.id)) {
            cardIdsInUnlocked.add(card.id)
            unlockedCards.push({
              id: card.id,
              lessonId: lessonSummary.id,
              front: card.front,
              back: card.back,
              concept: card.concept || card.front,
              module: lessonSummary.module,
            })
          }
        }
      }
    }
  }

  // Also include any card directly in srsRecordsMap that might belong to another lesson
  if (srsRecordsMap.size > cardIdsInUnlocked.size) {
    for (const [cardId] of srsRecordsMap.entries()) {
      if (!cardIdsInUnlocked.has(cardId)) {
        for (const lessonSummary of curriculumLessons) {
          if (unlockedLessonIds.has(lessonSummary.id)) continue
          const lessonDetail = await fetchCompiledLesson(lessonSummary.id)
          if (!lessonDetail?.blocks) continue
          const flashcardBlocks = (lessonDetail.blocks as { type: string; cards?: { id: string; front: string; back: string; concept?: string }[] }[]).filter(
            (b) => b.type === 'flashcardDeck'
          )
          for (const block of flashcardBlocks) {
            const foundCard = block.cards?.find((c) => c.id === cardId)
            if (foundCard && !cardIdsInUnlocked.has(cardId)) {
              cardIdsInUnlocked.add(cardId)
              unlockedCards.push({
                id: foundCard.id,
                lessonId: lessonSummary.id,
                front: foundCard.front,
                back: foundCard.back,
                concept: foundCard.concept || foundCard.front,
                module: lessonSummary.module,
              })
            }
          }
        }
      }
    }
  }

  // 4. Calculate today's completed reviews count from xp_events
  const { data: userProfile } = (await (supabase
    .from('users') as unknown as DBChain)
    .select('timezone')
    .eq('id', userId)
    .single()) as unknown as { data: { timezone: string } | null }

  const timezone = userProfile?.timezone || 'UTC'
  const todayStr = getLocalDateString(timezone, new Date())

  const { data: todayXpEvents } = (await (supabase
    .from('xp_events') as unknown as DBChain)
    .select('created_at')
    .eq('user_id', userId)
    .eq('source_type', 'flashcard')) as unknown as { data: { created_at: string }[] | null }

  const completedTodayCount = (todayXpEvents || []).filter((e) => {
    if (!e?.created_at) return false
    const d = new Date(e.created_at)
    return !isNaN(d.getTime()) && getLocalDateString(timezone, d) === todayStr
  }).length

  // 5. Evaluate due cards and aggregate stats
  const now = new Date()
  const dueCards = getDueCards(unlockedCards, srsRecordsMap, now)
  const stats = calculateReviewStats(unlockedCards, srsRecordsMap, completedTodayCount, now)

  return {
    dueCards,
    allUnlockedCards: unlockedCards,
    stats,
  }
}

/**
 * Service responsible for spaced repetition flashcard reviews and SM-2 persistence.
 * (PRD.md §4.4, Architecture.md §6).
 */
export async function recordFlashcardReview(
  supabase: SupabaseClient<Database>,
  userId: string,
  flashcardId: string,
  rating: number,
  explicitLessonId?: string
): Promise<{ nextReviewAt: Date; easeFactor: number }> {
  // 1. Fetch current SM-2 state from database
  const { data: srsData, error: srsFetchError } = (await (supabase
    .from('user_flashcard_srs') as unknown as DBChain)
    .select('*')
    .eq('user_id', userId)
    .eq('flashcard_id', flashcardId)
    .maybeSingle()) as unknown as { data: UserFlashcardSRSRow | null; error: unknown }

  if (srsFetchError) throw srsFetchError

  const prevState = srsData
    ? {
        repetitions: srsData.repetitions,
        intervalDays: srsData.interval_days,
        easeFactor: Number(srsData.ease_factor),
      }
    : { repetitions: 0, intervalDays: 0, easeFactor: 2.5 }

  // 2. Compute next spacing intervals using SM-2 Engine
  const nextState = calculateSM2(rating as SRSRating, prevState)

  // 3. Resolve lessonId (from parameter, existing SRS record, or flashcard ID prefix)
  let lessonId = explicitLessonId || (srsData as { lesson_id?: string })?.lesson_id || ''
  if (!lessonId) {
    const match = flashcardId.match(/^fc-(les_[a-z0-9]+)-/i)
    if (match) {
      lessonId = match[1]
    }
  }

  // 4. Persist SRS review state with composite key (user_id, lesson_id, flashcard_id)
  const srsPayload = {
    user_id: userId,
    lesson_id: lessonId,
    flashcard_id: flashcardId,
    ease_factor: nextState.easeFactor,
    interval_days: nextState.intervalDays,
    repetitions: nextState.repetitions,
    next_review_at: nextState.nextReviewAt.toISOString(),
  }

  const { error: upsertError } = await (supabase
    .from('user_flashcard_srs') as unknown as DBChain)
    .upsert(srsPayload, { onConflict: 'user_id,lesson_id,flashcard_id' })

  if (upsertError) {
    // Fallback if database table has primary key constraint on (user_id, flashcard_id)
    const { error: fallbackError } = await (supabase
      .from('user_flashcard_srs') as unknown as DBChain)
      .upsert(srsPayload, { onConflict: 'user_id,flashcard_id' })

    if (fallbackError) {
      console.error('[flashcards-service] Failed to upsert user_flashcard_srs:', upsertError, fallbackError)
      throw upsertError
    }
  }

  // 4. Award daily flashcard review XP via canonical XP service (deduplicated)
  try {
    const { data: userProfile } = await (supabase
      .from('users') as unknown as DBChain)
      .select('timezone')
      .eq('id', userId)
      .single() as unknown as { data: { timezone: string } | null; error: unknown }

    const timezone = userProfile?.timezone || 'UTC'
    const todayStr = getLocalDateString(timezone, new Date())

    const { data: existingEvents } = await (supabase
      .from('xp_events') as unknown as DBChain)
      .select('created_at')
      .eq('user_id', userId)
      .eq('source_type', 'flashcard')
      .eq('source_id', flashcardId) as unknown as { data: { created_at: string }[] | null; error: unknown }

    const hasAwardedToday = existingEvents?.some((e) => {
      if (!e?.created_at) return false
      const d = new Date(e.created_at)
      return !isNaN(d.getTime()) && getLocalDateString(timezone, d) === todayStr
    }) ?? false

    if (!hasAwardedToday) {
      const xpConfig = await getRuntimeXpValues(supabase)
      await awardXp(
        supabase,
        userId,
        'flashcard',
        xpConfig.FLASHCARD_REVIEW,
        flashcardId
      )
    }
  } catch (err) {
    console.error(`[flashcards-service] Error checking/awarding flashcard XP:`, err)
  }

  // 5. Update user streak
  await updateUserStreak(supabase, userId)

  return {
    nextReviewAt: nextState.nextReviewAt,
    easeFactor: nextState.easeFactor,
  }
}

/**
 * Dispatches review.completed event when an SRS flashcard review session is finished.
 */
export async function recordReviewSessionCompletion(
  supabase: SupabaseClient<Database>,
  userId: string,
  cardsReviewedCount: number,
  xpEarned: number = 0
): Promise<{ success: boolean }> {
  try {
    const { data: userRec } = await (supabase
      .from('users') as unknown as DBChain)
      .select('email, name')
      .eq('id', userId)
      .maybeSingle() as unknown as { data: { email: string; name: string | null } | null }

    const { globalNotificationDispatcher } = await import('./notifications/dispatcher')
    const { initializeNotificationConnectors } = await import('./notifications/events/connectors')
    initializeNotificationConnectors()

    await globalNotificationDispatcher.dispatch({
      id: `review-complete-${userId}-${Date.now()}`,
      event: 'review.completed',
      userId,
      userEmail: userRec?.email || '',
      userName: userRec?.name || 'Learner',
      userTimezone: 'UTC',
      priority: 'low',
      category: 'learning',
      occurredAt: new Date().toISOString(),
      payload: {
        userId,
        cardsReviewedCount,
        xpEarned,
      },
    })
    return { success: true }
  } catch (err) {
    console.warn('[flashcards-service] Error dispatching review.completed:', err)
    return { success: false }
  }
}

