import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Tables } from '@/lib/supabase'
import {
  calculateSM2,
  SRSRating,
  FlashcardItem,
  ReviewStats,
  getDueCards,
  calculateReviewStats,
} from '@/lib/srs'
import { awardXp } from '@/lib/xp-service'
import { getRuntimeXpValues } from '@/lib/xp'
import { updateUserStreak } from '@/lib/streaks-db'
import { fetchCurriculumData, fetchCompiledLesson } from '@/lib/lesson-loader'
import { startOfDay } from '@/lib/admin/dashboard-aggregation'
import { lessonIdFromFlashcardId } from '@/lib/academy/lesson-ids'
import { assertLessonAccessible } from '@/lib/academy/lessons-db'
import { PublicError } from '@/lib/errors/public-error'

type SrsRow = Tables<'user_flashcard_srs'>

/**
 * Wraps a failed read so callers get an Error that names the table, with the driver
 * error kept as the cause. Reads no longer degrade silently: a failed
 * `user_flashcard_srs` read used to make every card look new (CQ-07).
 */
function readFailed(table: string, error: { message: string }): Error {
  return new Error(`[flashcards-service] ${table} read failed: ${error.message}`, { cause: error })
}

/**
 * Start of the learner's current local calendar day as a UTC ISO instant, so "today"
 * can be bounded in SQL. An unknown timezone falls back to UTC, as getLocalDateString does.
 */
function localDayStartUtcIso(timezone: string, now: Date): string {
  try {
    return startOfDay(now, timezone).toISOString()
  } catch {
    return startOfDay(now, 'UTC').toISOString()
  }
}

/** Reads the learner's timezone, defaulting to UTC when the profile row has none. */
async function readUserTimezone(supabase: SupabaseClient<Database>, userId: string): Promise<string> {
  const { data, error } = await supabase.from('users').select('timezone').eq('id', userId).maybeSingle()
  if (error) throw readFailed('users', error)
  return data?.timezone || 'UTC'
}

