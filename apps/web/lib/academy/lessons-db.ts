import { readFile } from 'fs/promises'
import path from 'path'
import { verifyTheoryReadEngagement, XP_VALUES, getRuntimeXpValues } from '../xp'
import { updateUserStreak } from '../streaks-db'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../supabase'
import { createServiceRoleClient } from '../supabase'
import { awardXp, hasXpEvent } from '../xp-service'
import { completeLesson } from '../lessons-completion-service'

export interface UserLessonProgressRecord {
  user_id: string
  lesson_id: string
  completed: boolean
  completed_at: string | null
  quiz_score: number | null
  quiz_attempts: number
  reflection_text: string | null
  updated_at: string
}

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
  return data as unknown as UserLessonProgressRecord
}

export async function getUserCompletedLessonIds(userId: string): Promise<string[]> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('user_lesson_progress')
    .select('lesson_id')
    .eq('user_id', userId)
    .eq('status', 'completed')

  if (error || !data) return []
  return (data as unknown as { lesson_id: string }[]).map((r) => r.lesson_id)
}

export async function upsertUserLessonProgress(
  record: Partial<UserLessonProgressRecord> & { user_id: string; lesson_id: string }
): Promise<UserLessonProgressRecord | null> {
  const supabase = createServiceRoleClient()
  const now = new Date().toISOString()
  const { data, error } = await (supabase
    .from('user_lesson_progress') as unknown as DBChain)
    .upsert(
      {
        ...record,
        updated_at: now,
      },
      { onConflict: 'user_id,lesson_id' }
    )
    .select()
    .single()

  if (error || !data) {
    console.error('[lessons-db] Error upserting lesson progress:', error)
    return null
  }
  return data as unknown as UserLessonProgressRecord
}

type ProgressRow = Database['public']['Tables']['user_lesson_progress']['Row']
type ReflectionRow = Database['public']['Tables']['reflections']['Row']

interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown }>
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
  const { data: progress, error: fetchError } = (await (supabase
    .from('user_lesson_progress') as unknown as DBChain)
    .select('*')
    .eq('user_id', userId)
    .eq('lesson_id', lessonId)
    .maybeSingle()) as unknown as { data: ProgressRow | null; error: unknown }

  if (fetchError) throw fetchError

  if (existingRead || progress?.theory_read_at) {
    return { success: true, xpEarned: 0, message: 'Theory already read.' }
  }

  const xpConfig = await getRuntimeXpValues(supabase)
  const now = new Date().toISOString()
  const newStatus = progress?.status === 'completed' ? 'completed' : 'in_progress'
  const newXpEarned = (progress?.xp_earned ?? 0) + xpConfig.THEORY_READ

  const { error: progressError } = await (supabase
    .from('user_lesson_progress') as unknown as DBChain)
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
    throw new Error(verifyResult.reason || 'Engagement threshold not met.')
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
    throw new Error('Attempts array cannot be empty')
  }

  let lesson
  try {
    const filePath = path.join(DIST_LESSONS_DIR, `${lessonId}.json`)
    const raw = await readFile(filePath, 'utf-8')
    lesson = JSON.parse(raw)
  } catch {
    throw new Error(`Lesson content file not found for ${lessonId}`)
  }

  const quizBlock = lesson?.blocks?.find((b: { type: string }) => b.type === 'quiz')
  if (!quizBlock) {
    throw new Error(`Quiz block not found in lesson content for ${lessonId}`)
  }

  const quizQuestions = quizBlock.questions || []
  const questionMap = new Map<string, number>()
  for (const q of quizQuestions) {
    questionMap.set(q.id, q.correctAnswer)
  }

  const validatedAttempts = attempts.map((a) => {
    const correctAnswer = questionMap.get(a.question_id)
    if (correctAnswer === undefined) {
      throw new Error(`Question ID ${a.question_id} not found in quiz for lesson ${lessonId}`)
    }
    return {
      question_id: a.question_id,
      selected_option: a.selected_option,
      is_correct: a.selected_option === correctAnswer,
    }
  })

  const correctCount = validatedAttempts.filter((a) => a.is_correct).length
  const scorePercentage = Math.round((correctCount / totalQuestions) * 100)

  const insertRows = validatedAttempts.map((a) => ({
    user_id: userId,
    lesson_id: lessonId,
    question_id: a.question_id,
    selected_option: a.selected_option,
    is_correct: a.is_correct,
  }))

  const { error: attemptsInsertError } = await (supabase
    .from('quiz_attempts') as unknown as DBChain)
    .insert(insertRows)

  if (attemptsInsertError) throw attemptsInsertError

  const { data: progress, error: progressFetchError } = (await (supabase
    .from('user_lesson_progress') as unknown as DBChain)
    .select('*')
    .eq('user_id', userId)
    .eq('lesson_id', lessonId)
    .maybeSingle()) as unknown as { data: ProgressRow | null; error: unknown }

  if (progressFetchError) throw progressFetchError

  const isFirstAttempt = !progress || progress.quiz_attempts === 0

  const xpConfig = await getRuntimeXpValues(supabase)

  const { data: existingQuizEvents } = await (supabase
    .from('xp_events') as unknown as DBChain)
    .select('xp_amount')
    .eq('user_id', userId)
    .eq('source_type', 'quiz_correct')
    .eq('source_id', lessonId) as unknown as { data: { xp_amount: number }[] | null }

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

  const totalXpToAward = incrementalXp + perfectBonusXp

  await completeLesson(
    supabase,
    userId,
    lessonId,
    scorePercentage,
    totalXpToAward
  )

  if (incrementalXp > 0) {
    try {
      await awardXp(
        supabase,
        userId,
        'quiz_correct',
        incrementalXp,
        lessonId
      )
    } catch (xpError) {
      console.error(`[lessons-db] Error logging quiz_correct XP:`, xpError)
    }
  }

  if (perfectBonusXp > 0) {
    try {
      await awardXp(
        supabase,
        userId,
        'quiz_bonus',
        perfectBonusXp,
        lessonId
      )
    } catch (bonusError) {
      console.error(`[lessons-db] Error logging quiz_bonus XP:`, bonusError)
    }
  }

  await updateUserStreak(supabase, userId)

  try {
    const { data: userProgress } = await (supabase
      .from('user_lesson_progress') as unknown as DBChain)
      .select('lesson_id, status')
      .eq('user_id', userId) as unknown as { data: { lesson_id: string; status: string }[] | null }

    const completedCount = userProgress?.filter((p) => p.status === 'completed').length || 0
    if (completedCount > 0 && completedCount % 10 === 0) {
      const moduleIndex = Math.floor(completedCount / 10)
      const { data: userRec } = await (supabase
        .from('users') as unknown as DBChain)
        .select('email, name')
        .eq('id', userId)
        .maybeSingle() as unknown as { data: { email: string; name: string | null } | null }

      const { globalNotificationDispatcher } = await import('../notifications/dispatcher')
      const { initializeNotificationConnectors } = await import('../notifications/events/connectors')
      initializeNotificationConnectors()

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
    console.warn('[lessons-db] Module complete notification dispatch warning:', modErr)
  }

  return {
    success: true,
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
  const { data: existing, error: selectError } = (await (supabase
    .from('reflections') as unknown as DBChain)
    .select('*')
    .eq('user_id', userId)
    .eq('lesson_id', lessonId)
    .maybeSingle()) as unknown as { data: ReflectionRow | null; error: unknown }

  if (selectError) throw selectError

  const xpConfig = await getRuntimeXpValues(supabase)
  const xpAlreadyAwarded = await hasXpEvent(supabase, userId, 'reflection', lessonId)
  const isFirstSubmission = !existing
  let result

  if (isFirstSubmission) {
    const { data: inserted, error: insertError } = (await (supabase
      .from('reflections') as unknown as DBChain)
      .insert({
        user_id: userId,
        lesson_id: lessonId,
        content,
        is_public: isPublic,
      })
      .select()
      .single()) as unknown as { data: ReflectionRow | null; error: unknown }

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

      const { data: progress } = (await (supabase
        .from('user_lesson_progress') as unknown as DBChain)
        .select('*')
        .eq('user_id', userId)
        .eq('lesson_id', lessonId)
        .maybeSingle()) as unknown as { data: ProgressRow | null; error: unknown }

      if (progress) {
        await (supabase
          .from('user_lesson_progress') as unknown as DBChain)
          .update({
            xp_earned: progress.xp_earned + xpConfig.REFLECTION_SUBMITTED,
          })
          .eq('user_id', userId)
          .eq('lesson_id', lessonId)
      }
    }
  } else {
    const { data: updated, error: updateError } = (await (supabase
      .from('reflections') as unknown as DBChain)
      .update({
        content,
        is_public: isPublic,
      })
      .eq('id', existing.id)
      .select()
      .single()) as unknown as { data: ReflectionRow | null; error: unknown }

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

