import { readFile } from 'fs/promises'
import path from 'path'
import { verifyTheoryReadEngagement, getRuntimeXpValues } from '../xp'
import { getCoreReadingMinutes, sampleQuizQuestions } from './lesson-structure'
import { getRecutVariant } from './experiment'
import { isModuleEntryUnlockTreatment } from './module-entry-unlock'
import { isLessonIdFormat } from './lesson-ids'
import type { CompiledLesson, CompiledQuizQuestion } from '@/types'
import { updateUserStreak } from '../streaks-db'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '../supabase'
import { createServiceRoleClient } from '../supabase'
import { awardXp, hasXpEvent } from '../xp-service'
import { resolveLessonAccessForUser } from '../lessons-completion-service'
import { fetchCurriculumData } from '../lesson-loader'
import { findNewlyCompletedModule, moduleCompletedEventId } from './module-completion'
import { CURRICULUM_LESSON_COUNT } from '../curriculum-registry'
import { PublicError } from '@/lib/errors/public-error'

/**
 * A `user_lesson_progress` row.
 *
 * Aliased to the generated type since B8-G. It was a hand-written duplicate, and it
 * had drifted badly: it declared `completed: boolean`, `reflection_text` and
 * `updated_at`, none of which are columns on that table — the real one records
 * completion as `status` and carries `theory_read_at` / `xp_earned` instead.
 *
 * The drift was invisible because both readers cast the row through
 * `as unknown as UserLessonProgressRecord`, and the writer below sent
 * `updated_at`, which PostgREST rejects as an unknown column. Neither function has
 * a caller outside this module, which is why nothing surfaced it.
 */
export type UserLessonProgressRecord = Database['public']['Tables']['user_lesson_progress']['Row']

export async function getUserLessonProgress(
  userId: string,
  lessonId: string
): Promise<UserLessonProgressRecord | null> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('user_lesson_progress')
    .select('*')
    .eq('user_id', userId)
    .eq('lesson_id', lessonId)
    .single()

  if (error || !data) return null
  return data
}

export async function getUserCompletedLessonIds(userId: string): Promise<string[]> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('user_lesson_progress')
    .select('lesson_id')
    .eq('user_id', userId)
    .eq('status', 'completed')

  if (error || !data) return []
  return data.map((r) => r.lesson_id)
}

export async function upsertUserLessonProgress(
  record: Partial<UserLessonProgressRecord> & { user_id: string; lesson_id: string }
): Promise<UserLessonProgressRecord | null> {
  const supabase = createServiceRoleClient()
  // `updated_at` was written here until B8-G. `user_lesson_progress` has no such
  // column, so PostgREST rejected every call — the error was logged and `null`
  // returned, which read as "no progress row" rather than "the write failed".
  const { data, error } = await supabase
    .from('user_lesson_progress')
    .upsert(record, { onConflict: 'user_id,lesson_id' })
    .select()
    .single()

  if (error || !data) {
    console.error('[lessons-db] Error upserting lesson progress:', error)
    return null
  }
  return data
}


const DIST_LESSONS_DIR = path.resolve(process.cwd(), '..', '..', 'content', 'dist', 'lessons')

const LESSON_NOT_FOUND_MESSAGE = 'Lesson not found.'

/**
 * Loads a compiled lesson for a learner write. SEC-08: the id is checked against
 * LESSON_ID_PATTERN before it reaches `path.join`, and a lesson with no compiled file in
 * content/dist is a 404, never a default. Any other read failure is a real fault and throws.
 */
async function loadLessonForWrite(lessonId: string): Promise<CompiledLesson> {
  if (!isLessonIdFormat(lessonId)) {
    throw new PublicError(LESSON_NOT_FOUND_MESSAGE, { status: 404, code: 'NOT_FOUND' })
  }

  let raw: string
  try {
    raw = await readFile(path.join(DIST_LESSONS_DIR, `${lessonId}.json`), 'utf-8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
      throw new PublicError(LESSON_NOT_FOUND_MESSAGE, { status: 404, code: 'NOT_FOUND' })
    }
    throw err
  }
  return JSON.parse(raw) as CompiledLesson
}

/**
 * SEC-08: rejects a write to a lesson the learner cannot open, using the same decision as the
 * lesson page (resolveLessonAccessForUser + the module-entry unlock variant). Completed and
 * already-opened lessons stay writable, so quiz retakes and review keep working.
 *
 * Fails closed: without curriculum.json the access decision cannot be made, so this throws.
 */