/** Counts the flashcard XP events the learner earned since the start of their local day. */
async function countTodayFlashcardReviews(
  supabase: SupabaseClient<Database>,
  userId: string,
  timezone: string,
  now: Date
): Promise<number> {
  const { count, error } = await supabase
    .from('xp_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('source_type', 'flashcard')
    .gte('created_at', localDayStartUtcIso(timezone, now))
  if (error) throw readFailed('xp_events', error)
  return count ?? 0
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
  const now = new Date()

  // 1. Fetch lesson progress, SRS records, the learner's timezone and the curriculum in
  // parallel. Every read is checked: a failure throws instead of standing in as "no
  // rows" (CQ-07).
  const [progressRes, srsRes, timezone, curriculum] = await Promise.all([
    supabase.from('user_lesson_progress').select('lesson_id, status').eq('user_id', userId),
    supabase.from('user_flashcard_srs').select('*').eq('user_id', userId),
    readUserTimezone(supabase, userId),
    fetchCurriculumData(),
  ])

  if (progressRes.error) throw readFailed('user_lesson_progress', progressRes.error)
  if (srsRes.error) throw readFailed('user_flashcard_srs', srsRes.error)

  const progressRows = progressRes.data
  const srsRows = srsRes.data

  // Today's completed reviews, counted in SQL and bounded to the learner's local day.
  // This used to fetch every flashcard XP event ever earned and filter in JS, which
  // PostgREST truncates past 1,000 rows (CQ-07).
  const todayCountPromise = countTodayFlashcardReviews(supabase, userId, timezone, now)

  const srsRecordsMap = new Map<string, SrsRow>()
  const srsLessonIds = new Set<string>()
  for (const row of srsRows || []) {
    srsRecordsMap.set(row.flashcard_id, row)
    if (row.lesson_id) {
      srsLessonIds.add(row.lesson_id)
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

  // Batch load compiled lessons in parallel instead of sequential loop. The today-count
  // query is awaited alongside, so it cannot reject unobserved.
  const [targetLessonDetails, completedTodayCount] = await Promise.all([
    Promise.all(targetLessons.map((l) => fetchCompiledLesson(l.id))),
    todayCountPromise,
  ])

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

  // 4. Evaluate due cards and aggregate stats
  const dueCards = getDueCards(unlockedCards, srsRecordsMap, now)
  const stats = calculateReviewStats(unlockedCards, srsRecordsMap, completedTodayCount, now)

  return {
    dueCards,
    allUnlockedCards: unlockedCards,
    stats,
  }
}

/**
 * SEC-08: proves a flashcard id names a real card before anything is written for it, and
 * returns the lesson that owns it. The id must be in the compiler's `fc-<lessonId>-<n>`
 * format, its lesson must exist in content/dist, and the card must be in that lesson's
 * flashcard deck. A caller-supplied lesson id has to agree with the card's own lesson.
 */
export async function resolveFlashcardLessonId(
  flashcardId: string,
  explicitLessonId?: string
): Promise<string> {
  const lessonId = lessonIdFromFlashcardId(flashcardId)
  if (!lessonId) {
    throw new PublicError('Flashcard not found.', { status: 404, code: 'NOT_FOUND' })
  }
  if (explicitLessonId !== undefined && explicitLessonId !== lessonId) {
    throw new PublicError('lessonId does not match the flashcard.', { status: 400, code: 'VALIDATION' })
  }

  const lesson = await fetchCompiledLesson(lessonId)
  const exists = (lesson?.blocks ?? []).some(
    (b) =>
      b.type === 'flashcardDeck' &&
      Array.isArray((b as { cards?: { id: string }[] }).cards) &&
      (b as { cards: { id: string }[] }).cards.some((card) => card.id === flashcardId)
  )
  if (!exists) {
    throw new PublicError('Flashcard not found.', { status: 404, code: 'NOT_FOUND' })
  }
  return lessonId
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
): Promise<{ nextReviewAt: Date; easeFactor: number; xpEarned: number }> {
  // 0. Validate the card before any read or write keyed on its id (SEC-08), then require its
  // lesson to be open to the learner, so a card from a locked lesson earns no XP (403).
  const lessonId = await resolveFlashcardLessonId(flashcardId, explicitLessonId)
  await assertLessonAccessible(supabase, userId, lessonId)

  // 1. Fetch current SM-2 state from database
  const { data: srsData, error: srsFetchError } = await supabase
    .from('user_flashcard_srs')
    .select('*')
    .eq('user_id', userId)
    .eq('flashcard_id', flashcardId)
    .maybeSingle()

  if (srsFetchError) throw readFailed('user_flashcard_srs', srsFetchError)

  const prevState = srsData
    ? {
        repetitions: srsData.repetitions,
        intervalDays: srsData.interval_days,
        easeFactor: Number(srsData.ease_factor),
      }
    : { repetitions: 0, intervalDays: 0, easeFactor: 2.5 }

  // 2. Compute next spacing intervals using SM-2 Engine
  const nextState = calculateSM2(rating as SRSRating, prevState)

  // 3. lessonId was resolved from the card itself in step 0.

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

  const { error: upsertError } = await supabase
    .from('user_flashcard_srs')
    .upsert(srsPayload, { onConflict: 'user_id,lesson_id,flashcard_id' })

  if (upsertError) {
    // Fallback if database table has primary key constraint on (user_id, flashcard_id)
    const { error: fallbackError } = await supabase
      .from('user_flashcard_srs')
      .upsert(srsPayload, { onConflict: 'user_id,flashcard_id' })

    if (fallbackError) {
      console.error('[flashcards-service] Failed to upsert user_flashcard_srs:', upsertError, fallbackError)
      throw upsertError
    }
  }

  // 4. Award daily flashcard review XP via canonical XP service (deduplicated).
  // A failed read throws into the catch below, so XP is withheld rather than awarded
  // twice: a failed read used to look like "not awarded today".
  let xpEarned = 0
  try {
    const timezone = await readUserTimezone(supabase, userId)

    const { count: awardedTodayCount, error: xpReadError } = await supabase
      .from('xp_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('source_type', 'flashcard')
      .eq('source_id', flashcardId)
      .gte('created_at', localDayStartUtcIso(timezone, new Date()))

    if (xpReadError) throw readFailed('xp_events', xpReadError)

    if (!awardedTodayCount) {
      const xpConfig = await getRuntimeXpValues(supabase)
      await awardXp(
        supabase,
        userId,
        'flashcard',
        xpConfig.FLASHCARD_REVIEW,
        flashcardId
      )
      xpEarned = xpConfig.FLASHCARD_REVIEW
    }
  } catch (err) {
    console.error(`[flashcards-service] Error checking/awarding flashcard XP:`, err)
  }

  // 5. Update user streak
  await updateUserStreak(supabase, userId)

  return {
    nextReviewAt: nextState.nextReviewAt,
    easeFactor: nextState.easeFactor,
    xpEarned,
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
    const { data: userRec, error: userReadError } = await supabase
      .from('users')
      .select('email, name')
      .eq('id', userId)
      .maybeSingle()
    if (userReadError) throw readFailed('users', userReadError)

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
  const { data: srsData, error: srsFetchError } = await supabase
    .from('user_flashcard_srs')
    .select('*')
    .eq('user_id', userId)
    .in('flashcard_id', cardIds)

  if (srsFetchError) throw readFailed('user_flashcard_srs', srsFetchError)

  const srsMap = new Map<string, SrsRow>()
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

    let lessonId = review.lessonId || existing?.lesson_id || ''
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
    const { error: upsertError } = await supabase
      .from('user_flashcard_srs')
      .upsert(payloads, { onConflict: 'user_id,lesson_id,flashcard_id' })

    if (upsertError) {
      const { error: fallbackError } = await supabase
        .from('user_flashcard_srs')
        .upsert(payloads, { onConflict: 'user_id,flashcard_id' })

      if (fallbackError) {
        console.error('[flashcards-service] Failed to batch upsert user_flashcard_srs:', upsertError, fallbackError)
        throw upsertError
      }
    }
  }

  // 4. Batch award daily review XP (deduplicated per card per local day). The read is
  // bounded to today in SQL, and a failure throws into the catch so XP is withheld
  // rather than awarded twice.
  try {
    const timezone = await readUserTimezone(supabase, userId)

    const { data: existingEvents, error: xpReadError } = await supabase
      .from('xp_events')
      .select('source_id')
      .eq('user_id', userId)
      .eq('source_type', 'flashcard')
      .in('source_id', cardIds)
      .gte('created_at', localDayStartUtcIso(timezone, new Date()))

    if (xpReadError) throw readFailed('xp_events', xpReadError)

    const awardedCardIds = new Set<string>()
    for (const event of existingEvents || []) {
      if (event.source_id) awardedCardIds.add(event.source_id)
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

