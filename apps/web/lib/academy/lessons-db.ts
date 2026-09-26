import { readFile } from 'fs/promises'
import path from 'path'
import { verifyTheoryReadEngagement, getRuntimeXpValues } from '../xp'
import { updateUserStreak } from '../streaks-db'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '../supabase'
import { createServiceRoleClient } from '../supabase'
import { awardXp, hasXpEvent } from '../xp-service'
import { completeLesson } from '../lessons-completion-service'
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
  let estMinutesReading = 2
  try {
    if (/^les_[a-z0-9]+$/.test(lessonId)) {
      const filePath = path.join(DIST_LESSONS_DIR, `${lessonId}.json`)
      const raw = await readFile(filePath, 'utf-8')
      const lesson = JSON.parse(raw)
      estMinutesReading = lesson?.estimatedReadingTime ?? 2
    }
  } catch (e) {
    console.warn(`[lessons-db] Lesson file not found for ${lessonId}. Defaulting to 2 mins.`, e)
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

export async function recordQuizAttemptAction(
  supabase: SupabaseClient<Database>,
  userId: string,
  lessonId: string,
  attempts: { question_id: string; selected_option: number }[]
) {
  const totalQuestions = attempts.length
  if (totalQuestions === 0) {
    throw new PublicError('Attempts array cannot be empty', { status: 400, code: 'VALIDATION' })
  }

  let lesson
  try {
    const filePath = path.join(DIST_LESSONS_DIR, `${lessonId}.json`)
    const raw = await readFile(filePath, 'utf-8')
    lesson = JSON.parse(raw)
  } catch {
    throw new PublicError(`Lesson content file not found for ${lessonId}`, { status: 404, code: 'NOT_FOUND' })
  }

  const quizBlock = lesson?.blocks?.find((b: { type: string }) => b.type === 'quiz')
  if (!quizBlock) {
    throw new PublicError(`Quiz block not found in lesson content for ${lessonId}`, { status: 404, code: 'NOT_FOUND' })
  }

  const quizQuestions = quizBlock.questions || []
  const questionMap = new Map<string, number>()
  for (const q of quizQuestions) {
    questionMap.set(q.id, q.correctAnswer)
  }

  const validatedAttempts = attempts.map((a) => {
    const correctAnswer = questionMap.get(a.question_id)
    if (correctAnswer === undefined) {
      throw new PublicError(`Question ID ${a.question_id} not found in quiz for lesson ${lessonId}`, { status: 400, code: 'VALIDATION' })
    }
    return {
      question_id: a.question_id,
      selected_option: a.selected_option,
      is_correct: a.selected_option === correctAnswer,
    }
  })

  const correctCount = validatedAttempts.filter((a) => a.is_correct).length
  const scorePercentage = Math.round((correctCount / totalQuestions) * 100)

  const xpConfig = await getRuntimeXpValues(supabase)

  let totalXpToAward = 0
  let isFirstAttempt = false

  // Attempt atomic execution via PostgreSQL RPC record_lesson_quiz_completion.
  // The RPC returns a jsonb envelope; narrow it explicitly rather than casting the
  // client, so the typed data layer stays free of escape-hatch casts (B8-G).
  let rpcSuccess = false
  try {
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

    const envelope =
      rpcData && typeof rpcData === 'object' && !Array.isArray(rpcData)
        ? (rpcData as Record<string, unknown>)
        : null

    if (!rpcError && envelope && envelope.success === true) {
      rpcSuccess = true
      totalXpToAward = typeof envelope.total_xp_awarded === 'number' ? envelope.total_xp_awarded : 0
      isFirstAttempt = Boolean(envelope.is_first_attempt)
    }
  } catch {
    rpcSuccess = false
  }

  // Fallback path when running in environments without the RPC (e.g. unit mocks)
  if (!rpcSuccess) {
    const insertRows = validatedAttempts.map((a) => ({
      user_id: userId,
      lesson_id: lessonId,
      question_id: a.question_id,
      selected_option: a.selected_option,
      is_correct: a.is_correct,
    }))

    const { error: attemptsInsertError } = await supabase
      .from('quiz_attempts')
      .insert(insertRows)

    if (attemptsInsertError) throw attemptsInsertError

    const { data: progress, error: progressFetchError } = await supabase
      .from('user_lesson_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('lesson_id', lessonId)
      .maybeSingle()

    if (progressFetchError) throw progressFetchError

    isFirstAttempt = !progress || progress.quiz_attempts === 0

    const { data: existingQuizEvents } = await supabase
      .from('xp_events')
      .select('xp_amount')
      .eq('user_id', userId)
      .eq('source_type', 'quiz_correct')
      .eq('source_id', lessonId)

    const alreadyAwardedXp = existingQuizEvents?.reduce((sum, e) => sum + e.xp_amount, 0) ?? 0
    const maxPossibleXp = correctCount * xpConfig.QUIZ_CORRECT
    const incrementalXp = Math.max(0, maxPossibleXp - alreadyAwardedXp)

    let perfectBonusXp = 0
    if (isFirstAttempt && correctCount === totalQuestions) {
      const hasBonus = await hasXpEvent(supabase, userId, 'quiz_bonus', lessonId)
      if (!hasBonus) {
        perfectBonusXp = xpConfig.QUIZ_PERFECT_BONUS
      }
    }

    totalXpToAward = incrementalXp + perfectBonusXp

    await completeLesson(
      supabase,
      userId,
      lessonId,
      scorePercentage,
      totalXpToAward
    )

    if (incrementalXp > 0) {
      await awardXp(
        supabase,
        userId,
        'quiz_correct',
        incrementalXp,
        lessonId
      )
    }

    if (perfectBonusXp > 0) {
      await awardXp(
        supabase,
        userId,
        'quiz_bonus',
        perfectBonusXp,
        lessonId
      )
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

    // Dispatch quiz.completed
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

    // Dispatch lesson.completed
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

    const { data: userProgress } = await supabase
      .from('user_lesson_progress')
      .select('lesson_id, status')
      .eq('user_id', userId)

    totalCompletedLessons = userProgress?.filter((p) => p.status === 'completed').length || 0

    // Phase 7: Check and activate referral reward if this is the learner's first completed lesson
    if (totalCompletedLessons === 1) {
      try {
        const { onFirstLessonCompletedReferralCheck } = await import('../referral/referral-service')
        await onFirstLessonCompletedReferralCheck(supabase, userId)
      } catch (refErr) {
        console.warn('[lessons-db] Referral activation check warning:', refErr)
      }
    }

    if (totalCompletedLessons > 0 && totalCompletedLessons % 10 === 0) {
      const moduleIndex = Math.floor(totalCompletedLessons / 10)

      await globalNotificationDispatcher.dispatch({
        id: `module-complete-${userId}-${moduleIndex}`,
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
          moduleName: `Module ${moduleIndex}`,
          moduleSlug: `module-${moduleIndex}`,
          xpBonusEarned: 200,
        },
      })
    }
  } catch (modErr) {
    console.warn('[lessons-db] Notification dispatch warning:', modErr)
  }

  return {
    success: true,
    isCompleted: true,
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