export async function assertLessonAccessible(
  supabase: SupabaseClient<Database>,
  userId: string,
  lessonId: string
): Promise<void> {
  const curriculum = await fetchCurriculumData()
  if (!curriculum) {
    throw new Error('[lessons-db] curriculum.json is unavailable; cannot check lesson access')
  }
  if (!curriculum.lessons.some((l) => l.id === lessonId)) {
    throw new PublicError(LESSON_NOT_FOUND_MESSAGE, { status: 404, code: 'NOT_FOUND' })
  }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('created_at')
    .eq('id', userId)
    .maybeSingle()
  if (profileError) throw profileError

  const treatment = isModuleEntryUnlockTreatment({ id: userId, createdAt: profile?.created_at ?? null })
  const access = await resolveLessonAccessForUser(supabase, userId, lessonId, {
    curriculum: curriculum.lessons,
    treatment,
  })

  if (!access.isAccessible) {
    throw new PublicError('Complete the previous lesson to unlock this one.', {
      status: 403,
      code: 'LESSON_LOCKED',
    })
  }
}

type QuizQuestionDefinition = Pick<CompiledQuizQuestion, 'id' | 'correctAnswer'>

/** The full question bank of a compiled lesson's quiz block, or null when it has none. */
function getQuizPool(lesson: CompiledLesson): QuizQuestionDefinition[] | null {
  const quizBlock = lesson?.blocks?.find((b) => b.type === 'quiz')
  if (!quizBlock) return null
  return (quizBlock.questions ?? []) as QuizQuestionDefinition[]
}

/**
 * The questions this learner was shown, mirroring the lesson page: the recut treatment
 * renders a deterministic sample seeded by `<userId>:<lessonId>` (withSampledQuiz), control
 * renders the full bank.
 */
export function getServedQuizQuestions<T>(pool: T[], userId: string, lessonId: string): T[] {
  return getRecutVariant(userId) === 'treatment'
    ? sampleQuizQuestions(pool, `${userId}:${lessonId}`)
    : pool
}

interface QuizAnswer {
  question_id: string
  selected_option: number
}

interface ScoredQuizSubmission {
  validatedAttempts: { question_id: string; selected_option: number; is_correct: boolean }[]
  correctCount: number
  /** Questions in the quiz definition the submission answers, never the submitted count. */
  totalQuestions: number
}

/**
 * Scores a submission against the quiz definition (SEC-08). A repeated question_id or one that
 * is not in the bank is a 400. The denominator is the served quiz when every answer belongs to
 * it, otherwise the full bank, so an incomplete or padded submission can only lower the score.
 *
 * With `requireComplete`, the answers must cover exactly the served quiz or exactly the full
 * bank (the full bank is accepted so a kill-switch flip between render and submit does not
 * strand a learner mid-quiz).
 */
export function scoreQuizSubmission(
  pool: QuizQuestionDefinition[],
  served: QuizQuestionDefinition[],
  attempts: QuizAnswer[],
  options: { requireComplete: boolean }
): ScoredQuizSubmission {
  if (attempts.length === 0) {
    throw new PublicError('Attempts array cannot be empty', { status: 400, code: 'VALIDATION' })
  }

  const answerKey = new Map<string, number>()
  for (const q of pool) answerKey.set(q.id, q.correctAnswer)

  const seen = new Set<string>()
  const validatedAttempts = attempts.map((a) => {
    if (seen.has(a.question_id)) {
      throw new PublicError('Each question can be answered only once per submission.', {
        status: 400,
        code: 'VALIDATION',
      })
    }
    seen.add(a.question_id)

    const correctAnswer = answerKey.get(a.question_id)
    if (correctAnswer === undefined) {
      throw new PublicError('The submission contains a question that is not in this quiz.', {
        status: 400,
        code: 'VALIDATION',
      })
    }
    return {
      question_id: a.question_id,
      selected_option: a.selected_option,
      is_correct: a.selected_option === correctAnswer,
    }
  })

  const servedIds = new Set(served.map((q) => q.id))
  const withinServed = validatedAttempts.every((a) => servedIds.has(a.question_id))
  const definitionSize = withinServed ? served.length : pool.length

  if (options.requireComplete && validatedAttempts.length !== definitionSize) {
    throw new PublicError('Answer every question in the quiz before submitting.', {
      status: 400,
      code: 'VALIDATION',
    })
  }

  return {
    validatedAttempts,
    correctCount: validatedAttempts.filter((a) => a.is_correct).length,
    totalQuestions: definitionSize,
  }
}

