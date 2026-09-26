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
  // 1. Fetch lesson progress, SRS records, user profile, today's XP events, and curriculum in parallel
  const [
    progressRes,
    srsRes,
    userProfileRes,
    todayXpRes,
    curriculum,
  ] = await Promise.all([
    (supabase.from('user_lesson_progress') as unknown as DBChain)
      .select('lesson_id, status')
      .eq('user_id', userId) as unknown as Promise<{ data: { lesson_id: string; status: string }[] | null }>,
    (supabase.from('user_flashcard_srs') as unknown as DBChain)
      .select('*')
      .eq('user_id', userId) as unknown as Promise<{ data: UserFlashcardSRSRow[] | null }>,
    (supabase.from('users') as unknown as DBChain)
      .select('timezone')
      .eq('id', userId)
      .single() as unknown as Promise<{ data: { timezone: string } | null }>,
    (supabase.from('xp_events') as unknown as DBChain)
      .select('created_at')
      .eq('user_id', userId)
      .eq('source_type', 'flashcard') as unknown as Promise<{ data: { created_at: string }[] | null }>,
    fetchCurriculumData(),
  ])

  const progressRows = progressRes?.data
  const srsRows = srsRes?.data
  const userProfile = userProfileRes?.data
  const todayXpEvents = todayXpRes?.data

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

  // 2. Extract flashcards from unlocked lessons
  const curriculumLessons = curriculum?.lessons ?? []
  const targetLessons = curriculumLessons.filter((l) => unlockedLessonIds.has(l.id))

  const unlockedCards: FlashcardItem[] = []
  const cardIdsInUnlocked = new Set<string>()

  // Batch load compiled lessons in parallel instead of sequential loop
  const targetLessonDetails = await Promise.all(targetLessons.map((l) => fetchCompiledLesson(l.id)))

  for (let i = 0; i < targetLessons.length; i++) {
    const lessonSummary = targetLessons[i]
    const lessonDetail = targetLessonDetails[i]
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

  // 3. Include any card directly in srsRecordsMap that belongs to another lesson
  // ELIMINATE the O(cards * lessons) nested loop: load remaining lessons ONCE in parallel
  if (srsRecordsMap.size > cardIdsInUnlocked.size) {
    const remainingLessons = curriculumLessons.filter((l) => !unlockedLessonIds.has(l.id))
    const remainingLessonDetails = await Promise.all(remainingLessons.map((l) => fetchCompiledLesson(l.id)))

    for (let i = 0; i < remainingLessons.length; i++) {
      const lessonSummary = remainingLessons[i]
      const lessonDetail = remainingLessonDetails[i]
      if (!lessonDetail?.blocks) continue

      const flashcardBlocks = (lessonDetail.blocks as { type: string; cards?: { id: string; front: string; back: string; concept?: string }[] }[]).filter(
        (b) => b.type === 'flashcardDeck'
      )

      for (const block of flashcardBlocks) {
        if (!block.cards) continue
        for (const card of block.cards) {
          if (srsRecordsMap.has(card.id) && !cardIdsInUnlocked.has(card.id)) {
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

  // 4. Calculate today's completed reviews count from xp_events
  const timezone = userProfile?.timezone || 'UTC'
  const todayStr = getLocalDateString(timezone, new Date())

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

export interface FlashcardReviewInput {
  flashcardId: string
  rating: number
  lessonId?: string
}

export interface FlashcardReviewResult {
  flashcardId: string
  nextReviewAt: Date
  easeFactor: number
}

/**
 * Batched execution of flashcard reviews.
 * Aggregates database reads and writes to eliminate N+1 round trips:
 * - Single batch fetch of existing SM-2 states via .in('flashcard_id', cardIds)
 * - In-memory SM-2 calculation using canonical calculateSM2
 * - Single batch upsert of updated rows into user_flashcard_srs
 * - Single timezone query
 * - Single batch query of xp_events for today's review XP
 * - Single streak update at the end of the batch
 */
export async function recordBatchFlashcardReviews(
  supabase: SupabaseClient<Database>,
  userId: string,
  reviews: FlashcardReviewInput[]
): Promise<FlashcardReviewResult[]> {
  if (!reviews || reviews.length === 0) return []

  const cardIds = [...new Set(reviews.map((r) => r.flashcardId))]

  // 1. Batch fetch current SM-2 states from database for all cards in this batch
  const { data: srsData, error: srsFetchError } = (await (supabase
    .from('user_flashcard_srs') as unknown as DBChain)
    .select('*')
    .eq('user_id', userId)
    .in('flashcard_id', cardIds)) as unknown as { data: UserFlashcardSRSRow[] | null; error: unknown }

  if (srsFetchError) throw srsFetchError

  const srsMap = new Map<string, UserFlashcardSRSRow>()
  for (const row of srsData || []) {
    srsMap.set(row.flashcard_id, row)
  }

  const results: FlashcardReviewResult[] = []
  const payloads: Array<{
    user_id: string
    lesson_id: string
    flashcard_id: string
    ease_factor: number
    interval_days: number
    repetitions: number
    next_review_at: string
  }> = []

  // 2. Compute next SM-2 states in memory
  for (const review of reviews) {
    const existing = srsMap.get(review.flashcardId)
    const prevState = existing
      ? {
          repetitions: existing.repetitions,
          intervalDays: existing.interval_days,
          easeFactor: Number(existing.ease_factor),
        }
      : { repetitions: 0, intervalDays: 0, easeFactor: 2.5 }

    const nextState = calculateSM2(review.rating as SRSRating, prevState)

    let lessonId = review.lessonId || (existing as { lesson_id?: string })?.lesson_id || ''
    if (!lessonId) {
      const match = review.flashcardId.match(/^fc-(les_[a-z0-9]+)-/i)
      if (match) {
        lessonId = match[1]
      }
    }

    payloads.push({
      user_id: userId,
      lesson_id: lessonId,
      flashcard_id: review.flashcardId,
      ease_factor: nextState.easeFactor,
      interval_days: nextState.intervalDays,
      repetitions: nextState.repetitions,
      next_review_at: nextState.nextReviewAt.toISOString(),
    })

    results.push({
      flashcardId: review.flashcardId,
      nextReviewAt: nextState.nextReviewAt,
      easeFactor: nextState.easeFactor,
    })
  }

  // 3. Batch upsert SRS review states
  if (payloads.length > 0) {
    const { error: upsertError } = await (supabase
      .from('user_flashcard_srs') as unknown as DBChain)
      .upsert(payloads, { onConflict: 'user_id,lesson_id,flashcard_id' })

    if (upsertError) {
      const { error: fallbackError } = await (supabase
        .from('user_flashcard_srs') as unknown as DBChain)
        .upsert(payloads, { onConflict: 'user_id,flashcard_id' })

      if (fallbackError) {
        console.error('[flashcards-service] Failed to batch upsert user_flashcard_srs:', upsertError, fallbackError)
        throw upsertError
      }
    }
  }

  // 4. Batch award daily review XP (deduplicated per card per local day)
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
      .select('source_id, created_at')
      .eq('user_id', userId)
      .eq('source_type', 'flashcard')
      .in('source_id', cardIds) as unknown as { data: { source_id: string; created_at: string }[] | null; error: unknown }

    const awardedCardIds = new Set<string>()
    for (const event of existingEvents || []) {
      if (!event.created_at) continue
      const d = new Date(event.created_at)
      if (!isNaN(d.getTime()) && getLocalDateString(timezone, d) === todayStr) {
        awardedCardIds.add(event.source_id)
      }
    }

    const xpConfig = await getRuntimeXpValues(supabase)
    for (const cardId of cardIds) {
      if (!awardedCardIds.has(cardId)) {
        await awardXp(
          supabase,
          userId,
          'flashcard',
          xpConfig.FLASHCARD_REVIEW,
          cardId
        )
        awardedCardIds.add(cardId)
      }
    }
  } catch (err) {
    console.error(`[flashcards-service] Error batch checking/awarding flashcard XP:`, err)
  }

  // 5. Update user streak once per batch
  await updateUserStreak(supabase, userId)

  return results
}

/**
 * Efficient due-cards aggregate query helper for dashboard and reminder checks.
 */
export async function getDueCardsCount(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<number> {
  const queueData = await getReviewQueueData(supabase, userId)
  return queueData.dueCards.length
}