/**
 * Marks theory content as read and unlocks the quiz for this lesson.
 * Awards theory_read XP idempotently via the XP event ledger.
 */
export async function markTheoryRead(
  supabase: SupabaseClient<Database>,
  userId: string,
  lessonId: string,
  existingRead = false
): Promise<{ success: boolean; xpEarned: number; message?: string }> {
  // 1. Fetch current progress
  const { data: progress, error: fetchError } = await supabase
    .from('user_lesson_progress')
    .select('*')
    .eq('user_id', userId)
    .eq('lesson_id', lessonId)
    .maybeSingle()

  if (fetchError) throw fetchError

  if (existingRead || progress?.theory_read_at) {
    return { success: true, xpEarned: 0, message: 'Theory already read.' }
  }

  const xpConfig = await getRuntimeXpValues(supabase)
  const now = new Date().toISOString()
  const newStatus = progress?.status === 'completed' ? 'completed' : 'in_progress'
  const newXpEarned = (progress?.xp_earned ?? 0) + xpConfig.THEORY_READ

  const { error: progressError } = await supabase
    .from('user_lesson_progress')
    .upsert({
      user_id: userId,
      lesson_id: lessonId,
      status: newStatus,
      theory_read_at: now,
      xp_earned: newXpEarned,
    }, { onConflict: 'user_id,lesson_id' })

  if (progressError) throw progressError

  try {
    await awardXp(
      supabase,
      userId,
      'theory_read',
      xpConfig.THEORY_READ,
      lessonId
    )
  } catch (xpError) {
    console.error(`[lessons-db] Error creating theory_read XP event:`, xpError)
  }

  await updateUserStreak(supabase, userId)

  return { success: true, xpEarned: xpConfig.THEORY_READ }
}

export async function recordTheoryReadAction(
  supabase: SupabaseClient<Database>,
  userId: string,
  lessonId: string,
  activeSeconds: number,
  scrollPercentage: number
) {
  // Phase 4 (§4.1, Step 5): the engagement gate must reflect what the learner is actually
  // asked to read before the quiz — the Core — not the full historical lesson including the
  // Deep-dive. `recordTheoryReadAction` previously fed the FULL-lesson `estimatedReadingTime`
  // into the ≥45s floor, so for a treatment learner the gate would silently demand they dwell
  // long enough to have read material that is no longer on the Core path. We recompute against
  // Core reading time for the treatment variant; control keeps the authored full-lesson figure
  // so its gate is unchanged. The variant is derived deterministically from the userId, the
  // same way the lesson RSC derives it — no extra parameter is threaded through the route.
  //
  // SEC-08: an unknown or malformed lesson id is a 404 (it used to fall back to a 2-minute
  // estimate and award XP for a lesson that does not exist), and a locked lesson is a 403.
  // Both are checked before the engagement gate and before any write.
  const lesson = await loadLessonForWrite(lessonId)
  await assertLessonAccessible(supabase, userId, lessonId)

  const fullEst = lesson.estimatedReadingTime ?? 2
  let estMinutesReading = fullEst
  if (getRecutVariant(userId) === 'treatment') {
    const coreMinutes = getCoreReadingMinutes(lesson)
    estMinutesReading = coreMinutes > 0 ? coreMinutes : fullEst
  }

  const verifyResult = verifyTheoryReadEngagement(
    activeSeconds,
    scrollPercentage,
    estMinutesReading
  )

  if (!verifyResult.isEligible) {
    throw new PublicError(verifyResult.reason || 'Engagement threshold not met.', { status: 400, code: 'ENGAGEMENT_THRESHOLD' })
  }

  const existingRead = await hasXpEvent(supabase, userId, 'theory_read', lessonId)
  return await markTheoryRead(supabase, userId, lessonId, existingRead)
}

/** Loads a lesson and its quiz bank for a quiz write; a lesson without a quiz is a 404. */
async function loadQuizForWrite(lessonId: string) {
  const lesson = await loadLessonForWrite(lessonId)
  const pool = getQuizPool(lesson)
  if (!pool) {
    throw new PublicError('This lesson has no quiz.', { status: 404, code: 'NOT_FOUND' })
  }
  return { lesson, pool }
}

/**
 * The learner quiz submission path (POST /api/v2/lessons/[lessonId]/quiz). SEC-08: the
 * answers must cover exactly the quiz the learner was served, each question once, and the
 * lesson must be open to the learner. Every check runs before any write.
 */
export async function submitQuizAttempt(
  supabase: SupabaseClient<Database>,
  userId: string,
  lessonId: string,
  attempts: QuizAnswer[]
) {
  const { lesson, pool } = await loadQuizForWrite(lessonId)
  const scored = scoreQuizSubmission(pool, getServedQuizQuestions(pool, userId, lessonId), attempts, {
    requireComplete: true,
  })
  await assertLessonAccessible(supabase, userId, lessonId)
  return recordScoredQuizAttempt(supabase, userId, lessonId, lesson, scored)
}

/**
 * Backwards-compatible action for recording quiz attempts (used in test suites and legacy hooks).
 * Skips the strict access check and allows partial submissions unless enforced by the caller.
 */
export async function recordQuizAttemptAction(
  supabase: SupabaseClient<Database>,
  userId: string,
  lessonId: string,
  attempts: QuizAnswer[]
) {
  const { lesson, pool } = await loadQuizForWrite(lessonId)
  const questionMap = new Map<string, number>()
  for (const q of pool) {
    questionMap.set(q.id, q.correctAnswer)
  }
  const validatedAttempts = attempts.map((a) => {
    const correctAnswer = questionMap.get(a.question_id)
    if (correctAnswer === undefined) {
      throw new PublicError(`Question ID ${a.question_id} not found in quiz for lesson ${lessonId}`, {
        status: 400,
        code: 'VALIDATION',
      })
    }
    return {
      question_id: a.question_id,
      selected_option: a.selected_option,
      is_correct: a.selected_option === correctAnswer,
    }
  })
  const correctCount = validatedAttempts.filter((a) => a.is_correct).length
  const totalQuestions = attempts.length
  return recordScoredQuizAttempt(supabase, userId, lessonId, lesson, {
    validatedAttempts,
    correctCount,
    totalQuestions,
  })
}

async function enqueueWrongAnswerFlashcards(
  supabase: SupabaseClient<Database>,
  userId: string,
  lessonId: string,
  wrongQuestionIds: string[],
  lesson?: CompiledLesson
) {
  if (!wrongQuestionIds.length) return

  // Maps question id q-les_xxx-N to flashcard id fc-les_xxx-N
  const flashcardIds = new Set<string>()
  for (const qid of wrongQuestionIds) {
    if (qid.startsWith('q-')) {
      flashcardIds.add(qid.replace(/^q-/, 'fc-'))
    } else {
      flashcardIds.add(`fc-${lessonId}-${qid}`)
    }
  }

  const deckBlock = lesson?.blocks?.find((b) => b.type === 'flashcardDeck') as
    | { cards?: { id: string }[] }
    | undefined
  const deckCardIds = deckBlock?.cards?.map((c) => c.id)

  const targetIds: string[] = []
  for (const fcId of flashcardIds) {
    if (!deckCardIds || deckCardIds.length === 0 || deckCardIds.includes(fcId)) {
      targetIds.push(fcId)
    }
  }

  if (!targetIds.length) return

  const nowIso = new Date().toISOString()
  const rows = targetIds.map((flashcardId) => ({
    user_id: userId,
    lesson_id: lessonId,
    flashcard_id: flashcardId,
    ease_factor: 2.5,
    interval_days: 0,
    repetitions: 0,
    next_review_at: nowIso,
  }))

  const { error: upsertError } = await supabase
    .from('user_flashcard_srs')
    .upsert(rows, { onConflict: 'user_id,lesson_id,flashcard_id', ignoreDuplicates: true })

  if (upsertError) {
    await supabase
      .from('user_flashcard_srs')
      .upsert(rows, { onConflict: 'user_id,flashcard_id', ignoreDuplicates: true })
  }
}

async function recordScoredQuizAttempt(
  supabase: SupabaseClient<Database>,
  userId: string,
  lessonId: string,
  lesson: CompiledLesson,
  { validatedAttempts, correctCount, totalQuestions }: ScoredQuizSubmission
) {
  const scorePercentage = Math.round((correctCount / totalQuestions) * 100)

  const xpConfig = await getRuntimeXpValues(supabase)

  let totalXpToAward = 0
  let isFirstAttempt = false

  // Attempt atomic execution via PostgreSQL RPC record_lesson_quiz_completion.
  // The RPC returns a jsonb envelope; narrow it explicitly rather than casting the
  // client, so the typed data layer stays free of escape-hatch casts (B8-G).
  const { data: rpcData, error: rpcError } = await supabase.rpc('record_lesson_quiz_completion', {
    p_user_id: userId,
    p_lesson_id: lessonId,
    p_score_percentage: scorePercentage,
    p_correct_count: correctCount,
    p_total_questions: totalQuestions,
    p_attempts: validatedAttempts as Json,
    p_quiz_correct_xp_per_question: xpConfig.QUIZ_CORRECT,
    p_quiz_perfect_bonus_xp: xpConfig.QUIZ_PERFECT_BONUS,
  })

  if (rpcError) {
    throw new Error(`[lessons-db] record_lesson_quiz_completion failed (${rpcError.code}): ${rpcError.message}`)
  }

  const envelope =
    rpcData && typeof rpcData === 'object' && !Array.isArray(rpcData)
      ? (rpcData as Record<string, unknown>)
      : null
  if (!envelope || envelope.success !== true) {
    throw new Error('[lessons-db] record_lesson_quiz_completion returned an unexpected result')
  }
  totalXpToAward = typeof envelope.total_xp_awarded === 'number' ? envelope.total_xp_awarded : 0
  isFirstAttempt = Boolean(envelope.is_first_attempt)

  // AG-28 Mastery: 70 percent threshold to pass/complete.
  const isPassed =
    typeof envelope.is_passed === 'boolean'
      ? envelope.is_passed
      : scorePercentage >= 70 || envelope.status === 'completed'
  const isNewlyCompleted =
    typeof envelope.is_newly_completed === 'boolean'
      ? envelope.is_newly_completed
      : isFirstAttempt
  const bestScore =
    typeof envelope.best_score === 'number'
      ? envelope.best_score
      : Math.max(scorePercentage, 0)

  // Enqueue flashcards for wrong answers
  const wrongAttempts = validatedAttempts.filter((a) => !a.is_correct)
  if (wrongAttempts.length > 0) {
    try {
      await enqueueWrongAnswerFlashcards(
        supabase,
        userId,
        lessonId,
        wrongAttempts.map((a) => a.question_id),
        lesson
      )
    } catch (fcErr) {
      console.warn('[lessons-db] Flashcard enqueue warning:', fcErr)
    }
  }

  await updateUserStreak(supabase, userId)

  let totalCompletedLessons = 0

  try {
    const { data: userRec } = await supabase
      .from('users')
      .select('email, name')
      .eq('id', userId)
      .maybeSingle()

    const { globalNotificationDispatcher } = await import('../notifications/dispatcher')
    const { initializeNotificationConnectors } = await import('../notifications/events/connectors')
    initializeNotificationConnectors()

    // Dispatch quiz.completed on every attempt
    await globalNotificationDispatcher.dispatch({
      id: `quiz-complete-${userId}-${lessonId}-${Date.now()}`,
      event: 'quiz.completed',
      userId,
      userEmail: userRec?.email || '',
      userName: userRec?.name || 'Learner',
      userTimezone: 'UTC',
      priority: 'low',
      category: 'learning',
      occurredAt: new Date().toISOString(),
      payload: {
        userId,
        lessonId,
        lessonTitle: lesson?.title || 'Lesson',
        score: scorePercentage,
      },
    })

    // Dispatch lesson.completed only when the lesson was newly completed
    if (isNewlyCompleted) {
      await globalNotificationDispatcher.dispatch({
        id: `lesson-complete-${userId}-${lessonId}`,
        event: 'lesson.completed',
        userId,
        userEmail: userRec?.email || '',
        userName: userRec?.name || 'Learner',
        userTimezone: 'UTC',
        priority: 'medium',
        category: 'learning',
        occurredAt: new Date().toISOString(),
        payload: {
          userId,
          lessonId,
          lessonTitle: lesson?.title || lessonId,
          xpEarned: totalXpToAward,
        },
      })
    }

    const { data: userProgress, error: progressError } = await supabase
      .from('user_lesson_progress')
      .select('lesson_id, status')
      .eq('user_id', userId)
    if (progressError) {
      // Without it no module (or certificate) can be detected for this completion.
      console.warn('[lessons-db] Progress read for completion hooks failed:', progressError.message)
    }

    const completedLessonIds = new Set(
      (userProgress ?? []).filter((p) => p.status === 'completed').map((p) => p.lesson_id),
    )
    totalCompletedLessons = completedLessonIds.size

    // Phase 7: activate the referral reward once the learner has a completed lesson.
    if (totalCompletedLessons >= 1 && isNewlyCompleted) {
      try {
        const { onFirstLessonCompletedReferralCheck } = await import('../referral/referral-service')
        await onFirstLessonCompletedReferralCheck(supabase, userId)
      } catch (refErr) {
        console.warn('[lessons-db] Referral activation check warning:', refErr)
      }
    }

    // Growth R4: a module is complete when its last open lesson is completed, in any order.
    // Checks when a lesson newly completes.
    const completedModule = isNewlyCompleted ? findNewlyCompletedModule(lessonId, completedLessonIds) : null
    if (completedModule) {
      await globalNotificationDispatcher.dispatch({
        id: moduleCompletedEventId(userId, completedModule.slug),
        event: 'module.completed',
        userId,
        userEmail: userRec?.email || '',
        userName: userRec?.name || 'Learner',
        userTimezone: 'UTC',
        priority: 'medium',
        category: 'learning',
        occurredAt: new Date().toISOString(),
        payload: {
          userId,
          moduleName: completedModule.name,
          moduleSlug: completedModule.slug,
          totalLessonsCompleted: totalCompletedLessons,
          completedAt: new Date().toISOString(),
        },
      })
    }

    // Growth R1: issue full-curriculum certificate as soon as the learner completes every lesson.
    if (isNewlyCompleted && totalCompletedLessons >= CURRICULUM_LESSON_COUNT) {
      try {
        const { issueFullCurriculumCertificateIfEligible } = await import('../certificates/issue-flow')
        await issueFullCurriculumCertificateIfEligible(supabase, userId, {
          email: userRec?.email,
          name: userRec?.name,
        })
      } catch (certErr) {
        console.warn('[lessons-db] Full-curriculum certificate issuance warning:', certErr)
      }
    }
  } catch (modErr) {
    console.warn('[lessons-db] Notification dispatch warning:', modErr)
  }

  return {
    success: true,
    isCompleted: typeof envelope.status === 'string' ? envelope.status === 'completed' : isPassed,
    isPassed,
    isNewlyCompleted,
    bestScore,
    isFirstLesson: totalCompletedLessons === 1,
    totalCompletedLessons,
    correctCount,
    totalQuestions,
    scorePercentage,
    xpEarned: totalXpToAward,
    isPerfect: correctCount === totalQuestions,
    isFirstAttempt,
  }
}

export async function recordReflectionAction(
  supabase: SupabaseClient<Database>,
  userId: string,
  lessonId: string,
  content: string,
  isPublic: boolean
) {
  const { data: existing, error: selectError } = await supabase
    .from('reflections')
    .select('*')
    .eq('user_id', userId)
    .eq('lesson_id', lessonId)
    .maybeSingle()

  if (selectError) throw selectError

  const xpConfig = await getRuntimeXpValues(supabase)
  const xpAlreadyAwarded = await hasXpEvent(supabase, userId, 'reflection', lessonId)
  const isFirstSubmission = !existing
  let result

  if (isFirstSubmission) {
    const { data: inserted, error: insertError } = await supabase
      .from('reflections')
      .insert({
        user_id: userId,
        lesson_id: lessonId,
        content,
        is_public: isPublic,
      })
      .select()
      .single()

    if (insertError) throw insertError
    result = inserted

    if (!xpAlreadyAwarded) {
      try {
        await awardXp(
          supabase,
          userId,
          'reflection',
          xpConfig.REFLECTION_SUBMITTED,
          lessonId
        )
      } catch (xpError) {
        console.error(`[lessons-db] Error logging reflection XP:`, xpError)
      }

      const { data: progress } = await supabase
        .from('user_lesson_progress')
        .select('*')
        .eq('user_id', userId)
        .eq('lesson_id', lessonId)
        .maybeSingle()

      if (progress) {
        await supabase
          .from('user_lesson_progress')
          .update({
            xp_earned: progress.xp_earned + xpConfig.REFLECTION_SUBMITTED,
          })
          .eq('user_id', userId)
          .eq('lesson_id', lessonId)
      }
    }
  } else {
    const { data: updated, error: updateError } = await supabase
      .from('reflections')
      .update({
        content,
        is_public: isPublic,
      })
      .eq('id', existing.id)
      .select()
      .single()

    if (updateError) throw updateError
    result = updated
  }

  await updateUserStreak(supabase, userId)

  return {
    success: true,
    reflection: result,
    xpEarned: (isFirstSubmission && !xpAlreadyAwarded) ? xpConfig.REFLECTION_SUBMITTED : 0,
  }
}

